// The update swap has one recoverable gap: after the installed tree moves to
// its hidden old name and before the complete staged tree takes the installed
// name. This file drives a separate process to that exact boundary. The child
// cannot leave it until released, and this test kills it instead.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { CHILD_MS } from "./boundary.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const CHILD = fileURLToPath(new URL("./assembly-update-swap-child.ts", import.meta.url));
const UPDATED = "2026-08-02T12:00:00.000Z";
const ASSEMBLY_V2 = "---\nintelligence: default\n---\nReview v2.\n";
const FLOW = "---\ndescription: main flow\n---\n";
const WORK = "---\n---\nDo the new work.\n";
const CHECK = "#!/bin/sh\nexit 0\n";

type TreeEntry =
  | { path: string; kind: "directory" }
  | { path: string; kind: "file"; bytes: string; executable: boolean }
  | { path: string; kind: "link"; target: string };

async function identity(root: string): Promise<TreeEntry[]> {
  const found: TreeEntry[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      const held = await lstat(path);
      if (held.isDirectory()) {
        found.push({ path: relative, kind: "directory" });
        await walk(path, relative);
      } else if (held.isSymbolicLink()) {
        found.push({ path: relative, kind: "link", target: await readlink(path) });
      } else {
        found.push({ path: relative, kind: "file", bytes: (await readFile(path)).toString("base64"), executable: (held.mode & 0o111) !== 0 });
      }
    }
  }
  await walk(root, "");
  return found;
}

async function presentIdentity(path: string): Promise<TreeEntry[] | "absent"> {
  return existsSync(path) ? identity(path) : "absent";
}

function file(path: string, bytes: string, executable = false): TreeEntry {
  return { path, kind: "file", bytes: Buffer.from(bytes).toString("base64"), executable };
}

function expectedNew(source: string): TreeEntry[] {
  return [
    file(".bot-source", `${source}\n${UPDATED}\n`),
    file("ASSEMBLY.md", ASSEMBLY_V2),
    { path: "bin", kind: "directory" },
    file("bin/check", CHECK, true),
    { path: "flows", kind: "directory" },
    { path: "flows/main", kind: "directory" },
    file("flows/main/01-work.md", WORK),
    file("flows/main/FLOW.md", FLOW),
  ];
}

async function writeSource(root: string): Promise<void> {
  await mkdir(join(root, "flows/main"), { recursive: true });
  await mkdir(join(root, "bin"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), ASSEMBLY_V2),
    writeFile(join(root, "flows/main/FLOW.md"), FLOW),
    writeFile(join(root, "flows/main/01-work.md"), WORK),
    writeFile(join(root, "bin/check"), CHECK),
  ]);
  await chmod(join(root, "bin/check"), 0o755);
}

interface Ending { code: number | null; signal: NodeJS.Signals | null }
interface SwapPaths { installed: string; staged: string; aside: string }
interface CleanupEvidence {
  ending: Ending | undefined;
  readiness: string | undefined;
  listeners: { message: number; error: number; settlement: number } | undefined;
}

function cleanupEvidence(): CleanupEvidence {
  return { ending: undefined, readiness: undefined, listeners: undefined };
}

async function crashFixture(prefix: string): Promise<{
  root: string; home: string; source: string; env: NodeJS.ProcessEnv; paths: SwapPaths; old: TreeEntry[]; wanted: TreeEntry[];
}> {
  const held = await scratch(prefix);
  const source = await tree(join(held.root, "source"), "Review v1.");
  await writeFile(join(source, "old-only.txt"), "old bytes\n");
  const env = { ...process.env, BOT_HOME: held.home, XDG_CACHE_HOME: join(held.root, "cache") };
  const installed = spawnSync(process.execPath, [CLI, "assembly", "install", source, "--name", "review"], { env, cwd: held.root, encoding: "utf8" });
  expect({ status: installed.status, signal: installed.signal }, installed.stderr).toEqual({ status: 0, signal: null });

  const assemblies = join(held.home, "assemblies");
  const paths = {
    installed: join(assemblies, "review"),
    staged: join(assemblies, ".bot-update-review"),
    aside: join(assemblies, ".bot-old-review"),
  };
  const old = await identity(paths.installed);
  await rm(source, { recursive: true });
  await writeSource(source);
  return { ...held, source, env, paths, old, wanted: expectedNew(source) };
}

