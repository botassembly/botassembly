// Ticket 0151 — the LOOP pins the survey found loose, in the shape 0056 gave
// subflows: end to end through the REAL `main(["run", "start", ...])` with the faux
// provider (the cli-* idiom), so what is witnessed is the runtime's own.
//
// What was ALREADY pinned, and is therefore not repeated here: the one-stage
// handoff and `ended_by: "limit"` on a bodyless loop (cli-fanout-handoff.test.ts
// :131), the three loop_done endings over the flow runner (flow.test.ts:58), a
// provider fault inside a later repeat (hostile-flow.test.ts:129), the held
// unanswered question (gating.test.ts:243), the question's own timeout
// (hostile-gating.test.ts:257), one retained prompt pair per repeat
// (prompt-retained.test.ts:213), and the repeat-keyed scratch tree
// (runtime-scratch-opacity.test.ts:159).
//
// What was loose, and is what this file is for:
// - loop.md "Running out": a loop that reaches `repeat` while the agent is
//   still saying continue FAILS, cause `rejected` — including the chapter's own
//   `repeat: 1` sentence. No test anywhere drove a question loop to its ceiling.
// - loop.md "Who is asked, and when": "The last stage inside the loop, because
//   it is the only one that has seen the whole repeat." Every existing loop
//   fixture holds exactly ONE stage, where last and first are the same string.
// - loop.md "Input and output": what repeat 2's FIRST stage receives is the
//   previous repeat's LAST stage's output. A one-stage loop cannot tell those
//   two apart either.
// - loop.md: "The agent is told the question and not how many repeats remain."
// - The unanswered-question send-back sentence, byte for byte.
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "./initialized-cli.ts";
import {
  at, events, queue, realBoundary, received, router, runsIn, sealedOutput, start, tempRoots, writes,
  type Message, type Seen,
} from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";
const WORK = "Workmarker: revise the draft.";
const DRAFT = "Draftmarker: write the draft.";
const REVIEW = "Reviewmarker: review what was drafted.";
const TAIL = "Tailmarker: use the final draft.";
// The question is authored here and quoted nowhere else, so a byte-comparison
// against it cannot be satisfied by anything the runtime composes.
const QUESTION = "Is the draft ready to publish?";
const CONTINUING = "there is still a paragraph to cut";
const STOPPING = "it reads well now";

/** A one-stage loop asking `QUESTION`, with a tail after it. */
async function oneStageLoop(home: string, repeat: number, options = ""): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-cycle"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-cycle/LOOP.md"), `---\nrepeat: ${String(repeat)}\n---\n${QUESTION}\n`),
    writeFile(join(flow, "01-cycle/01-work.md"), `---\n${options}---\n${WORK}\n`),
    writeFile(join(flow, "02-tail.md"), `---\n---\n${TAIL}\n`),
  ]);
}

const answer = (held: "continue" | "stop", reason: string): Message =>
  fauxAssistantMessage([fauxToolCall("continue", { answer: held, reason })], { stopReason: "toolUse" });

/** A stage that writes its output and then is asked the loop's question: three
 *  rounds per repeat — the write, the turn that ends the work, the answer. */
function cycles(text: string, reply: (repeat: number) => Message) {
  return (round: number): Message => {
    const step = (round - 1) % 3;
    if (step === 0) return writes("$OUTPUT", `${text} ${String(Math.ceil(round / 3))}`);
    if (step === 1) return fauxAssistantMessage("done");
    return reply(Math.ceil(round / 3));
  };
}

