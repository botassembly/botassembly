import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxResponseStep,
} from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, expect, test } from "vitest";
import { createMemoryHarness } from "../src/harness.ts";
import { runGating, type GatingConfig, type GatingInput } from "../src/gating.ts";
import type { DriverClock, Executable } from "../src/process.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes } from "../src/record.ts";
import { lstatExists } from "../src/documents.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";
import { waitFor } from "./hostile.ts";
import { manualClock } from "./manual-clock.ts";

const roots: string[] = [];
let runNumber = 0;

const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(responses: FauxResponseStep[]) {
  const root = await mkdtemp(join(tmpdir(), "bot-gating-test-"));
  roots.push(root);
  const runs = join(root, "runs");
  const input = join(root, "input");
  const output = join(root, "output");
  await Promise.all([mkdir(runs), mkdir(input)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(),
    run: `2026-07-31T12-00-${String(runNumber++).padStart(2, "0")}-cafe`,
    assembly: "gating",
    assemblyHash: "a".repeat(64),
    flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  const faux = fauxProvider({ tokensPerSecond: 10_000 });
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const controls = createControlContext();
  const harness = createMemoryHarness({
    models,
    model: faux.getModel(),
    systemPrompt: "Synthetic gating test.",
    tools: createControlTools(),
    context: controls,
  });
  const common = {
    prompt: "Do the work.", timeoutMs: 500, retries: 1, cwd: root,
    env: { ...process.env, INPUT: input, OUTPUT: output, TMP: root, PWD: root },
    session: "stages/01-work/1/session.jsonl", received: [], options: [],
  };
  return { root, output, writer: created.writer, harness, controls, common };
}

async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function executable(root: string, relative: string, source: string): Promise<Executable> {
  const path = join(root, relative);
  await writeFile(path, source);
  await chmod(path, 0o755);
  return { path, file: `flows/main/01-work/${relative}`, sha256: hashBytes(source) };
}

async function run(f: Awaited<ReturnType<typeof fixture>>, config: GatingConfig, signal?: GatingInput["signal"], driver: DriverClock = clock) {
  const input: GatingInput = { harness: f.harness, controls: f.controls, writer: f.writer, identity: { stage: "01-work", retry: 1 }, clock: driver, config, close: () => f.harness.close(), ...(signal === undefined ? {} : { signal }) };
  return runGating(input);
}

test("stage passes first try through output, checklist, JSON schema, and gate", async () => {
  let output = "";
  const f = await fixture([
    async () => {
      await writeFile(output, JSON.stringify({ ok: true }));
      return fauxAssistantMessage([fauxToolCall("mark", { item: 1, state: "done", evidence: "Validated the JSON output." })], { stopReason: "toolUse" });
    },
    fauxAssistantMessage("done"),
  ]);
  output = f.output;
  const schema = join(f.root, "schema.json");
  await writeFile(schema, JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", required: ["ok"], properties: { ok: { const: true } } }));
  const gate = await executable(f.root, "gate.sh", "#!/bin/sh\nprintf 'gate passed'\nexit 0\n");
  const success = await executable(f.root, "success.sh", "#!/bin/sh\nprintf 'success hook'\nexit 0\n");
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "json", checklist: ["Account for the work"], schema: { kind: "json", path: schema }, gates: [gate], hooks: { success } });
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "check").map((event) => event["check"]))
    .toEqual(["output", "checklist", "schema", "gate"]);
  expect(record).toContainEqual(expect.objectContaining({ event: "tool_call", tool: "mark", decision: "done", item: 1, evidence: "Validated the JSON output." }));
  expect(record.filter((event) => event["hook"] === "success")).toHaveLength(1);
});

