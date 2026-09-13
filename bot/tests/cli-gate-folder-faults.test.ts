// Ticket 0050 — pin queue P8: the gate folder, 126/127 as broken assembly,
// and the rehash at sealing, end to end through the REAL defaultGating via
// main() with the faux provider (the cli-stage-options idiom, 0041). The
// assertion sources:
// - gate.md "More than one": "Every entry in the folder is a gate, and they
//   run in the order their names sort"; "The first non-zero exit ends the
//   round and its output is the reason the agent is given"; "The record names
//   which gate failed".
// - gate.md "The verdict": exit 0 — "anything the gate printed is not shown
//   to the agent, though the record keeps it"; non-zero — "On failure, stdout
//   and stderr are captured together and put into the agent's session as the
//   reason it cannot leave yet."
// - gate.md "How it is run": "The runtime passes the path of the output file
//   as the first argument. The stage's slots are in its environment as well,
//   so `$OUTPUT` names the same file and `$INPUT` names what the stage was
//   given."
// - gate.md: "`126` and `127` come from the shell, not from the gate — a gate
//   that could not be executed is a broken assembly, and the run fails rather
//   than the agent being sent back."
// - runtime.md "Exit codes": "A runtime treats `126` and `127` from any hook
//   or gate as a broken assembly, not as a decision, and fails the run";
//   "A hook or gate that cannot be executed ... is the same fault found late
//   ... the run exits `2` and the record it had already started says where."
// - record.md "What a check printed": "A `gate/` folder's captures mirror it:
//   each gate's output lands under `checks/gate/`, named for the entry that
//   produced it — `checks/gate/01-lint.txt`"; "The file is written first so
//   that what the record holds is exactly what the agent read, byte for
//   byte."
// - record.md "Hashes": the output "is hashed the moment its checks pass, and
//   bytes that differ when it is sealed end the run the same way a drifted
//   gate does — the window between passing and sealing is not a place bytes
//   may change, not for a `success` hook"; hooks.md: success "holds `$OUTPUT`
//   as a path to read" and "Bytes that differ at sealing are drift, and drift
//   ends the run."
// - record.md: "a run refused before it starts produces none [no record],
//   because nothing happened"; cause table fault / 2.
import { semanticCheck } from "./semantic-check.ts";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";
import { hashBytes } from "../src/record.ts";
import { logicalSessionEntries } from "../src/session-decoder.ts";
import { mapping } from "../src/model.ts";

const roots: string[] = [];
// Ticket 0037: this runtime frame must not assume a repository or work queue.
const GATE_FAILURE_FRAME = "Your output did not pass review. Fix the cause, then rewrite your output. If the cause is outside what you were asked to do, say so plainly instead of retrying.\n\nThe review output follows:\n\n";
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

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function userTurns(session: string): string[] {
  return session.trimEnd().split("\n").flatMap((line) => {
    return logicalSessionEntries(line).flatMap(({ entry }) => {
      const message = entry["message"];
      if (!mapping(message) || message["role"] !== "user") return [];
      const content = message["content"];
      if (typeof content === "string") return [content];
      if (!Array.isArray(content)) return [];
      return [content.flatMap((part) => mapping(part) && typeof part["text"] === "string" ? [part["text"]] : []).join("\n")];
    });
  });
}

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

function gateChecks(events: Record<string, unknown>[]): Record<string, unknown>[] {
  return events.filter((event) => event["event"] === "check" && event["check"] === "gate");
}

// A folder-form stage whose gate is a gate/ FOLDER (or a single gate file),
// with optional hooks — the 0048 hookAssembly shape adapted for gate folders.
async function gateAssembly(
  home: string,
  gates: Record<string, string>,
  options: { folder?: boolean; mode?: number; hooks?: Partial<Record<"before" | "success" | "failure", string>> } = {},
): Promise<void> {
  const folder = options.folder ?? true;
  const stage = join(home, "assemblies/review/flows/main/01-work");
  const gateDir = folder ? join(stage, "gate") : stage;
  await mkdir(gateDir, { recursive: true });
  const hooks = Object.entries(options.hooks ?? {});
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    ...Object.entries(gates).map(([name, script]) => writeFile(join(gateDir, name), script)),
    ...hooks.map(([name, script]) => writeFile(join(stage, name), script)),
  ]);
  await Promise.all([
    ...Object.keys(gates).map((name) => chmod(join(gateDir, name), options.mode ?? 0o755)),
    ...hooks.map(([name]) => chmod(join(stage, name), 0o755)),
  ]);
}

