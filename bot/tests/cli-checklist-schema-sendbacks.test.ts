// Ticket 0047 — pin queue P5: checklist blocks and failing-schema send-backs
// through the REAL defaultGating via main() with the faux provider (the
// cli-stage-options idiom, 0041). The assertion sources:
// - stage.md "Inside a stage": "The checklist, the schema, and the gate run in
//   that order, and the first failure ends the round. That failure puts its
//   reason into the agent's session and sends the agent back to 2, without
//   re-running `before`. When the retries run out, the stage fails."
// - stage.md "Hooks": "A hook runs once per stage. A held-back agent is still
//   inside the same stage, so being sent back by a check does not re-run
//   `before`."
// - checklist.md: "An item left `todo` when the agent stops blocks the exit";
//   "Being sent back for an unfinished checklist spends one of the stage's
//   `retries`"; "A skip needs a reason. `skipped` with nothing behind it is
//   not a mark: it is returned to the agent as an error and the item stays
//   `todo`"; "`skipped` does not block."
// - schema.md: "The output is parsed and validated. A file that does not
//   parse, or that parses and does not match, sends the agent back with the
//   parser's or the validator's complaint as the reason."
// - record.md "For each check: which check it was, its exit code, and
//   everything it printed"; "The record's line for the check names its exit
//   code and points at the file" — the runtime's shape is check/exit/capture.
// - record.md cause table: exhausted / 1 — "the retries were spent with a
//   check still saying no"; Identity: "`retry` counts attempts, so the first
//   attempt is `1` and a stage with `retries: 2` can reach `3`."
// Faux response queues are consumed in order across attempts (the 0044
// fixtures show the sequencing): a send-back's next attempt eats the next
// queued responses.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";
import { hashBytes } from "../src/record.ts";

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

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function checks(events: Record<string, unknown>[], kind: string): Record<string, unknown>[] {
  return events.filter((event) => event["event"] === "check" && event["check"] === kind);
}

function marks(events: Record<string, unknown>[]): Record<string, unknown>[] {
  return events.filter((event) => event["event"] === "tool_call" && event["tool"] === "mark");
}

// checklist.md "Where it is written": under a heading reading exactly
// `## Checklist`, every top-level list item is one checklist item, 1-based in
// written order.
const CHECKLIST_BODY = "Do the work.\n\n## Checklist\n\n- Verify the input.\n- Run the tests.\n";

// A folder-form stage carrying the checklist body and a `before` hook that
// appends to a side file — the observable for "does not re-run `before`"
// (stage.md): one send-back later the side file still holds one line.
async function checklistAssembly(home: string, sideFile: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const hook = join(stage, "before");
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${CHECKLIST_BODY}`),
    writeFile(hook, `#!/bin/sh\necho ran >> '${sideFile}'\necho before-out\nexit 0\n`),
  ]);
  await chmod(hook, 0o755);
}

test("checklist send-back e2e: attempt 1 marks one item and stops, the check names the unfinished item, attempt 2 marks the rest, before ran once, retry stamps honest", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-checklist-sendback-"));
  roots.push(root);
  const home = join(root, "home");
  const sideFile = join(root, "before-ran.txt");
  await checklistAssembly(home, sideFile);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    // Attempt 1: writes the output, marks item 1 done, stops with item 2 todo.
    fauxAssistantMessage([
      fauxToolCall("write", { path: "$OUTPUT", content: "the work" }),
      fauxToolCall("mark", { item: 1, state: "done", evidence: "Verified the supplied input." }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("stopped with one item todo"),
    // Attempt 2 (the send-back): marks the remaining item and stops. The
    // output written on attempt 1 is still in $OUTPUT.
    fauxAssistantMessage([fauxToolCall("mark", { item: 2, state: "done", evidence: "Ran the test suite successfully." })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the work");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // record.md "For each check": which check it was, its exit code, and
  // everything it printed — the line names the exit and points at the
  // capture. Attempt 1's checklist check says no (exit 1), attempt 2's says
  // yes (exit 0); each carries its own attempt's retry stamp (0034: an event
  // belongs to the attempt that produced it).
  expect(checks(events, "checklist")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1, capture: "stages/01-work/1/1/checks/checklist.txt" }),
    expect.objectContaining({ retry: 2, exit: 0, capture: "stages/01-work/1/2/checks/checklist.txt" }),
  ]);
  // checklist.md "What it blocks": "The unfinished items go into the agent's
  // session" — the capture holds exactly what the agent read, byte for byte
  // (record.md "What a check printed"), naming the unfinished item by its
  // 1-based number and text and telling the agent that only the mark tool
  // accounts for it.
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/checks/checklist.txt"), "utf8"))
    .resolves.toBe("2. Run the tests.\nThe items above are unmarked. If an item is done, you must mark it with the `mark` tool; prose does not count.\n");

  // record.md Identity: `retry` counts attempts starting at 1 — the two
  // attempts' stage_start lines say 1 then 2, nothing else.
  const starts = events.filter((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(starts.map((event) => event["retry"])).toEqual([1, 2]);

  // record.md "For each control-tool call": which tool, what the agent
  // decided — each mark recorded under the attempt that made it.
  expect(marks(events)).toEqual([
    expect.objectContaining({ retry: 1, decision: "done", item: 1, evidence: "Verified the supplied input." }),
    expect.objectContaining({ retry: 2, decision: "done", item: 2, evidence: "Ran the test suite successfully." }),
  ]);

  // stage.md: "A hook runs once per stage. A held-back agent is still inside
  // the same stage, so being sent back by a check does not re-run `before`."
  // One line in the side file, one before hook event, one capture — on
  // attempt 1's path only.
  await expect(readFile(sideFile, "utf8")).resolves.toBe("ran\n");
  const befores = events.filter((event) => event["event"] === "hook" && event["hook"] === "before");
  expect(befores).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, capture: "stages/01-work/1/1/hooks/before.txt" }),
  ]);
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/before.txt"), "utf8"))
    .resolves.toBe("before-out\n");
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/2/hooks/before.txt"), "utf8")).rejects.toThrow();

  // The stage ended on attempt 2: exit 0, cause success, the output sealed.
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 2, exit: 0, cause: "success", sealed: true });
  expect(end?.["output"]).toEqual({ path: "stages/01-work/1/2/output.txt", sha256: hashBytes(Buffer.from("the work")) });
});