async function withCrashChild(
  env: NodeJS.ProcessEnv,
  cwd: string,
  paths: SwapPaths,
  evidence: CleanupEvidence,
  atBoundary: (child: ChildProcess, settlement: Promise<Ending>) => void | Promise<void>,
): Promise<void> {
  let readiness = "waiting";
  let childError: Error | undefined;
  let ready = (): void => {};
  const readinessMessage = new Promise<void>((resolve) => { ready = resolve; });
  let settle = (_value: Ending): void => {};
  const settlement = new Promise<Ending>((resolve) => { settle = resolve; });
  const onMessage = (message: unknown): void => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "assembly-update-aside") {
      readiness = "ready";
      ready();
    }
  };
  const onError = (error: Error): void => { childError = error; };
  const onSettlement = (code: number | null, signal: NodeJS.Signals | null): void => { settle({ code, signal }); };
  let settlementListening = false;
  let guard: ReturnType<typeof setTimeout> | undefined;

  const child = spawn(process.execPath, [CHILD, UPDATED], { env, cwd, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  try {
    child.on("close", onSettlement); settlementListening = true;
    child.on("message", onMessage);
    child.on("error", onError);
    guard = setTimeout(() => { readiness = "guard-expired"; child.kill("SIGKILL"); }, CHILD_MS);

    async function state(reason: string, ending?: Ending): Promise<Error> {
      return new Error(JSON.stringify({ reason, ending, readiness, childError: childError?.message,
        installed: await presentIdentity(paths.installed), staged: await presentIdentity(paths.staged), aside: await presentIdentity(paths.aside) }));
    }

    const reached = await Promise.race([
      readinessMessage.then(() => ({ kind: "ready" as const })),
      settlement.then((ending) => ({ kind: "settled" as const, ending })),
    ]);
    if (reached.kind === "settled") throw await state("child settled before readiness", reached.ending);
    await atBoundary(child, settlement);
  } finally {
    if (guard !== undefined) clearTimeout(guard);
    if (!settlementListening) {
      child.on("close", onSettlement); settlementListening = true;
      if (child.exitCode !== null || child.signalCode !== null) settle({ code: child.exitCode, signal: child.signalCode });
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    evidence.ending = await settlement;
    child.removeListener("message", onMessage);
    child.removeListener("error", onError);
    child.removeListener("close", onSettlement);
    evidence.readiness = readiness;
    evidence.listeners = {
      message: child.listenerCount("message"), error: child.listenerCount("error"), settlement: child.listenerCount("close"),
    };
  }
}

test("SIGKILL at the controlled swap boundary leaves exact recoverable old and staged trees", async () => {
  const fixture = await crashFixture("bot-assembly-update-kill-");
  const evidence = cleanupEvidence();
  await withCrashChild(fixture.env, fixture.root, fixture.paths, evidence, async (child, settlement) => {
    expect(await presentIdentity(fixture.paths.installed)).toBe("absent");
    expect(await presentIdentity(fixture.paths.aside)).toEqual(fixture.old);
    expect(await presentIdentity(fixture.paths.staged)).toEqual(fixture.wanted);
    child.kill("SIGKILL");
    expect(await settlement).toEqual({ code: null, signal: "SIGKILL" });
    expect(await presentIdentity(fixture.paths.installed)).toBe("absent");
    expect(await presentIdentity(fixture.paths.aside)).toEqual(fixture.old);
    expect(await presentIdentity(fixture.paths.staged)).toEqual(fixture.wanted);
    await rename(fixture.paths.aside, fixture.paths.installed);
    const capture: Capture = { out: [], err: [] };
    const listing = await lines(["assembly", "list"], boundaryFor(fixture.root, fixture.home, capture), capture, 0);
    expect(listing).toHaveLength(1);
    expect(listing[0]).toContain(`review  installed  from ${fixture.source}  updated `);
  });
}, 180_000);

test("a readiness-path assertion failure settles the child and removes every listener", async () => {
  const fixture = await crashFixture("bot-assembly-update-cleanup-");
  const evidence = cleanupEvidence();
  let reached = false;
  await expect(withCrashChild(fixture.env, fixture.root, fixture.paths, evidence, () => {
    reached = true;
    expect(false, "deliberate readiness assertion failure").toBe(true);
  })).rejects.toThrow("deliberate readiness assertion failure");
  expect(reached).toBe(true);
  expect(evidence).toEqual({
    ending: { code: null, signal: "SIGKILL" },
    readiness: "ready",
    listeners: { message: 0, error: 0, settlement: 0 },
  });
}, 180_000);

test("a fetch that fails leaves the installation untouched and nothing staged beside it", async () => {
  const held = await scratch("bot-assembly-update-fetch-fail-");
  const installed = join(held.home, "assemblies", "review");
  await tree(installed, "Review v1.");
  const source = `${await tree(join(held.root, "source"), "Somewhere.")}#gone`;
  await writeFile(join(installed, ".bot-source"), `${source}\n2026-08-01T09:12:44.000Z\n`);
  const before = await readFile(join(installed, "ASSEMBLY.md"), "utf8");

  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await expect(main(["assembly", "update", "review"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe(`path-missing  ${source}\n  Name a source folder that exists.\n`);
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toBe(before);
  expect(existsSync(join(installed, "flows", "main", "FLOW.md"))).toBe(true);
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual(["review"]);
});

test("a `.bot-old-` or `.bot-update-` tree a crash stranded is reclaimed by the next update of that assembly", async () => {
  const held = await scratch("bot-assembly-update-sweep-");
  const source = await tree(join(held.root, "source"), "Review v2.");
  const installed = join(held.home, "assemblies", "review");
  await tree(installed, "Review v1.");
  await writeFile(join(installed, ".bot-source"), `${source}\n2026-08-01T09:12:44.000Z\n`);
  await tree(join(held.home, "assemblies", ".bot-old-review"), "Stranded old.");
  await tree(join(held.home, "assemblies", ".bot-update-review"), "Stranded new.");

  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  expect(await lines(["assembly", "update", "review"], boundary, capture, 0))
    .toEqual([`review  installed  updated from ${source}`]);
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toContain("Review v2.");
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual(["review"]);
});