test("check refuses every hook-named gate-folder file before it can run under two contracts", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-folder-hook-"));
  roots.push(root);
  const home = join(root, "home");
  await gateAssembly(home, {
    "before.py": "#!/bin/sh\nexit 0\n",
    "success.sh": "#!/bin/sh\nexit 0\n",
    failure: "#!/bin/sh\nexit 0\n",
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main"], held)).resolves.toBe(2);
  const diagnostics = Buffer.concat(stderr).toString();
  for (const name of ["before.py", "success.sh", "failure"]) {
    expect(diagnostics).toContain(`flows/main/01-work/gate/${name}`);
  }
});

test("gate folder in name order with a named failure: attempt 1 runs 10-lint then 20-tests and stops there, the record names 20-tests, the passing print is kept, the reason reaches the session, attempt 2 passes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-folder-"));
  roots.push(root);
  const home = join(root, "home");
  const state = join(root, "second-attempt");
  // gate.md "More than one": entries run in the order their names sort —
  // 10-lint, 20-tests, 30-style — and "the first non-zero exit ends the
  // round", so 30-style must NOT run on attempt 1. 20-tests fails once (the
  // state file flips it) and prints the reason as an instruction (gate.md
  // "Writing the reason").
  await gateAssembly(home, {
    "10-lint": "#!/bin/sh\necho 'lint clean'\nexit 0\n",
    "20-tests": `#!/bin/sh\nif [ -f '${state}' ]; then echo 'tests pass now'; exit 0; fi\ntouch '${state}'\nprintf 'Add the missing regression test.\nThe focused test must fail first.\n'\nexit 1\n`,
    "30-style": "#!/bin/sh\necho 'style checked'\nexit 0\n",
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // Attempt 2 changes nothing: the same bytes are re-judged and now pass.
  faux.setResponses([...writes("the answer"), fauxAssistantMessage("fixed nothing, trying again")]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // record.md "What a check printed": each gate's output lands under
  // `checks/gate/`, named for the entry that produced it. The check line
  // carries `file`, which is how "the record names which gate failed"
  // (gate.md): attempt 1 is 10-lint (0) then 20-tests (1) and NOTHING for
  // 30-style — the first non-zero ended the round; attempt 2 is all three.
  expect(gateChecks(events)).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, file: "flows/main/01-work/gate/10-lint", capture: "stages/01-work/1/1/checks/gate/10-lint.txt" }),
    expect.objectContaining({ retry: 1, exit: 1, file: "flows/main/01-work/gate/20-tests", capture: "stages/01-work/1/1/checks/gate/20-tests.txt" }),
    expect.objectContaining({ retry: 2, exit: 0, file: "flows/main/01-work/gate/10-lint", capture: "stages/01-work/1/2/checks/gate/10-lint.txt" }),
    expect.objectContaining({ retry: 2, exit: 0, file: "flows/main/01-work/gate/20-tests", capture: "stages/01-work/1/2/checks/gate/20-tests.txt" }),
    expect.objectContaining({ retry: 2, exit: 0, file: "flows/main/01-work/gate/30-style", capture: "stages/01-work/1/2/checks/gate/30-style.txt" }),
  ]);

  // gate.md "The verdict", exit 0: "anything the gate printed is not shown to
  // the agent, though the record keeps it" — 10-lint's passing print is in
  // its capture, byte for byte.
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/checks/gate/10-lint.txt"), "utf8"))
    .resolves.toBe("lint clean\n");

  // gate.md: the failure output is captured before its framed send-back.
  // The raw capture remains available for the record to diagnose the failure.
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/checks/gate/20-tests.txt"), "utf8"))
    .resolves.toBe("Add the missing regression test.\nThe focused test must fail first.\n");
  const session = await readFile(join(home, "runs", run, "stages/01-work/1/session.jsonl"), "utf8");
  expect(userTurns(session)).toContain(`${GATE_FAILURE_FRAME}Add the missing regression test.\nThe focused test must fail first.\n`);
  // The passing print stayed out of the session (gate.md: "not shown to the
  // agent"): 10-lint printed on both attempts, the session never saw it.
  expect(session).not.toContain("lint clean");

  // The send-back spent one retry; attempt 2 re-judges and seals the bytes.
  const starts = events.filter((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(starts.map((event) => event["retry"])).toEqual([1, 2]);
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 2, exit: 0, cause: "success", sealed: true });
  expect(end?.["output"]).toEqual({ path: "stages/01-work/1/2/output.txt", sha256: hashBytes(Buffer.from("the answer")) });
});

