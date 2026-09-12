import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import pkg from "../package.json" with { type: "json" };
import * as recordEvents from "../src/record-events.ts";
import {
  checkEvent,
  choseEvent,
  fanoutDoneEvent,
  fanoutStartEvent,
  hashDriftEvent,
  hookEvent,
  loopDoneEvent,
  parallelDoneEvent,
  runEndEvent,
  runStartEvent,
  signalEvent,
  stageEndEvent,
  stageStartEvent,
  subflowCallEvent,
  toolCallEvent,
  turnEvent,
} from "../src/record-events.ts";
import {
  createRecordWriter,
  hashBytes,
  passedOutput,
  prehashAssembly,
  rehashExecutable,
  sealOutput,
} from "../src/record.ts";

const roots: string[] = [];
const identity = { stage: "02-loop/01-write", repeat: 2, retry: 1 };

async function temporary(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-record-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function first(run = "2026-07-31T12-00-00-abcd") {
  return runStartEvent({
    ts: "2026-07-31T12:00:00.000Z",
    run,
    assembly: "writer",
    assemblyHash: "a".repeat(64),
    flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 4, via: "stdin" },
  });
}

test("exclusive run-directory creation is the claim and appends serialize", async () => {
  const root = await temporary();
  const runs = join(root, "runs");
  await mkdir(runs);
  const results = await Promise.all([createRecordWriter(runs, first()), createRecordWriter(runs, first())]);
  expect(results.map((result) => result.status).sort()).toEqual(["created", "taken"]);
  const created = results.find((result) => result.status === "created");
  expect(created?.status).toBe("created");
  if (created?.status !== "created") return;
  await Promise.all([
    created.writer.append(signalEvent({ ts: "2026-07-31T12:00:01.000Z", signal: 15, name: "SIGTERM" })),
    created.writer.append(runEndEvent({ ts: "2026-07-31T12:00:02.000Z", exit: 143, cause: "signal" })),
  ]);
  const lines = (await readFile(created.writer.recordPath, "utf8")).trimEnd().split("\n");
  // Ticket 0115 redesign: the format integer still opens the file (invariant
  // 48) and the runtime that wrote it now stands beside it, so the head of the
  // first line carries both provenance facts. Nothing is loosened — `"ts":`
  // still follows, and the version is taken from `package.json` so the two can
  // never drift apart.
  expect(lines[0]?.startsWith(`{"record":1,"runtime":"${pkg.version}","ts":`)).toBe(true);
  expect(lines.map((line) => JSON.parse(line) as { event: string }).map((event) => event.event))
    .toEqual(["run_start", "signal", "run_end"]);
});

test("representative event constructors preserve the closed vocabulary and presence rules", () => {
  const ts = "2026-07-31T12:00:00.000Z";
  const events = [
    first(),
    runEndEvent({ ts, exit: 0, cause: "success" }),
    stageStartEvent({ ts, identity, received: [], options: [{ name: "model", value: "faux-1", rung: "stage" }], session: "stages/02-loop/01-write/2/session.jsonl" }),
    { ts, event: "prompt" as const, ...identity, prompt: [{ source: "request" as const, path: "request.txt" }] },
    stageEndEvent({ ts, identity, exit: 0, cause: "success", output: { path: "output.txt", sha256: "a" }, sealed: true, judged: true }),
    turnEvent({ ts, identity, provider: "faux", model: "faux-1", input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10, stop: "stop" }),
    checkEvent({ ts, identity, check: "output", exit: 0, capture: "checks/output.txt" }),
    toolCallEvent({ ts, identity, tool: "mark", decision: "done", item: 1 }),
    subflowCallEvent({ ts, identity, call: 1, flow: "oracle", input: { text: "why", sha256: "b", bytes: 3 }, depth: 1, started: false }),
    choseEvent({ ts, identity, chose: "safe", declined: ["fast"], reason: "safer" }),
    loopDoneEvent({ ts, identity, repeats: 2, endedBy: "stop", reason: "done" }),
    parallelDoneEvent({ ts, identity, width: 2, concurrent: 2, branches: [{ branch: "a", started: false }] }),
    fanoutStartEvent({ ts, identity: { stage: "03-run", retry: 1 },
      received: { path: "stages/01-plan/1/1/output.json", sha256: "f" }, items: "jobs", subflow: "worker",
      width: 1, maxItems: 1, manifestBytes: 4, manifestSha256: "f",
      plan: [{ item: "a", call: 1, request_bytes: 4, request_sha256: "g" }] }),
    fanoutDoneEvent({ ts, identity: { stage: "03-run", retry: 1 }, exit: 0, cause: "success", concurrent: 1 }),
    hookEvent({ ts, identity, hook: "before", exit: 0, capture: "before.txt", sha256: "c" }),
    hashDriftEvent({ ts, file: "gate.sh", expected: "d", actual: "e" }),
    signalEvent({ ts, signal: 2, name: "SIGINT" }),
  ];
  expect(events.map((event) => event.event)).toEqual([
    "run_start", "run_end", "stage_start", "prompt", "stage_end", "turn", "check", "tool_call",
    "subflow_call", "chose", "loop_done", "parallel_done", "fanout_start", "fanout_done", "hook", "hash_drift", "signal",
  ]);
  expect(events[8]).not.toHaveProperty("exit");
  expect(recordEvents).toHaveProperty("promptEvent", expect.any(Function));
});