// loop.md "Running out": "A loop that reaches `repeat` while the agent is still
// saying continue **fails**, with cause `rejected` — the assembly's own bound
// said no ... Ten unfinished repeats is not a success with the tenth draft."
// And the chapter's own worked example: "A loop asking a question with
// `repeat: 1` fails the run the first time the agent says continue, and one
// asking with `repeat: 3` fails after three clean, gate-cleared repeats."
test("a question loop that reaches `repeat` still saying continue fails the run rejected, at 1 and at 3", async () => {
  for (const repeat of [1, 3]) {
    const { root, home } = await scratch("bot-cli-loop-running-out-");
    await oneStageLoop(home, repeat);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const { held, faux } = realBoundary(root, home, stdout, stderr);
    queue(faux, router({
      [WORK]: cycles("draft", () => answer("continue", CONTINUING)),
      [TAIL]: (round) => round === 1 ? writes("$OUTPUT", "never") : fauxAssistantMessage("done"),
    }), repeat * 3 + 2);

    // The run fails. Nothing reaches standard output, because the run has no
    // answer to give (runtime.md "Streams").
    expect(await main(["run", "start", "review/main", "the request"], held), `repeat ${String(repeat)}`).toBe(1);
    expect(Buffer.concat(stdout).toString()).toBe("");
    // The one user-facing sentence of this ending, byte for byte: cli.ts prints
    // `<cause>: <reason>`. REDESIGN 0155: the reason is the runtime's own
    // sentence naming the bound that ended the work — the repeat limit and the
    // number it reached — with the agent's last word relayed verbatim after the
    // colon. Before 0155 this line was `rejected: ${CONTINUING}\n`, which told
    // the reader a paragraph was still uncut and never that the budget was what
    // stopped the cutting.
    expect(Buffer.concat(stderr).toString(), `repeat ${String(repeat)}`)
      .toBe(`rejected: The loop reached its repeat limit (${String(repeat)}): ${CONTINUING}\n`);

    const run = at(await runsIn(home), 0);
    const record = await events(join(home, "runs", run, "record.jsonl"));
    // record.md "For each container": "how many repeats a LOOP ran and what
    // ended it" — the count ran out, and the agent's last reason is kept with it
    // (loop.md "In the record": "what the agent said").
    expect(record.filter((event) => event["event"] === "loop_done")).toEqual([expect.objectContaining({
      stage: "01-cycle", repeats: repeat, ended_by: "limit", reason: CONTINUING,
    })]);
    expect(record.filter((event) => event["event"] === "run_end"))
      .toEqual([expect.objectContaining({ exit: 1, cause: "rejected" })]);
    // Every repeat really ran and really cleared its checks — the failure is the
    // ceiling, not a stage that fell over on the way to it.
    expect(record.filter((event) => event["event"] === "stage_end" && event["stage"] === "01-cycle/01-work")
      .map((event) => [event["repeat"], event["exit"], event["sealed"]]))
      .toEqual(Array.from({ length: repeat }, (_unused, index) => [index + 1, 0, true]));
    // And the stage after the loop never started: a rejected loop ends the flow.
    expect(record.filter((event) => event["stage"] === "02-tail")).toEqual([]);
  }
});

// REDESIGN 0155 left the reason-absent half of the composed sentence —
// `The loop reached its repeat limit (2).` — deliberately UNWITNESSED here,
// because no valid assembly can reach it. `limitOutcome` sees no reason only
// when the loop's final result carries no continuation at all, and two rules
// together forbid that: graph.md refuses a sequence that does not end in a
// stage (`tail-container`), so a loop's last node is always the STAGE that is
// asked; and a loop-mode stage that exits 0 always carries a continuation,
// whose `reason` the `continue` tool's schema requires non-empty. An agent
// answering `continue` with no reason does not reach the branch either — the
// call is refused before the control is set, the question check fails, and the
// loop ends `exhausted: Answer the question with \`continue\`.` (pinned below).
// The fallback stays in the source because the type admits it, not because a
// run can produce it; witnessing it would mean hand-building a graph `bot
// check` rejects, which this file's end-to-end idiom exists to avoid.

/** A two-stage loop: `01-draft` then `02-review`, the last one being the only
 *  one that has seen the whole repeat (loop.md "Who is asked, and when"). */
