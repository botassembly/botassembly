// Ticket 0063 item 4 — subflow residue: `input-file` slot expansion, pinned for
// EVERY variable the specification lists, and batch concurrency witnessed on
// purpose rather than relied on by accident.
//
// The sentence this file is the witness for, `specification/elements/subflow.md`
// lines 65-69, in full:
//
//   "A tool payload is JSON, and no shell expands it, so the runtime does: any
//    slot variable in an `input-file` path — `$TMP`, `$SUBFLOWS`, `$INPUT`,
//    `$OUTPUT`, `$PWD`, a declared slot — is expanded by the runtime before the
//    path is read, uniformly, which is what lets an agent name files by slot in
//    a tool call the way it does everywhere else."
//
// Six variables, so six rows in CARRIERS below and one subflow per row. Before
// this file only `$TMP` was covered (cli-subflow-pins.test.ts leg 1); the other
// five were expanded by the runtime and asserted by nothing. "Uniformly" is the
// load-bearing word, and a representative sample cannot witness it.
//
// Each row is checked three ways, because bytes alone would not prove that the
// slot resolved to the right PLACE:
//   1. the record's `input.path` is the absolute path the variable expands to,
//   2. the bytes that arrived are the bytes that were at it,
//   3. the call's folder is the typed pair, extensioned by the file's own name
//      (subflow.md:99-105) — which is how `.md`, `.json` and `.txt` all appear.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { BOUNDARY_MS } from "./boundary.ts";
import { at, callsSubflow, events, queue, realBoundary, router, tempRoots, writes, type Message } from "./cli-boundary.ts";
import { attempt, scratchRun } from "./scratch.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const PARENT = "Parentmarker: hand each file down by the slot that names it.";
const ANSWER = "the child's answer";

/** Where a slot points once the runtime has expanded it. */
interface Where { stage: string; workdir: string; corpus: string }

interface Carrier {
  slot: string;
  flow: string;
  marker: string;
  /** The `input-file` exactly as the agent writes it in the tool payload. */
  wrote: string;
  /** The absolute path it must expand to. */
  expands: (where: Where) => string;
  bytes: string;
  extension: string;
  /** `$SUBFLOWS` names an answer that does not exist until call 1 has landed,
   *  so it is the one row that must be a second batch. */
  batch: 1 | 2;
}

// One row per variable in subflow.md:65-69, in the order the calls are made.
const CARRIERS: Carrier[] = [
  {
    slot: "$INPUT", flow: "from-input", marker: "Inputchild",
    wrote: "$INPUT/request.txt", expands: (w) => join(w.stage, "input/request.txt"),
    bytes: "the request", extension: "txt", batch: 1,
  },
  {
    slot: "$OUTPUT", flow: "from-output", marker: "Outputchild",
    wrote: "$OUTPUT", expands: (w) => join(w.stage, "output.txt"),
    bytes: "the parent's own draft", extension: "txt", batch: 1,
  },
  {
    slot: "$TMP", flow: "from-tmp", marker: "Tmpchild",
    wrote: "$TMP/scratch-note.json", expands: (w) => join(w.stage, "tmp/scratch-note.json"),
    bytes: '{"note":"written by the stage itself"}', extension: "json", batch: 1,
  },
  {
    slot: "$PWD", flow: "from-pwd", marker: "Pwdchild",
    wrote: "$PWD/tree-note.md", expands: (w) => join(w.workdir, "tree-note.md"),
    bytes: "a note lying in the working tree\n", extension: "md", batch: 1,
  },
  {
    slot: "a declared slot", flow: "from-corpus", marker: "Corpuschild",
    wrote: "$CORPUS/fact.md", expands: (w) => join(w.corpus, "fact.md"),
    bytes: "a fact from the trusted collection\n", extension: "md", batch: 1,
  },
  {
    slot: "$SUBFLOWS", flow: "from-answers", marker: "Answerschild",
    wrote: "$SUBFLOWS/1/output.txt", expands: (w) => join(w.stage, "answers/1/output.txt"),
    bytes: ANSWER, extension: "txt", batch: 2,
  },
];

function batch(which: 1 | 2): Carrier[] {
  return CARRIERS.filter((carrier) => carrier.batch === which);
}

/** The call number a carrier was given: the array's own order, from 1. */
function callOf(carrier: Carrier): number {
  return [...batch(1), ...batch(2)].indexOf(carrier) + 1;
}