test("a missing output is sent back into the same session and the next attempt passes", async () => {
  let output = "";
  const f = await fixture([
    fauxAssistantMessage("quiet"),
    async () => { await writeFile(output, "fixed"); return fauxAssistantMessage("fixed"); },
  ]);
  output = f.output;
  const before = await executable(f.root, "before.sh", "#!/bin/sh\nprintf 'before hook'\nexit 0\n");
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", hooks: { before } });
  expect(result.cause).toBe("success");
  const record = await events(f.writer.recordPath);
  const starts = record.filter((event) => event["event"] === "stage_start");
  expect(starts.map((event) => event["retry"])).toEqual([1, 2]);
  expect(starts.map((event) => event["session"])).toEqual([f.common.session, f.common.session]);
  expect(record.filter((event) => event["hook"] === "before")).toHaveLength(1);
  expect(await readFile(join(f.writer.runDirectory, "stages/01-work/1/1/checks/output-missing.txt"), "utf8"))
    .toBe("Nothing was written to `$OUTPUT`.\n");
});

test("rejected rounds exhaust exactly the configured retries", async () => {
  const f = await fixture([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);
  const failure = await executable(f.root, "failure.sh", "#!/bin/sh\nprintf 'failure hook'\nexit 0\n");
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", hooks: { failure } });
  expect(result).toMatchObject({ exit: 1, cause: "exhausted" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["check"] === "output")).toHaveLength(2);
  expect(record.filter((event) => event["hook"] === "failure")).toHaveLength(1);
});

test("a length-truncated turn continues before any finished-work check", async () => {
  let output = "";
  const f = await fixture([
    fauxAssistantMessage("partial", { stopReason: "length" }),
    async () => { await writeFile(output, "complete"); return fauxAssistantMessage("complete"); },
  ]);
  output = f.output;
  const result = await run(f, { ...f.common, retries: 0, mode: "stage", outputPath: f.output, outputExtension: "txt" });
  expect(result.cause).toBe("success");
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "turn").map((event) => event["stop"]))
    .toEqual(["length", "stop"]);
  expect(record.filter((event) => event["event"] === "stage_start")).toHaveLength(1);
});

test("a gate timeout uses its fresh clock and records exit null", async () => {
  let output = "";
  const f = await fixture([async () => { await writeFile(output, "ready"); return fauxAssistantMessage("ready"); }]);
  output = f.output;
  const gate = await executable(f.root, "gate.sh", "#!/bin/sh\nprintf 'started'\nsleep 2\n");
  const result = await run(f, { ...f.common, timeoutMs: 400, mode: "stage", outputPath: f.output, outputExtension: "txt", gates: [gate] });
  expect(result).toMatchObject({ exit: 2, cause: "timeout" });
  const record = await events(f.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "check", check: "gate", exit: null }));
});

test("a signal-ended stage does not run its failure hook", async () => {
  const f = await fixture([fauxAssistantMessage("must not run")]);
  const failure = await executable(f.root, "failure.sh", "#!/bin/sh\nprintf 'must not run'\nexit 0\n");
  const controller = new AbortController();
  controller.abort();
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", hooks: { failure } }, { abort: controller.signal, exit: 143 });
  expect(result).toMatchObject({ exit: 143, cause: "signal" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "hook")).toHaveLength(0);
});

// Item 2 (ticket 0029, A5): "the record claims nothing judged it" (runtime.md)
// — a gate the signal aborted judged nothing, so the stage_end says judged:false.
test("a signal-aborted gate records judged: false with the output kept unsealed", async () => {
  let output = "";
  const f = await fixture([async () => { await writeFile(output, "unjudged"); return fauxAssistantMessage("done"); }]);
  output = f.output;
  const marker = join(f.root, "gate-started");
  const gate = await executable(f.root, "gate.sh", `#!/bin/sh\ntouch '${marker}'\nsleep 5\n`);
  const controller = new AbortController();
  const running = run(
    f,
    { ...f.common, timeoutMs: 5_000, mode: "stage", outputPath: f.output, outputExtension: "txt", gates: [gate] },
    { abort: controller.signal, exit: 143 },
  );
  await waitFor(() => lstatExists(marker));
  controller.abort();
  const result = await running;
  expect(result).toMatchObject({ exit: 143, cause: "signal" });
  const end = (await events(f.writer.recordPath)).find((event) => event["event"] === "stage_end");
  expect(end).toMatchObject({ exit: 143, cause: "signal", sealed: false, judged: false });
});

