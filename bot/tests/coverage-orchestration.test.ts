import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { constants } from "node:os";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  coverageProducer,
  publishCoverageSummary,
  runCoverage,
  waitForClose,
} from "../scripts/run-coverage.mjs";
import { verifyCoverageSummary } from "../scripts/verify-coverage-summary.mjs";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const dimensions = (covered: number) => ({
  lines: { total: 2, covered, skipped: 0, pct: covered * 50 },
  statements: { total: 2, covered, skipped: 0, pct: covered * 50 },
  functions: { total: 2, covered, skipped: 0, pct: covered * 50 },
  branches: { total: 2, covered, skipped: 0, pct: covered * 50 },
});

async function fixture(): Promise<{ root: string; source: string; retained: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-coverage-run-"));
  roots.push(root);
  const source = join(root, "src");
  const retained = join(root, "coverage");
  await mkdir(source);
  await Promise.all([
    writeFile(join(source, "a.ts"), "export const a = 1;\n"),
    writeFile(join(source, "b.ts"), "export const b = 2;\n"),
  ]);
  return { root, source, retained };
}

function summary(root: string, covered: number): string {
  const value = dimensions(covered);
  return JSON.stringify({
    total: value,
    [join(root, "src/a.ts")]: value,
    [join(root, "src/b.ts")]: value,
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  return { promise, resolve: release };
}

async function absent(path: string): Promise<boolean> {
  return readFile(path).then(() => false, () => true);
}

test("overlapping coverage lifecycles keep owned reports private and publish complete summaries", async () => {
  const held = await fixture();
  const releases = [deferred(), deferred()];
  const ready = [deferred(), deferred()];
  const owned: string[] = [];
  let next = 0;
  const producer = async (reportsDirectory: string) => {
    const index = next;
    next += 1;
    owned.push(reportsDirectory);
    await writeFile(join(reportsDirectory, "coverage-summary.json"), summary(held.root, index + 1));
    ready[index]?.resolve();
    await releases[index]?.promise;
    return { code: 0, signal: null };
  };
  const options = { sourceRoot: held.source, retainedDirectory: held.retained, producer };

  const first = runCoverage(options);
  await ready[0]?.promise;
  const second = runCoverage(options);
  await ready[1]?.promise;
  const secondBytes = await readFile(join(owned[1] ?? "", "coverage-summary.json"));

  releases[0]?.resolve();
  await expect(first).resolves.toBe(0);
  expect(await readFile(join(owned[1] ?? "", "coverage-summary.json"))).toEqual(secondBytes);
  expect(JSON.parse(await readFile(join(held.retained, "coverage-summary.json"), "utf8"))).toMatchObject({ total: { lines: { covered: 1 } } });

  releases[1]?.resolve();
  await expect(second).resolves.toBe(0);
  expect(JSON.parse(await readFile(join(held.retained, "coverage-summary.json"), "utf8"))).toMatchObject({ total: { lines: { covered: 2 } } });
  await expect(Promise.all(owned.map(absent))).resolves.toEqual([true, true]);
  await expect(readdir(held.retained)).resolves.toEqual(["coverage-summary.json"]);
});

function realProducer(mode: "exit" | "signal", marker: string): {
  outcome: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  ready: Promise<void>;
  kill: () => void;
} {
  const program = mode === "exit"
    ? `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "written"); process.exit(37);`
    : `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "written"); process.send("ready"); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ["-e", program], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const ready = mode === "exit" ? Promise.resolve() : new Promise<void>((resolveReady) => child.once("message", () => { resolveReady(); }));
  return { outcome: waitForClose(child), ready, kill: () => { child.kill("SIGTERM"); } };
}

test.each([
  ["exit", 37],
  ["signal", 128 + constants.signals.SIGTERM],
] as const)("a real producer %s settles on close before cleanup and keeps the retained summary", async (mode, expected) => {
  const held = await fixture();
  await mkdir(held.retained);
  const prior = Buffer.from("prior summary\n");
  await writeFile(join(held.retained, "coverage-summary.json"), prior);
  const marker = join(held.root, `${mode}.marker`);
  let childClosed = false;
  let verified = false;
  let published = false;
  const child = realProducer(mode, marker);
  const producer = async () => child.outcome.then((outcome) => { childClosed = true; return outcome; });
  const diagnostics: string[] = [];
  const result = runCoverage({
    sourceRoot: held.source,
    retainedDirectory: held.retained,
    producer,
    verifier: () => { verified = true; return Promise.resolve({ files: 2 }); },
    publisher: () => { published = true; return Promise.resolve(); },
    cleanup: async (path) => {
      expect(childClosed).toBe(true);
      await rm(path, { recursive: true, force: true });
    },
    diagnostic: (message) => diagnostics.push(message),
  });
  await child.ready;
  if (mode === "signal") child.kill();

  await expect(result).resolves.toBe(expected);
  await expect(readFile(marker, "utf8")).resolves.toBe("written");
  await expect(readFile(join(held.retained, "coverage-summary.json"))).resolves.toEqual(prior);
  expect({ verified, published }).toEqual({ verified: false, published: false });
  expect(diagnostics).toEqual(mode === "signal" ? ["coverage producer failed: killed by SIGTERM"] : []);
});

test("a producer error remains pending until close before owned cleanup", async () => {
  const held = await fixture();
  const child = new EventEmitter();
  const listening = deferred();
  let cleaned = false;
  const diagnostics: string[] = [];
  const result = runCoverage({
    sourceRoot: held.source,
    retainedDirectory: held.retained,
    producer: () => {
      const outcome = waitForClose(child);
      listening.resolve();
      return outcome;
    },
    cleanup: async (path) => { cleaned = true; await rm(path, { recursive: true, force: true }); },
    diagnostic: (message) => diagnostics.push(message),
  });
  await listening.promise;
  child.emit("error", new Error("spawn refused"));
  await new Promise<void>((resolveTurn) => { setImmediate(resolveTurn); });
  expect(cleaned).toBe(false);
  child.emit("close", null, null);
  await expect(result).resolves.toBe(1);
  expect(cleaned).toBe(true);
  expect(diagnostics).toEqual(["coverage producer failed: spawn refused"]);
});

test("throwing output callbacks cannot bypass owned cleanup", async () => {
  const held = await fixture();
  let diagnosticCleanup = false;
  const signalResult = runCoverage({
    sourceRoot: held.source,
    retainedDirectory: held.retained,
    producer: () => Promise.resolve({ code: null, signal: "SIGTERM" }),
    cleanup: async (path) => { diagnosticCleanup = true; await rm(path, { recursive: true, force: true }); },
    diagnostic: () => { throw new Error("diagnostic refused"); },
  });
  await expect(signalResult).resolves.toBe(128 + constants.signals.SIGTERM);
  expect(diagnosticCleanup).toBe(true);

  let announcementCleanup = false;
  const announcementDiagnostics: string[] = [];
  const announced = runCoverage({
    sourceRoot: held.source,
    retainedDirectory: held.retained,
    producer: async (directory) => { await writeFile(join(directory, "coverage-summary.json"), summary(held.root, 2)); return { code: 0, signal: null }; },
    cleanup: async (path) => { announcementCleanup = true; await rm(path, { recursive: true, force: true }); throw new Error("cleanup after announcement refused"); },
    diagnostic: (message) => announcementDiagnostics.push(message),
    announcement: () => { throw new Error("announcement refused"); },
  });
  await expect(announced).rejects.toThrow("announcement refused");
  expect(announcementCleanup).toBe(true);
  expect(announcementDiagnostics).toEqual(["coverage cleanup failed: cleanup after announcement refused"]);
});

test("coverage wiring passes the owned directory to Vitest and its exact report to verification", async () => {
  const held = await fixture();
  const owned = join(held.root, "owned");
  await mkdir(owned);
  const calls: unknown[] = [];
  const outcome = await runCoverage({
    sourceRoot: held.source,
    retainedDirectory: held.retained,
    createOwnedDirectory: () => Promise.resolve(owned),
    producer: async (directory) => { calls.push(["producer", directory]); await writeFile(join(directory, "coverage-summary.json"), summary(held.root, 2)); return { code: 0, signal: null }; },
    verifier: (file, source) => { calls.push(["verifier", file, source]); return Promise.resolve({ files: 2 }); },
    publisher: () => Promise.resolve(),
  });
  expect(outcome).toBe(0);
  expect(calls).toEqual([
    ["producer", owned],
    ["verifier", join(owned, "coverage-summary.json"), held.source],
  ]);

  const spawned: unknown[] = [];
  const fakeChild = new EventEmitter();
  queueMicrotask(() => fakeChild.emit("close", 0, null));
  await expect(coverageProducer(owned, {
    workingDirectory: held.root,
    spawnChild: (command, args, options) => { spawned.push([command, args, options]); return fakeChild; },
  })).resolves.toEqual({ code: 0, signal: null });
  expect(spawned).toEqual([[process.execPath, [resolve(held.root, "node_modules/vitest/vitest.mjs"), "run", "--coverage", `--coverage.reportsDirectory=${owned}`], { cwd: held.root, stdio: "inherit" }]]);
  const packageFile = JSON.parse(await readFile(resolve(import.meta.dirname, "../package.json"), "utf8")) as unknown;
  expect(packageFile).toMatchObject({ scripts: { "test:coverage": "node scripts/run-coverage.mjs" } });
});

test("cleanup failure stays secondary to producer, verifier, and publication failures", async () => {
  const phases = [
    { name: "producer", producer: () => Promise.resolve({ code: 23, signal: null }), verifier: verifyCoverageSummary, publisher: publishCoverageSummary, expected: 23, changed: false },
    { name: "verification", producer: () => Promise.resolve({ code: 0, signal: null }), verifier: () => Promise.reject(new Error("bad inventory")), publisher: publishCoverageSummary, expected: 1, changed: false },
    { name: "publication", producer: () => Promise.resolve({ code: 0, signal: null }), verifier: verifyCoverageSummary, publisher: () => Promise.reject(new Error("copy refused")), expected: 1, changed: false },
    { name: "cleanup", producer: () => Promise.resolve({ code: 0, signal: null }), verifier: verifyCoverageSummary, publisher: publishCoverageSummary, expected: 1, changed: true },
  ];
  for (const phase of phases) {
    const held = await fixture();
    const owned = await mkdtemp(join(tmpdir(), "bot-coverage-owned-test-"));
    roots.push(owned);
    await writeFile(join(owned, "coverage-summary.json"), summary(held.root, 2));
    await mkdir(held.retained);
    await writeFile(join(held.retained, "coverage-summary.json"), "prior");
    const diagnostics: string[] = [];
    const code = await runCoverage({
      sourceRoot: held.source,
      retainedDirectory: held.retained,
      createOwnedDirectory: () => Promise.resolve(owned),
      producer: phase.producer,
      verifier: phase.verifier,
      publisher: phase.publisher,
      cleanup: () => Promise.reject(new Error("cleanup refused")),
      diagnostic: (message) => diagnostics.push(message),
    });
    expect(code, phase.name).toBe(phase.expected);
    expect(diagnostics.at(-1), phase.name).toBe("coverage cleanup failed: cleanup refused");
    const retained = await readFile(join(held.retained, "coverage-summary.json"), "utf8");
    expect(retained === "prior", phase.name).toBe(!phase.changed);
    if (phase.name === "verification") expect(diagnostics[0]).toBe("coverage verification failed: bad inventory");
    if (phase.name === "publication") expect(diagnostics[0]).toBe("coverage publication failed: copy refused");
  }
});

test("publication removes its staging file when rename fails", async () => {
  const held = await fixture();
  await mkdir(held.retained);
  const report = join(held.root, "summary.json");
  await writeFile(report, "new");
  await writeFile(join(held.retained, "coverage-summary.json"), "prior");
  await expect(publishCoverageSummary(report, held.retained, {
    renameFile: () => Promise.reject(new Error("rename refused")),
  })).rejects.toThrow("rename refused");
  await expect(readFile(join(held.retained, "coverage-summary.json"), "utf8")).resolves.toBe("prior");
  await expect(readdir(held.retained)).resolves.toEqual(["coverage-summary.json"]);
});

test("publication reports staging cleanup failure without replacing the rename failure", async () => {
  const held = await fixture();
  const owned = join(held.root, "owned-publication");
  await mkdir(owned);
  await writeFile(join(owned, "coverage-summary.json"), summary(held.root, 2));
  await mkdir(held.retained);
  await writeFile(join(held.retained, "coverage-summary.json"), "prior");
  const diagnostics: string[] = [];
  const longCleanupCause = "x".repeat(3_000);
  const code = await runCoverage({
    sourceRoot: held.source,
    retainedDirectory: held.retained,
    createOwnedDirectory: () => Promise.resolve(owned),
    producer: () => Promise.resolve({ code: 0, signal: null }),
    publisher: (report, retained) => publishCoverageSummary(report, retained, {
      renameFile: () => Promise.reject(new Error("rename refused")),
      removeFile: () => Promise.reject(new Error(longCleanupCause)),
    }),
    diagnostic: (message) => diagnostics.push(message),
  });
  expect(code).toBe(1);
  expect(diagnostics).toEqual([
    "coverage publication failed: rename refused",
    `coverage staging cleanup failed: ${longCleanupCause.slice(0, 2_048)}`,
  ]);
  await expect(readFile(join(held.retained, "coverage-summary.json"), "utf8")).resolves.toBe("prior");
  expect((await readdir(held.retained)).some((name) => name.startsWith(".coverage-summary-"))).toBe(true);
});
