import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { afterEach, expect, test } from "vitest";
import { isBusy } from "../src/busy.ts";
import { main, type CliBoundary } from "../src/cli.ts";
import { mapping } from "../src/model.ts";
import { currentRecord } from "./current-record.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-home-busy-"));
  roots.push(root);
  return root;
}

async function invoke(args: string[], cwd: string, ambient: string | undefined, environment: NodeJS.ProcessEnv = {}) {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd, env: { ...environment, ...(ambient === undefined ? {} : { BOT_HOME: ambient }) }, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock: {
      milliseconds: () => 0, timestamp: () => "2026-09-08T12:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
    },
  };
  const code = await main(args, boundary);
  return { code, out: Buffer.concat(stdout).toString(), err: Buffer.concat(stderr).toString() };
}

function jsonValue(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function runStart(run: string, workdir: string): Record<string, unknown> {
  return {
    record: 1, runtime: "0.0.1", ts: "2026-09-08T12:00:00.000Z", event: "run_start", run,
    assembly: "review", assembly_hash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: "a".repeat(64), bytes: 3, via: "argument" }, workdir,
  };
}

test("home busy renders idle and conservative busy readings without changing either home", async () => {
  const root = await scratch();
  const idleHome = join(root, "missing-home"), emptyHome = join(root, "empty-home");
  const busyHome = join(root, "selected-home"), ambient = join(root, "ambient-home");
  const platformBase = join(root, "platform"), platformHome = join(platformBase, "bot");
  await Promise.all([mkdir(emptyHome), mkdir(busyHome), mkdir(platformHome, { recursive: true })]);
  await writeFile(join(busyHome, "runs"), "not a directory\n");
  await writeFile(join(platformHome, "runs"), "not a directory\n");
  const before = await readFile(join(busyHome, "runs"));

  expect(await invoke(["home", "busy", "relative", "--home", "missing-home"], root, ambient))
    .toEqual({ code: 0, out: "Busy: no\n", err: "" });
  expect(await invoke(["home", "busy", "relative", "--home", "empty-home", "--json"], root, ambient))
    .toEqual({ code: 0, out: '{"schemaVersion":1,"kind":"bot.home.busy","data":{"busy":false}}\n', err: "" });
  expect(await invoke(["home", "busy", "relative", "--home", "selected-home"], root, ambient))
    .toEqual({ code: 0, out: "Busy: yes\n", err: "" });
  expect(await invoke(["home", "busy", "relative", "--home", "selected-home", "--json"], root, ambient))
    .toEqual({ code: 0, out: '{"schemaVersion":1,"kind":"bot.home.busy","data":{"busy":true}}\n', err: "" });
  expect(await invoke(["home", "busy", "relative", "-j"], root, busyHome))
    .toEqual({ code: 0, out: '{"schemaVersion":1,"kind":"bot.home.busy","data":{"busy":true}}\n', err: "" });
  expect(await invoke(["home", "busy", "relative"], root, undefined, { XDG_DATA_HOME: platformBase }))
    .toEqual({ code: 0, out: "Busy: yes\n", err: "" });
  expect(await readFile(join(busyHome, "runs"))).toEqual(before);
  await expect(lstat(idleHome)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readdir(emptyHome)).resolves.toEqual([]);
  await expect(isBusy(idleHome, join(root, "relative"))).resolves.toBe(false);
  await expect(isBusy(busyHome, join(root, "relative"))).resolves.toBe(true);
});