// choose.md, as ruled by 0063 item 6: an agent that names something that is not
// an alternative "is told so and asked again in the same session — the same
// send-back a failing check earns". Told so: the `select` check capture. Asked
// again: a second stage_start for the same stage, which is what `retries`
// bounds. The word is send-back, never "held" (0047).
test("CHOOSE sends back an invalid selection, asks again, and accepts the next valid selection", async () => {
  const f = await fixture([
    fauxAssistantMessage([fauxToolCall("select", { name: "bogus", reason: "guess" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("quiet"),
    fauxAssistantMessage([fauxToolCall("select", { name: "patch", reason: "safe" })], { stopReason: "toolUse" }),
  ]);
  const result = await run(f, { ...f.common, mode: "choose", alternatives: ["patch", "revert"] });
  expect(result).toMatchObject({ exit: 0, cause: "success", selection: { name: "patch", reason: "safe" } });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["check"] === "select")).toHaveLength(1);
  // Asked again, in one session: two attempts of the same stage, both naming
  // the one session file, and only the second one chose.
  const starts = record.filter((event) => event["event"] === "stage_start");
  expect(starts.map((event) => [event["stage"], event["retry"]])).toEqual([["01-work", 1], ["01-work", 2]]);
  expect(new Set(starts.map((event) => event["session"])).size).toBe(1);
  expect(record).toContainEqual(expect.objectContaining({ event: "chose", chose: "patch", declined: ["revert"] }));
});

test("a mixed invalid and valid selection batch preserves the valid decision after Pi's extra turn", async () => {
  const f = await fixture([
    fauxAssistantMessage([
      fauxToolCall("select", { name: "bogus", reason: "first" }, { id: "select-bogus" }),
      fauxToolCall("select", { name: "patch", reason: "second" }, { id: "select-patch" }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("quiet after mixed batch"),
  ]);
  const result = await run(f, { ...f.common, mode: "choose", alternatives: ["patch", "revert"] });
  expect(result).toMatchObject({ cause: "success", selection: { name: "patch", reason: "second" } });
  const record = await events(f.writer.recordPath);
  // The invalid selection errored back to the agent, so it never executed and
  // leaves no tool_call event: only the valid decision is in the record.
  expect(record.filter((event) => event["event"] === "tool_call").map((event) => event["decision"]))
    .toEqual(["patch"]);
  expect(record.filter((event) => event["event"] === "turn")).toHaveLength(2);
  expect(record.filter((event) => event["check"] === "select")).toHaveLength(0);
});

test("LOOP holds an unanswered question without losing the checks-passed output", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "ready"); return fauxAssistantMessage("ready"); },
    fauxAssistantMessage("no answer"),
    fauxAssistantMessage([fauxToolCall("continue", { answer: "stop", reason: "ready" })], { stopReason: "toolUse" }),
  ]);
  output = f.output;
  const result = await run(f, { ...f.common, mode: "loop", question: "Is this ready?", outputPath: f.output, outputExtension: "txt" });
  expect(result).toMatchObject({ exit: 0, cause: "success", continuation: { answer: "stop", reason: "ready" } });
  const record = await events(f.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "check", check: "question", retry: 1 }));
  const end = record.find((event) => event["event"] === "stage_end");
  const heldOutput = end?.["output"];
  expect(end?.["retry"]).toBe(2);
  expect(typeof heldOutput === "object" && heldOutput !== null && "path" in heldOutput ? heldOutput.path : undefined)
    .toContain("/1/1/output.txt");
});