test("first argument and env: a gate's $1 is the output path, $OUTPUT names the same file, and $INPUT holds what the stage was given", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-argv-"));
  roots.push(root);
  const home = join(root, "home");
  // gate.md "How it is run": "The runtime passes the path of the output file
  // as the first argument. The stage's slots are in its environment as well,
  // so `$OUTPUT` names the same file and `$INPUT` names what the stage was
  // given." A single gate FILE this time (the file/folder duality), passing,
  // so the prints land only in the record's capture.
  await gateAssembly(home, {
    gate: "#!/bin/sh\nprintf 'one=[%s]\\noutput=[%s]\\n' \"$1\" \"$OUTPUT\"\nfor f in \"$INPUT\"/*; do printf 'input-entry=[%s]\\n' \"$(basename \"$f\")\"; done\nexit 0\n",
  }, { folder: false });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  // A single gate file captures to checks/gate.txt (record.md: the capture is
  // "named for the check that produced it"; the gate/ mirror is for folders).
  expect(gateChecks(events)).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, file: "flows/main/01-work/gate", capture: "stages/01-work/1/1/checks/gate.txt" }),
  ]);

  const lines = (await readFile(join(home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8")).trimEnd().split("\n");
  const value = (name: string): string => {
    const match = lines.find((line) => line.startsWith(`${name}=[`)) ?? "";
    return match.slice(name.length + 2, -1);
  };
  // $1 == $OUTPUT, literally the same path — and it is a real path: the bytes
  // there are the bytes the stage sealed, so the gate judged the very file the
  // record sealed.
  const one = value("one");
  expect(one).not.toBe("");
  expect(one).toBe(value("output"));
  await expect(readFile(one, "utf8")).resolves.toBe("the answer");
  // $INPUT names what the stage was given: the first stage's one file is the
  // request (slots.md: first in a flow it holds `request.txt`).
  expect(lines.filter((line) => line.startsWith("input-entry=["))).toEqual(["input-entry=[request.txt]"]);
});

// Ticket 0121 (C10) — record.md "What a check printed" promises that a `gate/`
// folder's captures are "named for the entry that produced it ... so several
// gates in one round collide with nothing, each other included". The capture
// name dropped the entry's extension, so two entries whose names differ only
// there — both legal: stage.md bounds only the BARE gate's name, and
// validateGate accepts every runnable entry in the folder — wrote the same
// file. The second overwrote the first, the record pointed both check lines at
// it, and nothing said so.
//
// Built so it could fail the other way: the entries are `.py` and `.sh` of one
// stem, both exit 0 so the round runs to the end, and each prints bytes only it
// prints. The test above holds the other side — extensionless entries keep
// their plain `10-lint.txt` names — so a fix that renamed every capture, or
// used the whole path, reddens there.
test("two gate/ entries differing only in extension get one capture each, neither overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-collide-"));
  roots.push(root);
  const home = join(root, "home");
  await gateAssembly(home, {
    "10-lint.py": "#!/bin/sh\necho 'the python one ran'\nexit 0\n",
    "10-lint.sh": "#!/bin/sh\necho 'the shell one ran'\nexit 0\n",
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  // Two entries, two captures, in the order their names sort.
  expect(gateChecks(events)).toEqual([
    expect.objectContaining({ file: "flows/main/01-work/gate/10-lint.py", capture: "stages/01-work/1/1/checks/gate/10-lint.py.txt" }),
    expect.objectContaining({ file: "flows/main/01-work/gate/10-lint.sh", capture: "stages/01-work/1/1/checks/gate/10-lint.sh.txt" }),
  ]);
  // And each holds what its own gate printed: the record keeps both prints,
  // which is what "collide with nothing" costs if it is not true.
  const checks = join(home, "runs", run, "stages/01-work/1/1/checks/gate");
  await expect(readFile(join(checks, "10-lint.py.txt"), "utf8")).resolves.toBe("the python one ran\n");
  await expect(readFile(join(checks, "10-lint.sh.txt"), "utf8")).resolves.toBe("the shell one ran\n");
  expect((await readdir(checks)).sort()).toEqual(["10-lint.py.txt", "10-lint.sh.txt"]);
});