test("assembly prehash covers every visible file in bytewise path order", async () => {
  const root = await temporary();
  await mkdir(join(root, "z"));
  await mkdir(join(root, ".ignored"));
  await writeFile(join(root, "b.txt"), "bravo");
  await writeFile(join(root, "z", "a.txt"), "alpha");
  await writeFile(join(root, ".secret"), "outside");
  await writeFile(join(root, ".ignored", "hidden.txt"), "outside");
  const prehash = await prehashAssembly(root);
  const expectedText = [
    `b.txt:${hashBytes("bravo")}`,
    `z/a.txt:${hashBytes("alpha")}`,
  ].join("\n");
  expect(prehash.sha256).toBe(hashBytes(expectedText));
  expect([...prehash.files.keys()]).toEqual(["b.txt", "z/a.txt"]);
});

// ADR 0016 point 3: a gate's behavior depends on its executable bit, so the bit
// belongs to the aggregate identity — bytes alone do not identify an assembly.
test("an executable file's identity line carries `:x` and a non-executable's does not", async () => {
  const root = await temporary();
  await writeFile(join(root, "gate.sh"), "exit 0\n");
  await writeFile(join(root, "plain.txt"), "plain");
  const gateLine = `gate.sh:${hashBytes("exit 0\n")}`;
  const plainLine = `plain.txt:${hashBytes("plain")}`;
  const before = await prehashAssembly(root);
  expect(before.sha256).toBe(hashBytes([gateLine, plainLine].join("\n")));
  await chmod(join(root, "gate.sh"), 0o755);
  const after = await prehashAssembly(root);
  expect(after.sha256).not.toBe(before.sha256);
  expect(after.sha256).toBe(hashBytes([`${gateLine}:x`, plainLine].join("\n")));
  // Any execute bit, not the owner's: group-only execute still marks the line.
  await chmod(join(root, "plain.txt"), 0o610);
  expect((await prehashAssembly(root)).sha256).toBe(hashBytes([`${gateLine}:x`, `${plainLine}:x`].join("\n")));
  // The bit is identity, not content: the per-file hash the invariant-14 drift
  // check compares against is still the hash of the bytes and nothing else.
  expect(after.files.get("gate.sh")).toBe(hashBytes("exit 0\n"));
});

test("executables are rehashed and output seal drift is terminal", async () => {
  const root = await temporary();
  const executable = join(root, "gate.sh");
  await writeFile(executable, "exit 0\n");
  const expected = hashBytes("exit 0\n");
  expect(await rehashExecutable(executable, "flows/main/01/gate.sh", expected))
    .toEqual({ status: "unchanged", file: "flows/main/01/gate.sh", sha256: expected });
  await writeFile(executable, "exit 1\n");
  expect(await rehashExecutable(executable, "flows/main/01/gate.sh", expected))
    .toMatchObject({ status: "drifted", expected, exit: 2, cause: "fault" });

  const output = join(root, "output.txt");
  await writeFile(output, "passed");
  const passed = passedOutput(output, "stages/01-write/1/1/output.txt", Buffer.from("passed"));
  expect(await sealOutput(passed)).toMatchObject({ status: "sealed", sealed: true, judged: true });
  await writeFile(output, "changed");
  expect(await sealOutput(passed)).toEqual({
    status: "drifted",
    drift: { file: passed.output.path, expected: hashBytes("passed"), actual: hashBytes("changed") },
    exit: 2,
    cause: "fault",
    reason: `Output changed after its checks passed: ${passed.output.path}`,
  });

  // Ticket 0072, one candidate per attempt: the digest is the captured buffer's,
  // never a re-read of the live path. The file holds "changed" here, so a
  // candidate built from the judged buffer names "passed" and seals as drift —
  // the record cannot name bytes no check ever saw.
  const candidate = passedOutput(output, "stages/01-write/1/1/output.txt", Buffer.from("passed"));
  expect(candidate.output.sha256).toBe(hashBytes("passed"));
  expect(await sealOutput(candidate)).toMatchObject({ status: "drifted", exit: 2, cause: "fault" });
});