async function assembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all(CARRIERS.map((carrier) => mkdir(join(base, "subflows", carrier.flow), { recursive: true })));
  await Promise.all([
    // `slots:` is what makes `--corpus` a declared slot rather than an unknown
    // key (assembly.md); the runtime uppercases the name into `$CORPUS`.
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\nslots:\n  corpus: A trusted reference collection.\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), `---\n---\n${PARENT}\n`),
    ...CARRIERS.flatMap((carrier) => [
      writeFile(join(base, "subflows", carrier.flow, "FLOW.md"), `---\ndescription: answer from ${carrier.flow}\n---\n`),
      writeFile(join(base, "subflows", carrier.flow, "01-answer.md"), `---\n---\n${carrier.marker} answers.\n`),
    ]),
  ]);
}

test("an input-file is expanded for every slot variable subflow.md lists — $INPUT, $OUTPUT, $TMP, $PWD, a declared slot and $SUBFLOWS — each to its own place, uniformly", async () => {
  const { root, home } = await scratch("bot-cli-subflow-slots-");
  const workdir = join(root, "workdir");
  const corpus = join(root, "corpus");
  await Promise.all([mkdir(workdir, { recursive: true }), mkdir(corpus, { recursive: true }), assembly(home)]);
  // The two files that exist before the run: one in the working tree, one in
  // the supplied collection. Neither is anywhere the runtime would look by
  // itself, so only expansion can reach them.
  const treeNote = CARRIERS.find((carrier) => carrier.slot === "$PWD");
  const corpusFact = CARRIERS.find((carrier) => carrier.slot === "a declared slot");
  await Promise.all([
    writeFile(join(workdir, "tree-note.md"), treeNote?.bytes ?? ""),
    writeFile(join(corpus, "fact.md"), corpusFact?.bytes ?? ""),
  ]);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const tmpNote = CARRIERS.find((carrier) => carrier.slot === "$TMP");
  const draft = CARRIERS.find((carrier) => carrier.slot === "$OUTPUT");

  // The parent writes the two files it owns — one under `$TMP`, one at
  // `$OUTPUT` — and then names all six by slot. Every child answers the same
  // thing; what is under test is what the runtime READ, not what came back.
  queue(faux, router({
    [PARENT]: (round) => {
      if (round === 1) return writes("$TMP/scratch-note.json", tmpNote?.bytes ?? "");
      if (round === 2) return writes("$OUTPUT", draft?.bytes ?? "");
      if (round === 3) return callsSubflow(batch(1).map((carrier) => ({ flow: carrier.flow, "input-file": carrier.wrote })));
      if (round === 4) return callsSubflow(batch(2).map((carrier) => ({ flow: carrier.flow, "input-file": carrier.wrote })));
      return fauxAssistantMessage("parent done");
    },
    // One marker per child, so each child's round counter is its own: a batch's
    // children run at once and a shared counter could not survive interleaving.
    ...Object.fromEntries(CARRIERS.map((carrier) => [
      carrier.marker,
      (round: number) => (round === 1 ? writes("$OUTPUT", ANSWER) : fauxAssistantMessage("child done")),
    ])),
  }), 40);

  await expect(main(["run", "start", "review/main", "--corpus", corpus, "--in", workdir, "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe(draft?.bytes);

  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const stage = attempt(scratchRun(join(root, "cache"), home, run), "01-parent");
  const where: Where = { stage, workdir, corpus };
  const record = await events(join(home, "runs", run, "record.jsonl"));
  const calls = record.filter((event) => event["event"] === "subflow_call");

  // The three places the run is distinct are really distinct, so a row that
  // expanded to the wrong one could not pass by coincidence.
  expect(new Set([stage, workdir, corpus]).size).toBe(3);

  // EVERY row, one leg each. A variable missing from CARRIERS would be a
  // variable this test silently does not cover, so the list is checked against
  // the specification's own count first.
  expect(CARRIERS).toHaveLength(6);
  expect(CARRIERS.map((carrier) => carrier.slot).sort()).toEqual(
    ["$INPUT", "$OUTPUT", "$PWD", "$SUBFLOWS", "$TMP", "a declared slot"],
  );

  for (const carrier of CARRIERS) {
    const call = callOf(carrier);
    const label = `${carrier.slot} via ${carrier.wrote}`;
    const expanded = carrier.expands(where);

    // 1. The runtime expanded the variable to this absolute path and read it
    //    there. The public record retains the normalized runtime-owned child
    //    request path rather than exposing the source slot's absolute path.
    const event = calls.find((held) => held["call"] === call);
    const retained = `stages/01-parent/1/1/subflows/${String(call)}/request.${carrier.extension}`;
    expect(event, label).toMatchObject({
      flow: carrier.flow, started: true, exit: 0, cause: "success",
      input: { path: retained, bytes: Buffer.byteLength(carrier.bytes) },
    });

    // 2. The child received those bytes before its parent settled. `$TMP` is
    // disposable, so it alone no longer exists after settlement; the child's
    // retained input is the durable proof of the same bytes.
    if (carrier.slot === "$TMP") await expect(readFile(expanded, "utf8"), label).rejects.toThrow();
    else await expect(readFile(expanded, "utf8"), label).resolves.toBe(carrier.bytes);

    // 3. The call's folder is the typed pair, and `input` carries the file's
    //    own extension — .txt, .json and .md all reached here by expansion.
    const answers = join(stage, "answers", String(call));
    await expect(readdir(answers), label).resolves.toEqual([`input.${carrier.extension}`, "output.txt"]);
    await expect(readFile(join(answers, `input.${carrier.extension}`), "utf8"), label).resolves.toBe(carrier.bytes);
  }

  // Nothing silently did not happen: six calls, numbered 1..6 across the two
  // batches, in the order the rows are written.
  expect(calls.map((event) => [event["call"], event["flow"]])).toEqual(
    [...batch(1), ...batch(2)].map((carrier, index) => [index + 1, carrier.flow]),
  );
});

const FIRST = "Firstchild: one of a pair.";
const SECOND = "Secondchild: the other of the pair.";
const PAIR = "Pairmarker: send both at once.";

async function pairAssembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(base, "flows/main"), { recursive: true }),
    mkdir(join(base, "subflows/first"), { recursive: true }),
    mkdir(join(base, "subflows/second"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), `---\n---\n${PAIR}\n`),
    writeFile(join(base, "subflows/first/FLOW.md"), "---\ndescription: one\n---\n"),
    writeFile(join(base, "subflows/first/01-answer.md"), `---\n---\n${FIRST}\n`),
    writeFile(join(base, "subflows/second/FLOW.md"), "---\ndescription: the other\n---\n"),
    writeFile(join(base, "subflows/second/01-answer.md"), `---\n---\n${SECOND}\n`),
  ]);
}