test("home busy resolves a valid live run from cwd and preserves legacy quiet answers", async () => {
  const root = await scratch();
  const home = join(root, "home"), owned = join(root, "owned"), unrelated = join(root, "unrelated");
  const run = "2026-09-08T12-00-00-live", runDirectory = join(home, "runs", run);
  await Promise.all([mkdir(owned), mkdir(unrelated), mkdir(runDirectory, { recursive: true })]);
  await writeFile(join(runDirectory, "record.jsonl"), currentRecord([runStart(run, owned)]));
  const release = lockSync(runDirectory, { realpath: false });
  try {
    expect(await invoke(["home", "busy", "owned", "--home", "home"], root, join(root, "ambient")))
      .toEqual({ code: 0, out: "Busy: yes\n", err: "" });
    expect(await invoke(["home", "busy", "owned", "--home", "home", "--json"], root, join(root, "ambient")))
      .toEqual({ code: 0, out: '{"schemaVersion":1,"kind":"bot.home.busy","data":{"busy":true}}\n', err: "" });
    expect(await invoke(["home", "busy", "unrelated", "--home", "home"], root, join(root, "ambient")))
      .toEqual({ code: 0, out: "Busy: no\n", err: "" });
    expect(await invoke(["home", "busy", "unrelated", "--home", "home", "-j"], root, join(root, "ambient")))
      .toEqual({ code: 0, out: '{"schemaVersion":1,"kind":"bot.home.busy","data":{"busy":false}}\n', err: "" });
    for (const [directory, code] of [["owned", 0], ["unrelated", 1]] as const) {
      const noun = await invoke(["home", "busy", directory, "--quiet", "--home", "home"], root, join(root, "ambient"));
      expect(noun).toEqual({ code, out: "", err: "" });
    }
  } finally {
    release();
  }
});

test("home busy rejects every malformed request before output", async () => {
  const root = await scratch(), home = join(root, "home");
  const malformed = [
    [], ["directory", "extra"], ["-directory"], ["directory", "--unknown"],
    ["directory", "--quiet", "--quiet"], ["directory", "--json", "--json"],
    ["directory", "--json", "-j"], ["directory", "--quiet", "--json"],
    ["directory", "--quiet", "-j"], ["directory", "--home"],
    ["directory", "--home", "--json"], ["directory", "--home", "a", "--home", "b"],
  ];
  for (const args of malformed) {
    const result = await invoke(["home", "busy", ...args], root, home);
    expect(result.code, args.join(" ")).toBe(2);
    expect(result.out, args.join(" ")).toBe("");
    expect(Buffer.byteLength(result.err), args.join(" ")).toBeLessThanOrEqual(2_049);
  }
  const json = await invoke(["home", "busy", "directory", "--quiet", "--json"], root, home);
  expect(jsonValue(json.err)).toMatchObject({ error: { code: "request-invalid", operation: "home.busy" } });
});

test("capabilities, help, and the specification publish home busy", async () => {
  const root = await scratch(), home = join(root, "home");
  const capabilities = await invoke(["capabilities", "-j"], root, home);
  const document = jsonValue(capabilities.out);
  if (!mapping(document) || !mapping(document["data"]) || !Array.isArray(document["data"]["commands"])) {
    throw new Error("Expected the capabilities document.");
  }
  const commands = document["data"]["commands"] as unknown[];
  const descriptor: unknown = commands.find((entry) => mapping(entry) && entry["operation"] === "home.busy");
  expect(descriptor).toMatchObject({ operation: "home.busy", command: ["home", "busy"], output: { kind: "bot.home.busy", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "reads", mutates: false, network: "never" });
  const help = await invoke(["home", "busy", "--help"], root, home);
  expect(help).toMatchObject({ code: 0, err: "" });
  expect(help.out).toContain("usage: bot home busy <directory>");
  expect(help.out).toContain("--quiet");
  const inspection = await readFile(new URL("../../specification/elements/inspection.md", import.meta.url), "utf8");
  expect(inspection).toContain("### `bot home busy <directory>`");
  expect(inspection).toContain("bot.home.busy");
  const conformance = await readFile(new URL("../../specification/conformance.md", import.meta.url), "utf8");
  expect(conformance).toMatch(/Home-busy tests prove/iu);
  const changelog = await readFile(new URL("../../specification/CHANGELOG.md", import.meta.url), "utf8");
  expect(changelog).toMatch(/Manual Bot ticket 0060 adds `bot home busy/iu);
});
