import { chmod, cp, link as hardLink, lstat, mkdir, readFile, readdir, rename, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { renderHomeResult } from "../src/home-command.ts";
import { initializeInstallation, readInstallation, type InstallationDependencies } from "../src/home-installation.ts";
import { tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

function boundary(root: string, ambient: string): { held: CliBoundary; out: Buffer[]; err: Buffer[] } {
  const out: Buffer[] = [], err: Buffer[] = [];
  return {
    out, err,
    held: {
      cwd: root, env: { BOT_HOME: ambient }, stdinIsTTY: true, stderrIsTTY: false,
      readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { out.push(Buffer.from(bytes)); },
      stderr: (bytes) => { err.push(Buffer.from(bytes)); },
      clock: { milliseconds: () => 0, timestamp: () => "2026-09-06T12:00:00.000Z",
        setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
        clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
    },
  };
}

async function invoke(root: string, ambient: string, args: string[]) {
  const capture = boundary(root, ambient);
  const code = await main(args, capture.held);
  return { code, out: Buffer.concat(capture.out).toString(), err: Buffer.concat(capture.err).toString() };
}

async function deepHome(root: string, target: number, escaped = false): Promise<string> {
  let path = join(root, escaped ? 'q"\\q' : "home");
  while (target - Buffer.byteLength(path) > 201) path = join(path, "d".repeat(200));
  path = join(path, "d".repeat(target - Buffer.byteLength(path) - 1));
  expect(Buffer.byteLength(path)).toBe(target);
  await mkdir(path, { recursive: true });
  await chmod(path, 0o700);
  return path;
}

test("home show is explicit, read-only, and its JSON aliases agree", async () => {
  const { root } = await roots.scratch("bot-home-show-");
  const ambient = join(root, "ambient"), home = join(root, "selected");
  const before = await readdir(root);
  const absent = await invoke(root, ambient, ["home", "show", "--home", "selected", "-j"]);
  expect(absent).toMatchObject({ code: 0, err: "" });
  expect(JSON.parse(absent.out)).toEqual({ schemaVersion: 1, kind: "bot.home.show",
    data: { home, initialized: false } });
  expect(await readdir(root)).toEqual(before);
  expect(await invoke(root, ambient, ["home", "show", "--home", "missing/selected", "-j"]))
    .toMatchObject({ code: 0, err: "" });
  expect(await readdir(root)).toEqual(before);
  expect(await invoke(root, ambient, ["home", "show", "--home", "selected", "--json"])).toEqual(absent);
  for (const args of [[], ["--home"], ["--home", ""], ["--home", "a", "--home", "b"]]) {
    expect((await invoke(root, ambient, ["home", "show", ...args])).code).toBe(2);
  }
  expect((await invoke(root, home, ["home", "show", "-j"])).code).toBe(2);
  await expect(lstat(ambient)).rejects.toMatchObject({ code: "ENOENT" });
});

test("home init follows ordinary unsupported-command behavior", async () => {
  const { root } = await roots.scratch("bot-home-init-unsupported-");
  const result = await invoke(root, join(root, "ambient"), ["home", "init", "--home", join(root, "selected"), "-j"]);
  expect(result.code).toBe(2);
  expect(result.out).toBe("");
  expect(result.err).toMatch(/^request-invalid  home\n  Use /u);
});

test("the initializer creates private canonical bytes and repeats without touching them", async () => {
  const { root } = await roots.scratch("bot-home-init-");
  const home = join(root, "selected");
  const first = await initializeInstallation(home);
  expect(first.installationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const record = join(home, "installation.json");
  expect((await stat(home)).mode & 0o777).toBe(0o700);
  expect((await stat(record)).mode & 0o777).toBe(0o600);
  expect(await readFile(record, "utf8")).toBe(`${JSON.stringify({ schemaVersion: 1, kind: "bot.installation", data: { id: first.installationId } })}\n`);
  const before = await stat(record);
  const repeated = await initializeInstallation(home);
  expect(repeated).toEqual(first);
  const after = await stat(record);
  expect({ size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs }).toEqual({ size: before.size, mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs });
});

test("the longest admitted escaped path fits every initialized result", async () => {
  const { root } = await roots.scratch("bot-home-result-edge-");
  const id = "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8";
  const fits = (path: string): boolean => [false, true]
    .every((json) => renderHomeResult(path, { initialized: true, installationId: id }, json).exit === 0);
  let target = 4_025;
  while (!fits(`${"x".repeat(target - 4)}q"\\q`)) target -= 1;
  const home = await deepHome(root, target, true);
  expect(fits(home)).toBe(true);
  expect(fits(`${home}x`)).toBe(false);
  const identity = (await initializeInstallation(home)).installationId;
  for (const args of [["home", "show", "--home", home], ["home", "show", "--home", home, "-j"]]) {
    const result = await invoke(root, "", args);
    expect(result).toMatchObject({ code: 0, err: "" });
    expect(result.out).toContain(identity);
  }
  for (const json of [false, true]) {
    const result = renderHomeResult(home, { initialized: true, installationId: identity }, json);
    expect(result.exit).toBe(0);
    expect(result.stdout.length).toBeLessThanOrEqual(4_096);
    if (json) expect(JSON.parse(result.stdout.toString())).toMatchObject({ data: { home } });
  }
});

test("an identity-less valid home repeats the held-parent synchronization prerequisite", async () => {
  const { root } = await roots.scratch("bot-home-parent-sync-");
  const home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  let calls = 0;
  const dependencies: InstallationDependencies = {
    syncParent: () => { calls += 1; return Promise.reject(new Error("parent sync failed")); },
  };
  await expect(initializeInstallation(home, dependencies)).rejects.toMatchObject({ exit: 5 });
  await expect(initializeInstallation(home, dependencies)).rejects.toMatchObject({ exit: 5 });
  expect(calls).toBe(2);
  await expect(lstat(join(home, "installation.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readdir(home)).toEqual([]);
});

test("initialization waits for held-parent synchronization before it creates a candidate", async () => {
  const { root } = await roots.scratch("bot-home-parent-pending-");
  const home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  let release = (): void => undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let settled = false;
  const result = initializeInstallation(home, { syncParent: () => pending }).finally(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  expect(await readdir(home)).toEqual([]);
  release();
  await expect(result).resolves.toMatchObject({ initialized: true });
});

test("home reading and initialization reject insecure or malformed existing state without repair", async () => {
  const { root } = await roots.scratch("bot-home-invalid-");
  const home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  const record = join(home, "installation.json");
  await writeFile(record, "{}\n", { mode: 0o600 });
  await expect(readInstallation(home)).rejects.toMatchObject({ exit: 5 });
  await expect(initializeInstallation(home)).rejects.toMatchObject({ exit: 5 });
  const result = await invoke(root, join(root, "ambient"), ["home", "show", "--home", home, "-j"]);
  expect(result.code).toBe(5);
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed", operation: "home.show" } });
  expect(await readFile(record, "utf8")).toBe("{}\n");
  await chmod(record, 0o644);
  expect((await invoke(root, join(root, "ambient"), ["home", "show", "--home", home])).code).toBe(5);
  expect((await stat(record)).mode & 0o777).toBe(0o644);
});

test("the reader accepts closed JSON formatting without changing its bytes", async () => {
  const { root } = await roots.scratch("bot-home-json-format-");
  const home = join(root, "selected"), record = join(home, "installation.json");
  await mkdir(home, { mode: 0o700 });
  const bytes = `{ "kind": "bot.installation", "data": { "id": "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" }, "schemaVersion": 1}\n`;
  await writeFile(record, bytes, { mode: 0o600 });
  await expect(readInstallation(home)).resolves.toMatchObject({ initialized: true,
    installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" });
  expect(await readFile(record, "utf8")).toBe(bytes);
});

test("strict installation reading rejects links, file types, bounds, and closed-shape violations", async () => {
  const { root } = await roots.scratch("bot-home-strict-");
  const validId = "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8";
  const invalid = [
    "{\"schemaVersion\":1,\"schemaVersion\":1,\"kind\":\"bot.installation\",\"data\":{\"id\":\"018f2f4a-52f8-4c81-9b35-6ad2acdb70d8\"}}\n",
    `${JSON.stringify({ schemaVersion: 2, kind: "bot.installation", data: { id: validId } })}\n`,
    `${JSON.stringify({ schemaVersion: 1, kind: "bot.installation", data: { id: validId, extra: true } })}\n`,
    `${JSON.stringify({ schemaVersion: 1, kind: "bot.installation", data: { id: validId.toUpperCase() } })}\n`,
    "x".repeat(1_025),
  ];
  for (const [index, bytes] of invalid.entries()) {
    const home = join(root, `invalid-${String(index)}`);
    await mkdir(home, { mode: 0o700 });
    await writeFile(join(home, "installation.json"), bytes, { mode: 0o600 });
    expect((await invoke(root, join(root, "ambient"), ["home", "show", "--home", home])).code).toBe(5);
  }
  const target = join(root, "target");
  await writeFile(target, `${JSON.stringify({ schemaVersion: 1, kind: "bot.installation", data: { id: validId } })}\n`, { mode: 0o600 });
  const linked = join(root, "linked");
  await mkdir(linked, { mode: 0o700 });
  await symlink(target, join(linked, "installation.json"));
  expect((await invoke(root, join(root, "ambient"), ["home", "show", "--home", linked])).code).toBe(5);
  const typed = join(root, "typed");
  await mkdir(join(typed, "installation.json"), { recursive: true, mode: 0o700 });
  await chmod(typed, 0o700);
  expect((await invoke(root, join(root, "ambient"), ["home", "show", "--home", typed])).code).toBe(5);
  const broad = join(root, "broad");
  await mkdir(broad, { mode: 0o755 });
  await chmod(broad, 0o755);
  await expect(initializeInstallation(broad)).rejects.toMatchObject({ exit: 5 });
  expect(await readdir(broad)).toEqual([]);
  const alias = join(root, "home-link");
  await symlink(linked, alias);
  expect(await invoke(root, join(root, "ambient"), ["home", "show", "--home", alias])).toMatchObject({ code: 5, out: "" });
});

test("moving and metadata-preserving copying retain the stored identity", async () => {
  const { root } = await roots.scratch("bot-home-retained-");
  const source = join(root, "source");
  const id = (await initializeInstallation(source)).installationId;
  const moved = join(root, "moved");
  await rename(source, moved);
  expect((JSON.parse((await invoke(root, "", ["home", "show", "--home", moved, "-j"])).out) as { data: { installationId: string } }).data.installationId).toBe(id);
  const copied = join(root, "copied");
  await cp(moved, copied, { recursive: true, preserveTimestamps: true });
  await chmod(copied, 0o700);
  await chmod(join(copied, "installation.json"), 0o600);
  expect((await initializeInstallation(copied)).installationId).toBe(id);
});

test("a cleanup failure still attempts home-directory synchronization", async () => {
  const { root } = await roots.scratch("bot-home-finalization-");
  const home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  let synced = 0;
  await expect(initializeInstallation(home, {
    removeTemporary: () => Promise.reject(new Error("cleanup failed")),
    syncHome: () => { synced += 1; return Promise.resolve(); },
  })).rejects.toMatchObject({ exit: 5, published: true });
  expect(synced).toBe(1);
  await expect(readInstallation(home)).resolves.toMatchObject({ initialized: true });
});

test("candidate and rejected link failures are retryable when nothing was published", async () => {
  const { root } = await roots.scratch("bot-home-failure-class-");
  const first = join(root, "candidate"), second = join(root, "link"), third = join(root, "link-close");
  await Promise.all([first, second, third].map((path) => mkdir(path, { mode: 0o700 })));
  await expect(initializeInstallation(first, { syncFile: () => Promise.reject(new Error("temporary write failure")) }))
    .rejects.toMatchObject({ exit: 4, published: false });
  await expect(initializeInstallation(second, { link: () => Promise.reject(new Error("temporary link failure")) }))
    .rejects.toMatchObject({ exit: 4, published: false });
  await expect(initializeInstallation(third, {
    link: () => Promise.reject(new Error("temporary link failure")),
    closeHome: async (directory) => { await directory.close(); throw new Error("close result lost"); },
  })).rejects.toMatchObject({ exit: 5, published: false });
  expect(await readdir(first)).toEqual([]);
  expect(await readdir(second)).toEqual([]);
  expect(await readdir(third)).toEqual([]);
});

test("capabilities advertise only the read-only explicit-home contract", async () => {
  const { root } = await roots.scratch("bot-home-capabilities-");
  const result = await invoke(root, join(root, "inaccessible"), ["capabilities", "-j"]);
  expect(result.code).toBe(0);
  const commands = (JSON.parse(result.out) as { data: { commands: Record<string, unknown>[] } }).data.commands;
  expect(commands.find((held) => held["operation"] === "home.init")).toBeUndefined();
  const descriptor = commands.find((held) => held["operation"] === "home.show") as { options: Record<string, unknown>[] };
  expect(descriptor).toBeDefined();
  expect(descriptor.options.find((option) => option["name"] === "--home")).toMatchObject({ required: true, repeatable: false, type: "path" });
});

test("the mkdir loser deterministically reopens the winner's private home", async () => {
  const { root } = await roots.scratch("bot-home-mkdir-loser-"), home = join(root, "selected");
  let release = (): void => undefined, arrived = (): void => undefined;
  const winnerCreated = new Promise<void>((resolve) => { release = resolve; });
  const loserWaiting = new Promise<void>((resolve) => { arrived = resolve; });
  const loser = initializeInstallation(home, { createHome: async (entry) => { arrived(); await winnerCreated; await mkdir(entry, { mode: 0o700 }); } });
  await loserWaiting;
  const winner = initializeInstallation(home, { createHome: async (entry) => { await mkdir(entry, { mode: 0o700 }); release(); } });
  const [loserResult, winnerResult] = await Promise.all([loser, winner]);
  expect(loserResult.installationId).toBe(winnerResult.installationId);
});

test("the link loser deterministically returns the winner rather than its candidate", async () => {
  const { root } = await roots.scratch("bot-home-link-loser-"), home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  let release = (): void => undefined, arrived = (): void => undefined;
  const winnerLinked = new Promise<void>((resolve) => { release = resolve; });
  const loserWaiting = new Promise<void>((resolve) => { arrived = resolve; });
  const loser = initializeInstallation(home, { link: async (source, destination) => { arrived(); await winnerLinked; await hardLink(source, destination); } });
  await loserWaiting;
  const winner = initializeInstallation(home, { link: async (source, destination) => { await hardLink(source, destination); release(); } });
  const [loserResult, winnerResult] = await Promise.all([loser, winner]);
  expect(loserResult.installationId).toBe(winnerResult.installationId);
});

test("a concurrent show sees absence while a complete candidate waits before publication", async () => {
  const { root } = await roots.scratch("bot-home-show-race-"), home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  let release = (): void => undefined, arrived = (): void => undefined;
  const waiting = new Promise<void>((resolve) => { arrived = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const initialization = initializeInstallation(home, { interrupt: async (phase) => { if (phase === "before-link") { arrived(); await barrier; } } });
  await waiting;
  await expect(readInstallation(home)).resolves.toEqual({ initialized: false });
  expect((await readdir(home)).some((name) => name === "installation.json")).toBe(false);
  release();
  await expect(initialization).resolves.toMatchObject({ initialized: true });
});

test("production identity storage uses no descriptor namespace path", async () => {
  const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
  const names = (await readdir(sourceRoot)).filter((name) => name.endsWith(".ts"));
  const sources = await Promise.all(names.map((name) => readFile(join(sourceRoot, name), "utf8")));
  const production = sources.join("\n");
  expect(production).not.toMatch(/\/proc\/self\/fd|\/dev\/fd|directoryEntry|held-directory/u);
});

test("a missing home is reported only after its canonical parent stays stable", async () => {
  const { root } = await roots.scratch("bot-home-missing-race-");
  const parent = join(root, "parent"), displaced = join(root, "displaced"), home = join(parent, "home");
  await mkdir(parent);
  await expect(readInstallation(home, { afterHomeObservation: async () => {
    await rename(parent, displaced); await mkdir(parent);
  } })).rejects.toMatchObject({ exit: 5, causeCode: "parent-changed", published: false });
  await expect(lstat(home)).rejects.toMatchObject({ code: "ENOENT" });
});

test("a replaced home fails final-object identity validation", async () => {
  const { root } = await roots.scratch("bot-home-replaced-");
  const home = join(root, "home"), displaced = join(root, "displaced");
  await mkdir(home, { mode: 0o700 });
  await expect(readInstallation(home, { afterHomeObservation: async () => {
    await rename(home, displaced); await mkdir(home, { mode: 0o700 });
  } })).rejects.toMatchObject({ exit: 5, causeCode: "home-changed", published: false });
  expect(await readdir(home)).toEqual([]);
  expect(await readdir(displaced)).toEqual([]);
});

test("a record that disappears after observation is changed state rather than absence", async () => {
  const { root } = await roots.scratch("bot-home-record-race-"), home = join(root, "home");
  await mkdir(home, { mode: 0o700 });
  await initializeInstallation(home);
  await expect(readInstallation(home, { afterRecordObservation: async (record) => { await rename(record, `${record}.moved`); } }))
    .rejects.toMatchObject({ exit: 5, causeCode: "record-changed", published: false });
});

test("a held-home close failure after linking retains uncertain-publication metadata", async () => {
  const { root } = await roots.scratch("bot-home-close-after-link-"), home = join(root, "selected");
  await expect(initializeInstallation(home, { closeHome: async (directory) => {
    await directory.close(); throw new Error("close result lost");
  } })).rejects.toMatchObject({ exit: 5, published: true, causeCode: "close-failed" });
  await expect(readInstallation(home)).resolves.toMatchObject({ initialized: true });
});

test.each([
  ["before-link", false, 4], ["after-link", true, 5], ["before-temporary-remove", true, 5], ["before-home-sync", true, 5],
] as const)("an interruption at %s preserves the publication boundary", async (phase, published, exit) => {
  const { root } = await roots.scratch(`bot-home-interrupt-${phase}-`);
  const home = join(root, "selected");
  await mkdir(home, { mode: 0o700 });
  await expect(initializeInstallation(home, {
    interrupt: (at) => at === phase ? Promise.reject(new Error(`interrupted ${phase}`)) : Promise.resolve(),
  })).rejects.toMatchObject({ exit, published });
  const entries = await readdir(home);
  expect(entries.includes("installation.json")).toBe(published);
  expect(entries.some((name) => name.startsWith(".bot-installation-"))).toBe(phase === "before-temporary-remove");
  if (published) {
    const shown = await invoke(root, join(root, "ambient"), ["home", "show", "--home", home, "-j"]);
    expect(shown.code).toBe(0);
    expect((JSON.parse(shown.out) as { data: { initialized: boolean } }).data.initialized).toBe(true);
  }
});

test("a malformed installation refuses a structured run before run or id publication", async () => {
  const { root } = await roots.scratch("bot-home-run-refusal-");
  const home = join(root, "selected"), flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true, mode: 0o700 });
  await chmod(home, 0o700);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  await writeFile(join(home, "installation.json"), "{}\n", { mode: 0o600 });
  const idFile = join(root, "run-id");
  const result = await invoke(root, home, ["run", "start", "review/main", "request", "--id-file", idFile, "-j"]);
  expect(result.code).toBe(5);
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed", operation: "run.start" } });
  await expect(lstat(join(home, "runs"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(idFile)).rejects.toMatchObject({ code: "ENOENT" });
});