async function twoStageLoop(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-cycle"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-cycle/LOOP.md"), `---\nrepeat: 4\n---\n${QUESTION}\n`),
    writeFile(join(flow, "01-cycle/01-draft.md"), `---\n---\n${DRAFT}\n`),
    writeFile(join(flow, "01-cycle/02-review.md"), `---\n---\n${REVIEW}\n`),
    writeFile(join(flow, "02-tail.md"), `---\n---\n${TAIL}\n`),
  ]);
}

interface Part { type: string; text?: string }
interface Turn { role: string; content: string | Part[] }

/** The user turns of one model call, in order, flattened to text. */
function userTurns(held: Seen): string[] {
  const turns = JSON.parse(held.messages) as Turn[];
  return turns.filter((turn) => turn.role === "user")
    .map((turn) => typeof turn.content === "string" ? turn.content : turn.content.map((part) => part.text ?? "").join("\n"));
}

test("only the LAST stage inside a loop is asked the question, and it is asked the question and nothing else", async () => {
  const { root, home } = await scratch("bot-cli-loop-asked-");
  await twoStageLoop(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    // `01-draft` is inside the loop and is NOT the last stage: two rounds per
    // repeat, never three, because it is never asked anything.
    [DRAFT]: (round) => round % 2 === 1 ? writes("$OUTPUT", `draft ${String(Math.ceil(round / 2))}`) : fauxAssistantMessage("done"),
    [REVIEW]: cycles("review", (repeat) => repeat === 1 ? answer("continue", CONTINUING) : answer("stop", STOPPING)),
    [TAIL]: (round) => round === 1 ? writes("$OUTPUT", "the tail answer") : fauxAssistantMessage("done"),
  }, seen), 20);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the tail answer");

  // THE PIN. The question is a user turn of `02-review` and of nothing else —
  // not of `01-draft`, which ran the same two repeats beside it.
  const asked = (marker: string): string[] => seen.filter((call) => call.systemPrompt.includes(marker)).flatMap(userTurns);
  expect(asked(DRAFT).filter((turn) => turn.includes(QUESTION))).toEqual([]);
  const questions = asked(REVIEW).filter((turn) => turn.includes(QUESTION));
  // Two repeats, one question each, and each one is the authored body EXACTLY:
  // "The agent is told the question and not how many repeats remain" — a turn
  // byte-equal to the question carries no count, and the two are identical, so
  // nothing in it counted down either. The body keeps its trailing newline; the
  // fixture writes one more (loop.md: "the body of the file is the prompt").
  expect(questions).toEqual([`${QUESTION}\n`, `${QUESTION}\n`]);
  // And it really is the LAST thing that stage is asked: the loop ran twice and
  // stopped on the answer, so the question was not decoration.
  const record = await events(join(home, "runs", at(await runsIn(home), 0), "record.jsonl"));
  expect(record.filter((event) => event["event"] === "loop_done")).toEqual([expect.objectContaining({
    stage: "01-cycle", repeats: 2, ended_by: "stop", reason: STOPPING,
  })]);
});