// subflow.md:71 — "The runtime runs the batch's children at once and the tool
// returns when the last of them ends."
//
// Nothing witnessed this before. Two existing tests SAY it, in comments
// explaining why their scripts are prompt-routed rather than positional, but
// neither asserts it: a runtime that ran a batch strictly in sequence passed
// the whole gate. It is witnessed here by construction, in the flow.test.ts
// idiom — a barrier neither child can pass until BOTH are inside it, so the
// peak occupancy is 2 only if they were ever in flight together.
//
// The guard on the barrier is what keeps a sequential runtime an ASSERTION
// rather than a hang: on a concurrent runtime the barrier settles at once and
// the guard is never reached, so it can add no flake to the green path.
test("the children of one subflow batch run at once", async () => {
  const { root, home } = await scratch("bot-cli-subflow-atonce-");
  await pairAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);

  let inFlight = 0;
  let peak = 0;
  let admit = (): void => undefined;
  const both = new Promise<void>((settle) => { admit = (): void => { settle(); }; });
  // Only reached when a runtime never puts two children in flight, which is the
  // failing direction; it turns a would-be hang into the assertion below.
  //
  // It must sit BELOW the test's own budget or the nesting is inverted and the
  // failure lies about its cause — item 12's lesson. Two children waiting it
  // out in sequence costs 2 x ADMIT_MS, comfortably inside the BOUNDARY_MS this
  // test is given, so a sequential runtime reports `expected 1 to be 2` rather
  // than "Test timed out". On a concurrent runtime the barrier settles at once
  // and this timer is never awaited to completion, so it can add no flake to
  // the green path.
  const ADMIT_MS = 2_000;
  const guard = new Promise<void>((settle) => { setTimeout(settle, ADMIT_MS).unref(); });

  const child = (round: number): Message | Promise<Message> => {
    if (round !== 1) return fauxAssistantMessage("child done");
    return (async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      if (inFlight === 2) admit();
      await Promise.race([both, guard]);
      inFlight -= 1;
      return writes("$OUTPUT", "answered");
    })();
  };

  queue(faux, router({
    [PAIR]: (round) => {
      if (round === 1) return callsSubflow([{ flow: "first", input: "one" }, { flow: "second", input: "two" }]);
      if (round === 2) return writes("$OUTPUT", "parent answer");
      return fauxAssistantMessage("parent done");
    },
    [FIRST]: child,
    [SECOND]: child,
  }), 24);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  // THE WITNESS: both children held a slot at the same moment. A runtime that
  // awaited each call before starting the next would peak at 1.
  expect(peak).toBe(2);

  // And both really are complete runs that ended well, so the overlap was not
  // bought by one of them failing early.
  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const calls = (await events(join(home, "runs", run, "record.jsonl")))
    .filter((event) => event["event"] === "subflow_call");
  expect(calls).toHaveLength(2);
  for (const call of calls) expect(call).toMatchObject({ started: true, exit: 0, cause: "success" });
}, BOUNDARY_MS);