test("an empty-evidence mark stays todo; evidenced marks pass and carry their proof into the record", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-checklist-evidence-"));
  roots.push(root);
  const home = join(root, "home");
  await checklistAssembly(home, join(root, "before-ran.txt"));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("write", { path: "$OUTPUT", content: "the work" }),
      fauxToolCall("mark", { item: 1, state: "done", evidence: "" }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("marked without proof"),
    fauxAssistantMessage([
      fauxToolCall("mark", { item: 1, state: "done", evidence: "Read request.txt and verified its input." }),
      fauxToolCall("mark", { item: 2, state: "done", evidence: "Ran npm test; all tests passed." }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(checks(events, "checklist")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1 }),
    expect.objectContaining({ retry: 2, exit: 0 }),
  ]);
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/checks/checklist.txt"), "utf8"))
    .resolves.toContain("1. Verify the input.");
  expect(marks(events)).toEqual([
    expect.objectContaining({ retry: 2, item: 1, decision: "done", evidence: "Read request.txt and verified its input." }),
    expect.objectContaining({ retry: 2, item: 2, decision: "done", evidence: "Ran npm test; all tests passed." }),
  ]);
});

test("checklist exhaustion: the agent never marks, the default retries are spent, exit 1 cause exhausted at both ends", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-checklist-exhausted-"));
  roots.push(root);
  const home = join(root, "home");
  await checklistAssembly(home, join(root, "before-ran.txt"));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // record.md Identity: "a stage with `retries: 2` can reach `3`" — the
  // default is retries 2 (inspection defaults), so three attempts, none of
  // which ever marks. The output exists from attempt 1 on, so it is the
  // checklist that says no every round.
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "unfinished work" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("stopped without marking"),
    fauxAssistantMessage("still not marking"),
    fauxAssistantMessage("never marking"),
  ]);

  // stage.md: "When the retries run out, the stage fails" — exit 1, the stage
  // working as designed, the work rejected.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(1);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toContain("exhausted");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // Three attempts, each with a checklist check saying no (checklist.md:
  // being sent back for an unfinished checklist spends a retry, the same as
  // any other check).
  expect(checks(events, "checklist")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1 }),
    expect.objectContaining({ retry: 2, exit: 1 }),
    expect.objectContaining({ retry: 3, exit: 1 }),
  ]);
  expect(marks(events)).toEqual([]);

  // record.md cause table: exhausted / exit 1 — "the retries were spent with
  // a check still saying no". Both items were still todo, so the reason the
  // record kept is the full unfinished list.
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({
    retry: 3, exit: 1, cause: "exhausted",
    reason: "1. Verify the input.\n2. Run the tests.\nThe items above are unmarked. If an item is done, you must mark it with the `mark` tool; prose does not count.\n",
  });
  const runEnds = events.filter((event) => event["event"] === "run_end");
  expect(runEnds).toEqual([expect.objectContaining({ exit: 1, cause: "exhausted" })]);
});

// A folder-form stage with a schema.json (dialect 2020-12, schema.md) and a
// passing gate file — the gate is included so the failed round can prove the
// gate never ran (stage.md: the first failure ends the round).
async function schemaAssembly(home: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-extract");
  await mkdir(stage, { recursive: true });
  const gate = join(stage, "gate");
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nExtract the answer as JSON.\n"),
    writeFile(join(stage, "schema.json"), '{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}\n'),
    writeFile(gate, "#!/bin/sh\necho gate ok\nexit 0\n"),
  ]);
  await chmod(gate, 0o755);
}