test("inside a two-stage loop the stages see each other's names; outside, only the loop's own name and its LAST stage's output", async () => {
  const { root, home } = await scratch("bot-cli-loop-handoff-");
  await twoStageLoop(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    [DRAFT]: (round) => round % 2 === 1 ? writes("$OUTPUT", `draft ${String(Math.ceil(round / 2))}`) : fauxAssistantMessage("done"),
    [REVIEW]: cycles("review", (repeat) => repeat === 1 ? answer("continue", CONTINUING) : answer("stop", STOPPING)),
    [TAIL]: (round) => round === 1 ? writes("$OUTPUT", "the tail answer") : fauxAssistantMessage("done"),
  }), 20);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const record = await events(join(home, "runs", at(await runsIn(home), 0), "record.jsonl"));

  const draft = (repeat: number) => sealedOutput(record, "01-cycle/01-draft", repeat);
  const review = (repeat: number) => sealedOutput(record, "01-cycle/02-review", repeat);
  // loop.md "Input and output": "The loop's first stage receives the loop's own
  // input on the first repeat."
  expect(received(start(record, "01-cycle/01-draft", 1))).toEqual([expect.objectContaining({ name: "request.txt" })]);
  // THE PIN. "On every repeat after that it also receives the previous repeat's
  // output, as another named file in $INPUT" — and the previous repeat's output
  // is the LAST stage's, `02-review`, arriving as `review.txt`. A one-stage loop
  // cannot tell that from "the first stage's own previous output".
  expect(received(start(record, "01-cycle/01-draft", 2))).toEqual([
    expect.objectContaining({ name: "request.txt" }),
    { name: "review.txt", path: review(1).path, sha256: review(1).sha256 },
  ]);
  // "The stages after the first one inside a loop are ordinary sequential
  // stages: each receives the output of the one before it, repeat after
  // repeat" — by the producing STAGE's name, both times.
  for (const repeat of [1, 2]) {
    expect(received(start(record, "01-cycle/02-review", repeat)))
      .toEqual([{ name: "draft.txt", path: draft(repeat).path, sha256: draft(repeat).sha256 }]);
  }
  // "Inside the loop the stages see each other's names; outside it, which stage
  // wrote the result is the loop's business" (invariant 26): the tail is handed
  // `cycle.txt`, never `review.txt`, and its bytes are the LAST repeat's.
  expect(received(start(record, "02-tail")))
    .toEqual([{ name: "cycle.txt", path: review(2).path, sha256: review(2).sha256 }]);
  expect(review(2).path).toBe("stages/01-cycle/02-review/2/1/output.txt");
  await expect(readFile(join(home, "runs", at(await runsIn(home), 0), review(2).path), "utf8")).resolves.toBe("review 2");
});

// loop.md "Who is asked, and when": "An agent that stops without answering the
// question is held and asked again, spending a retry like any failing round —
// `retries` bounds send-backs whatever caused them, and an unanswered question
// is a round that failed." With `retries: 0` there is no send-back to spend,
// so the first unanswered question is the last one.
test("an unanswered question is a failed round: the send-back sentence is byte-exact and `retries` bounds it", async () => {
  const { root, home } = await scratch("bot-cli-loop-unanswered-");
  await oneStageLoop(home, 2, "retries: 0\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    [WORK]: cycles("draft", () => fauxAssistantMessage("I have nothing to say about that.")),
    [TAIL]: (round) => round === 1 ? writes("$OUTPUT", "never") : fauxAssistantMessage("done"),
  }), 8);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(1);
  expect(Buffer.concat(stdout).toString()).toBe("");
  // THE SENTENCE, byte for byte, on the one channel a caller reads.
  expect(Buffer.concat(stderr).toString()).toBe("exhausted: Answer the question with `continue`.\n");

  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));
  // The same bytes on the record's own channel: a `question` check that failed,
  // its capture on disk under the attempt that produced it.
  const question = record.filter((event) => event["event"] === "check" && event["check"] === "question");
  expect(question).toEqual([expect.objectContaining({
    stage: "01-cycle/01-work", repeat: 1, retry: 1, exit: 1,
    capture: "stages/01-cycle/01-work/1/1/checks/question.txt",
  })]);
  await expect(readFile(join(home, "runs", run, "stages/01-cycle/01-work/1/1/checks/question.txt"), "utf8"))
    .resolves.toBe("Answer the question with `continue`.\n");

  // The loop ends on the repeat that failed — not at `repeat: 2` — and says so.
  expect(record.filter((event) => event["event"] === "loop_done")).toEqual([expect.objectContaining({
    stage: "01-cycle", repeats: 1, ended_by: "exhausted", reason: "Answer the question with `continue`.\n",
  })]);
  // gating.md/loop.md: the question is asked AFTER the checks clear, so the
  // work that passed them is kept even though the question sank the stage.
  const end = record.find((event) => event["event"] === "stage_end" && event["stage"] === "01-cycle/01-work");
  expect(end).toMatchObject({ exit: 1, cause: "exhausted", judged: true, sealed: false });
  expect(record.filter((event) => event["stage"] === "02-tail")).toEqual([]);
});
