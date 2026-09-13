// Ticket 0085 defect 2 — a stage holds ONE gate. The assertion source is
// stage.md "What a stage folder holds": "A folder holds one file of each kind.
// Two files whose name before the first dot is `before` is an error, as is more
// than one schema, as is a `gate` file beside a `gate/` folder." Two gate files
// is that same rule — `gate.sh` and `gate.py` share the name before the first
// dot — and gate.md says it plainly twice over: "A gate is an executable in the
// stage folder named `gate`" (singular), and "A stage has a `gate` file or a
// `gate/` folder."
//
// The defect this pins: validateGate refused the file-beside-folder case and
// then pushed EVERY entry of parts.gateFiles, so two gate files were accepted
// and both ran — in entries() order, into the same `checks/gate.txt` capture,
// so the record kept only whichever wrote last.
//
// The two legs below the red are the falsification the fix has to survive: the
// count is of GATES, not of entries. One `gate.sh` alone is one gate and runs;
// a `gate/` folder of three scripts is one gate and all three run, in order.
// A fix that counted entries would refuse both.
import { semanticCheck } from "./semantic-check.ts";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function realBoundary(root: string, home: string, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

/** A one-stage assembly whose gates are `gates`, in the stage folder or in `gate/`. */
async function gateAssembly(home: string, gates: Record<string, string>, folder: boolean): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  const gateDir = folder ? join(stage, "gate") : stage;
  await mkdir(gateDir, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    ...Object.entries(gates).map(([name, script]) => writeFile(join(gateDir, name), script)),
  ]);
  await Promise.all(Object.keys(gates).map((name) => chmod(join(gateDir, name), 0o755)));
}

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function gateChecks(events: Record<string, unknown>[]): Record<string, unknown>[] {
  return events.filter((event) => event["event"] === "check" && event["check"] === "gate");
}

async function scratch(prefix: string): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return { root, home: join(root, "home") };
}

test("two gate files in one stage is gate-conflict: `bot check` refuses naming the stage, a run refuses before it starts, and neither gate ever runs", async () => {
  const held = await scratch("bot-cli-two-gates-");
  // Both are perfectly runnable. The fault is not either file; it is that the
  // stage does not say which one is its gate.
  const witness = join(held.root, "ran");
  await gateAssembly(held.home, {
    "gate.sh": `#!/bin/sh\necho sh >> '${witness}'\nexit 0\n`,
    "gate.py": `#!/bin/sh\necho py >> '${witness}'\nexit 0\n`,
  }, false);

  const checkErr: Buffer[] = [];
  const { held: checking } = realBoundary(held.root, held.home, [], checkErr);
  await expect(semanticCheck([ "review/main"], checking)).resolves.toBe(2);
  expect(Buffer.concat(checkErr).toString()).toBe(
    "gate-conflict  flows/main/01-work\n  Keep one gate file, or one gate folder.\n",
  );

  // record.md: "a run refused before it starts produces none, because nothing
  // happened" — the assembly is malformed, so there is no runs directory and
  // no gate ever executed.
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held: running, faux } = realBoundary(held.root, held.home, stdout, stderr);
  faux.setResponses(writes("never used"));
  await expect(main(["run", "start", "review/main", "the request"], running)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("gate-conflict");
  // `runs/` empty rather than absent since ADR 0016: birth makes the run
  // directory before the assembly is read, and the refusal removes it again.
  await expect(readdir(join(held.home, "runs"))).resolves.toEqual([]);
  await expect(readFile(witness, "utf8")).rejects.toThrow();
});

test("one gate.sh alone is one gate: accepted, and it runs — the extension is for whoever reads the folder", async () => {
  const held = await scratch("bot-cli-one-gate-file-");
  await gateAssembly(held.home, { "gate.sh": "#!/bin/sh\necho 'looked at it'\nexit 0\n" }, false);

  const checkOut: Buffer[] = [];
  const checkErr: Buffer[] = [];
  const { held: checking } = realBoundary(held.root, held.home, checkOut, checkErr);
  await expect(semanticCheck([ "review/main"], checking)).resolves.toBe(0);
  expect(Buffer.concat(checkErr).toString()).toBe("");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held: running, faux } = realBoundary(held.root, held.home, stdout, stderr);
  faux.setResponses(writes("the answer"));
  await expect(main(["run", "start", "review/main", "the request"], running)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(held.home, "runs")))[0] ?? "";
  const events = await record(join(held.home, "runs", run, "record.jsonl"));
  const opened = events.find((event) => event["event"] === "stage_start");
  expect(opened).toBeDefined();
  expect(opened?.["slots"]).toBeTypeOf("object");
  expect(opened?.["slots"]).not.toHaveProperty("subflows");
  expect(gateChecks(events)).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, file: "flows/main/01-work/gate.sh", capture: "stages/01-work/1/1/checks/gate.txt" }),
  ]);
  await expect(readFile(join(held.home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8"))
    .resolves.toBe("looked at it\n");
});

test("a gate/ folder of three scripts is one gate: accepted, and all three run in the order their names sort", async () => {
  const held = await scratch("bot-cli-gate-folder-three-");
  await gateAssembly(held.home, {
    "01-lint.sh": "#!/bin/sh\nexit 0\n",
    "02-tests.sh": "#!/bin/sh\nexit 0\n",
    "03-house-style.py": "#!/bin/sh\nexit 0\n",
  }, true);

  const checkErr: Buffer[] = [];
  const { held: checking } = realBoundary(held.root, held.home, [], checkErr);
  await expect(semanticCheck([ "review/main"], checking)).resolves.toBe(0);
  expect(Buffer.concat(checkErr).toString()).toBe("");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held: running, faux } = realBoundary(held.root, held.home, stdout, stderr);
  faux.setResponses(writes("the answer"));
  await expect(main(["run", "start", "review/main", "the request"], running)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = (await readdir(join(held.home, "runs")))[0] ?? "";
  const events = await record(join(held.home, "runs", run, "record.jsonl"));
  // gate.md "More than one": "Every entry in the folder is a gate, and they run
  // in the order their names sort."
  expect(gateChecks(events).map((event) => event["file"])).toEqual([
    "flows/main/01-work/gate/01-lint.sh",
    "flows/main/01-work/gate/02-tests.sh",
    "flows/main/01-work/gate/03-house-style.py",
  ]);
});