// Ticket 0032: hooks.md — failure "may change: nothing"; runtime.md:85 — a
// failed stage's output is kept. The kept bytes must be the agent's, hashed
// before the failure hook runs, never the hook's rewrite.
test("the exhausted record keeps the agent's failing output, not the failure hook's rewrite", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "agent bytes"); return fauxAssistantMessage("tried"); },
  ]);
  output = f.output;
  const gate = await executable(f.root, "gate.sh", "#!/bin/sh\nprintf 'not good enough'\nexit 1\n");
  const failure = await executable(f.root, "failure.sh", "#!/bin/sh\nprintf 'laundered' > \"$OUTPUT\"\nexit 0\n");
  const result = await run(f, { ...f.common, retries: 0, mode: "stage", outputPath: f.output, outputExtension: "txt", gates: [gate], hooks: { failure } });
  expect(result).toMatchObject({ exit: 1, cause: "exhausted" });
  expect(await readFile(join(f.writer.runDirectory, "stages/01-work/1/1/output.txt"), "utf8")).toBe("agent bytes");
  const end = (await events(f.writer.recordPath)).find((event) => event["event"] === "stage_end");
  const held = end?.["output"];
  expect(typeof held === "object" && held !== null && "sha256" in held ? held.sha256 : undefined)
    .toBe(hashBytes("agent bytes"));
  expect(end).toMatchObject({ sealed: false });
});

// Ticket 0032, before-failed case: the agent never ran, so a failure hook
// that writes $OUTPUT conjures nothing into the record — stage_end has no
// output and no attempt copy exists.
test("a failure hook cannot conjure an output for a stage whose before hook failed", async () => {
  const f = await fixture([fauxAssistantMessage("never prompted")]);
  const before = await executable(f.root, "before.sh", "#!/bin/sh\nprintf 'not ready'\nexit 1\n");
  const failure = await executable(f.root, "failure.sh", "#!/bin/sh\nprintf 'conjured' > \"$OUTPUT\"\nexit 0\n");
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", hooks: { before, failure } });
  expect(result).toMatchObject({ exit: 1, cause: "rejected" });
  const end = (await events(f.writer.recordPath)).find((event) => event["event"] === "stage_end");
  expect(end).not.toHaveProperty("output");
  expect(lstatExists(join(f.writer.runDirectory, "stages/01-work/1/1/output.txt"))).toBe(false);
});

// Ticket 0086, and the companion to the success-hook test below. gate.md now
// says a gate reads its output and does not write to it, and says in the same
// breath that a runtime is not required to do anything about a gate that does.
// This pins the second half — the limit, not the rule. A gate that writes B,
// judges B, and puts A back exits 0 into a clean seal of A: the record holds the
// gate's own statement that it judged B, and holds A as the sealed bytes, and
// nothing anywhere calls that a fault. If someone ever builds the enforcement
// this paragraph declines to require, this test goes red, which is exactly when
// its reader wants to hear about it. A green run here is not the rule being
// kept; it is the rule being unenforced, on the record.
test("a gate that writes, judges what it wrote, and restores the original seals undetected", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "the bytes the stage wrote"); return fauxAssistantMessage("done"); },
  ]);
  output = f.output;
  const gate = await executable(f.root, "gate.sh", [
    "#!/bin/sh",
    // Judge nothing the stage wrote: overwrite, pass on what the gate itself
    // put there, then restore so the seal has nothing to notice.
    'original=$(cat "$1")',
    'printf \'gate-authored bytes\' > "$1"',
    'grep -q \'gate-authored\' "$1" || exit 1',
    'printf \'judged: %s\\n\' "$(cat "$1")"',
    'printf \'%s\' "$original" > "$1"',
    "exit 0",
  ].join("\n") + "\n");
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", gates: [gate] });

  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "hash_drift")).toHaveLength(0);

  // The seal is of the stage's bytes, and it claims to have been judged.
  const end = record.find((event) => event["event"] === "stage_end");
  expect(end).toMatchObject({
    sealed: true,
    judged: true,
    output: { sha256: hashBytes("the bytes the stage wrote") },
  });
  expect(await readFile(join(f.writer.runDirectory, "stages/01-work/1/1/output.txt"), "utf8"))
    .toBe("the bytes the stage wrote");
  expect(await readFile(f.output, "utf8")).toBe("the bytes the stage wrote");

  // And the same record says, in the gate's own words, that the verdict was
  // reached on something else. Two facts, one record, no fault between them.
  expect(await readFile(join(f.writer.runDirectory, "stages/01-work/1/1/checks/gate.txt"), "utf8"))
    .toBe("judged: gate-authored bytes\n");
  expect(record.find((event) => event["check"] === "gate")).toMatchObject({ exit: 0 });
});