test("failing-schema send-back: invalid JSON on attempt 1 is sent back with the parser's complaint and never reaches the gate; valid bytes on attempt 2 are what is sealed", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-schema-sendback-"));
  roots.push(root);
  const home = join(root, "home");
  await schemaAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const valid = '{"answer":"forty-two"}';
  faux.setResponses([
    // Attempt 1: bytes that do not parse as JSON.
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "not json at all" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("wrote something"),
    // Attempt 2: bytes that parse and match.
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: valid })], { stopReason: "toolUse" }),
    fauxAssistantMessage("fixed"),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe(valid);

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // schema.md: "A file that does not parse ... sends the agent back with the
  // parser's ... complaint as the reason." The check line names the exit and
  // points at the capture (record.md); the capture holds the complaint the
  // agent read, byte for byte.
  expect(checks(events, "schema")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1, capture: "stages/01-extract/1/1/checks/schema.txt" }),
    expect.objectContaining({ retry: 2, exit: 0, capture: "stages/01-extract/1/2/checks/schema.txt" }),
  ]);
  const complaint = await readFile(join(home, "runs", run, "stages/01-extract/1/1/checks/schema.txt"), "utf8");
  expect(complaint).toContain("Invalid JSON");

  // stage.md: "The checklist, the schema, and the gate run in that order, and
  // the first failure ends the round" — the invalid round has NO gate check
  // event; the gate ran on the passing round only.
  expect(checks(events, "gate")).toEqual([
    expect.objectContaining({ retry: 2, exit: 0, capture: "stages/01-extract/1/2/checks/gate.txt" }),
  ]);

  // schema.md "After `success`": "What passed the checks is what is sealed,
  // always" — the sealed output is the valid bytes, hash and all, at the
  // second attempt's path with the schema's extension.
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-extract");
  expect(end).toMatchObject({ retry: 2, exit: 0, cause: "success", sealed: true });
  expect(end?.["output"]).toEqual({ path: "stages/01-extract/1/2/output.json", sha256: hashBytes(Buffer.from(valid)) });
  await expect(readFile(join(home, "runs", run, "stages/01-extract/1/2/output.json"), "utf8")).resolves.toBe(valid);
});

test("a skip needs a reason: a bare skip is not a mark and the item stays todo; skipped with a reason is accounted for and the stage passes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-checklist-skip-"));
  roots.push(root);
  const home = join(root, "home");
  await checklistAssembly(home, join(root, "before-ran.txt"));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    // Attempt 1: marks item 1 done and tries to skip item 2 with NO reason.
    // checklist.md: "`skipped` with nothing behind it is not a mark: it is
    // returned to the agent as an error and the item stays `todo`."
    fauxAssistantMessage([
      fauxToolCall("write", { path: "$OUTPUT", content: "the work" }),
      fauxToolCall("mark", { item: 1, state: "done", evidence: "Verified the supplied input." }),
      fauxToolCall("mark", { item: 2, state: "skipped", evidence: "The test requirement is not applicable." }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("stopped after a bare skip"),
    // Attempt 2: the same skip WITH a reason — accounted for.
    fauxAssistantMessage([
      fauxToolCall("mark", { item: 2, state: "skipped", evidence: "The test requirement is not applicable.", reason: "the tests do not apply to this input" }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  // checklist.md: "`skipped` does not block" — with item 1 done and item 2
  // skipped-with-reason, everything is accounted for and the stage passes.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the work");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // The refuse side, observable in the record: the bare skip left item 2
  // `todo`, so attempt 1's checklist check still said no, naming it.
  expect(checks(events, "checklist")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1 }),
    expect.objectContaining({ retry: 2, exit: 0 }),
  ]);
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/checks/checklist.txt"), "utf8"))
    .resolves.toBe("2. Run the tests.\nThe items above are unmarked. If an item is done, you must mark it with the `mark` tool; prose does not count.\n");

  // record.md "For each control-tool call": "A checklist item marked
  // `skipped` is recorded with why, which is the entire point of allowing it
  // to be skipped" — the accepted skip carries its reason.
  expect(marks(events)).toContainEqual(expect.objectContaining({
    retry: 2, decision: "skipped", item: 2, evidence: "The test requirement is not applicable.", reason: "the tests do not apply to this input",
  }));

  // checklist.md: the bare skip "is not a mark: it is returned to the agent
  // as an error and the item stays `todo`" — an error never executed, so the
  // refused mark leaves NO tool_call event (pi-tap: "the record shows only
  // what ran"). Exactly the marks that took effect, nothing else.
  expect(marks(events)).toEqual([
    expect.objectContaining({ retry: 1, decision: "done", item: 1, evidence: "Verified the supplied input." }),
    expect.objectContaining({ retry: 2, decision: "skipped", item: 2, evidence: "The test requirement is not applicable.", reason: "the tests do not apply to this input" }),
  ]);
  // The agent-side feedback is unchanged, byte for byte: the refusal's text
  // reached the session on attempt 1.
  const session = await readFile(join(home, "runs", run, "stages/01-work/1/session.jsonl"), "utf8");
  expect(session).toContain("A skipped checklist item requires a reason.");

  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 2, exit: 0, cause: "success", sealed: true });
});