test("126/127 broken assembly: a non-executable gate entry is refused before any run exists; a gate exiting 127 at run time is a fault that fails the run with no send-back", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-fault-"));
  roots.push(root);
  // Leg A (unreachable live): a gate/ entry WITHOUT the executable bit never
  // reaches a run — check and run both refuse the assembly upfront
  // (validateRunnable: "Make the file executable"), and record.md: "a run
  // refused before it starts produces none, because nothing happened" — no
  // runs directory at all. So the missing-bit case cannot produce exit 126
  // from a live gate here.
  const homeA = join(root, "homeA");
  await gateAssembly(homeA, { "10-broken": "#!/bin/sh\nexit 0\n" }, { mode: 0o644 });
  {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const { held } = realBoundary(root, homeA, stdout, stderr);
    await expect(semanticCheck([ "review/main"], held)).resolves.toBe(2);
    expect(Buffer.concat(stderr).toString()).toContain("not-runnable");
  }
  {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const { held, faux } = realBoundary(root, homeA, stdout, stderr);
    faux.setResponses(writes("never used"));
    await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
    expect(Buffer.concat(stderr).toString()).toContain("not-runnable");
    await expect(readdir(join(homeA, "runs"))).resolves.toEqual([]);
  }

  // Leg B (the reachable one, pinned live): the gate is a perfectly runnable
  // sh script whose exec target does not exist, so the SHELL exits 127 —
  // "`126` and `127` come from the shell, not from the gate" (gate.md).
  // runtime.md "Exit codes": "A runtime treats `126` and `127` from any hook
  // or gate as a broken assembly, not as a decision, and fails the run" —
  // exit 2, cause fault, "the record it had already started says where".
  const homeB = join(root, "homeB");
  await gateAssembly(homeB, { "10-doomed": "#!/bin/sh\nexec /nonexistent-interpreter-0050\n" });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, homeB, stdout, stderr);
  faux.setResponses(writes("the work"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  // "A run that ends nonzero names its cause on standard error — and the
  // reason behind it" (runtime.md "Streams"): the record names the file.
  const diagnostics = Buffer.concat(stderr).toString();
  expect(diagnostics).toContain("fault");
  expect(diagnostics).toContain("flows/main/01-work/gate/10-doomed");

  const run = (await readdir(join(homeB, "runs")))[0] ?? "";
  const events = await record(join(homeB, "runs", run, "record.jsonl"));
  // The check line is honest about what the shell said — exit 127 — while
  // the verdict is the RUN's: not a decision, so no judgment against the
  // agent (record.md: "none of it is a doing of the agent's").
  expect(gateChecks(events)).toEqual([
    expect.objectContaining({ retry: 1, exit: 127, file: "flows/main/01-work/gate/10-doomed", capture: "stages/01-work/1/1/checks/gate/10-doomed.txt" }),
  ]);

  // The agent is NOT sent back: one attempt, no retry-2 stage_start, and the
  // stage/run end as fault/2 (record.md cause table: fault / 2 — "an
  // assembly executable found broken while running: one that could not
  // execute ... The record names the file").
  const starts = events.filter((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(starts.map((event) => event["retry"])).toEqual([1]);
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 1, exit: 2, cause: "fault" });
  expect(String(end?.["reason"])).toContain("flows/main/01-work/gate/10-doomed");
  expect(events.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault" }),
  ]);
});

// Ticket 0143 — the third leg of the same fact, and the last raw runtime face
// (0128's class). Leg A above proves a gate missing its exec bit never reaches
// a run; leg B proves the shell's 126/127 speaks a plain sentence. Strip the
// bit AFTER the assembly has been read and the spawn itself is refused, which
// is the branch that used to answer in Node's words — `spawn <absolute path>
// EACCES` — one line above the sentence 126/127 already spoke. The stripper is
// a `before` hook reaching for its own sibling through `$0`, because a run
// executes the capture and "the live tree is not read by a running run at
// all"; chmod moves no bytes, so invariant 14's rehash sees no drift and the
// spawn is genuinely reached.
test("a gate whose exec bit is stripped after the assembly was read speaks the same plain sentence, with no path and no error code in it", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-stripped-"));
  roots.push(root);
  const home = join(root, "home");
  await gateAssembly(home, { "10-stripped": "#!/bin/sh\nexit 0\n" }, {
    hooks: { before: '#!/bin/sh\nchmod 644 "$(dirname "$0")/gate/10-stripped"\n' },
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the work"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  const diagnostics = Buffer.concat(stderr).toString();
  expect(diagnostics).toContain("flows/main/01-work/gate/10-stripped could not execute.");
  expect(diagnostics).not.toContain("EACCES");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  // The child never started, so no shell ever spoke a code for it: exit null.
  expect(gateChecks(events)).toEqual([
    expect.objectContaining({ retry: 1, exit: null, file: "flows/main/01-work/gate/10-stripped" }),
  ]);
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({
    retry: 1, exit: 2, cause: "fault",
    reason: "flows/main/01-work/gate/10-stripped could not execute.",
  });
  // And none of the machine's own vocabulary reaches the record: no absolute
  // path — every one of them begins at `root` — no errno word, no verb of
  // Node's for starting a process.
  const reason = String(end?.["reason"]);
  expect(reason).not.toContain(root);
  expect(reason).not.toContain("EACCES");
  expect(reason).not.toContain("spawn");
  expect(events.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault" }),
  ]);
});