test("a success hook that rewrites the passed output is a fault, never a seal", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "judged bytes"); return fauxAssistantMessage("done"); },
  ]);
  output = f.output;
  const success = await executable(f.root, "success.sh", "#!/bin/sh\nprintf 'rewritten' > \"$OUTPUT\"\nexit 0\n");
  const result = await run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", hooks: { success } });
  expect(result).toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "hash_drift")).toHaveLength(1);
  expect(record.filter((event) => event["sealed"] === true)).toHaveLength(0);
});

// Ticket 0133: an agent spends nearly the whole budget, then its gate receives
// a fresh budget of the same size. The manual clock asserts both deadlines.
// A short gate timeout would not prove the budget's size.
const AGENT_SPEND_MS = 900;
const STAGE_BUDGET_MS = 1_000;

test("a gate is armed for the whole stage budget, not for what the agent left of it", async () => {
  let output = "";
  const time = manualClock();
  const f = await fixture([
    async () => { time.advance(AGENT_SPEND_MS); await writeFile(output, "ready"); return fauxAssistantMessage("ready"); },
  ]);
  output = f.output;
  const marker = join(f.root, "gate-started");
  // The timer is armed in the same tick as the spawn, so the marker existing
  // means the budget is already on the clock.
  const gate = await executable(f.root, "gate.sh", `#!/bin/sh\ntouch '${marker}'\nsleep 60\n`);
  const running = run(
    f, { ...f.common, timeoutMs: STAGE_BUDGET_MS, mode: "stage", outputPath: f.output, outputExtension: "txt", gates: [gate] },
    undefined, time,
  );
  await waitFor(() => lstatExists(marker));
  expect(time.elapsed()).toBe(AGENT_SPEND_MS);
  expect(time.due()).toEqual([AGENT_SPEND_MS + STAGE_BUDGET_MS]);
  time.advance(STAGE_BUDGET_MS - 1);
  expect(time.due()).toEqual([AGENT_SPEND_MS + STAGE_BUDGET_MS]);
  time.advance(1);
  // The command budget ended at the exact stage deadline above. Process
  // settlement now keeps the result pending through its own 250 ms grace so
  // the command's group is gone before the gate returns.
  expect(time.due()).toEqual([AGENT_SPEND_MS + STAGE_BUDGET_MS + 250]);
  time.advance(249);
  expect(time.due()).toEqual([AGENT_SPEND_MS + STAGE_BUDGET_MS + 250]);
  time.advance(1);
  expect(await running).toMatchObject({ exit: 2, cause: "timeout" });
  const record = await events(f.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "check", check: "gate", exit: null }));
});

// Ticket 0144: the tmp-ceiling monitor only sets the fault flag, which the
// prompt loop reads at prompt boundaries. A breach that lands while the
// harness is idle — during checks or hooks — must still fault the stage:
// the flag is re-read before success is sealed.
test("a fault flag set during the success hook faults the stage instead of sealing success", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "settled"); return fauxAssistantMessage("done"); },
  ]);
  output = f.output;
  const started = join(f.root, "hook-started");
  const release = join(f.root, "release");
  const success = await executable(f.root, "success.sh", [
    "#!/bin/sh",
    `touch "${started}"`,
    `while [ ! -f "${release}" ]; do sleep 0.02; done`,
    "exit 0",
  ].join("\n") + "\n");
  const pending = run(f, { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", hooks: { success } });
  await waitFor(() => lstatExists(started));
  f.controls.fault = { reason: "$TMP exceeded its 3 bytes ceiling: 4 bytes." };
  await writeFile(release, "go");
  const result = await pending;
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: "$TMP exceeded its 3 bytes ceiling: 4 bytes." });
  const record = await events(f.writer.recordPath);
  expect(record.find((event) => event["event"] === "stage_end")).toMatchObject({ exit: 2, cause: "fault" });
});
