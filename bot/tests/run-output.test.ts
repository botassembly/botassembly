import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCliBytes, type InvokedBytes } from "./invoke.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());
const RUN = "2026-09-05T21-00-00-a026";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function retainedRun(home: string, name: string, root: Buffer, stage = Buffer.from("inner")): Promise<void> {
  const directory = join(home, "runs", name);
  const outputs = [["01-inner", stage], ["02-answer", root]] as const;
  const rows: Record<string, unknown>[] = [
    { record: 1, event: "run_start", ts: "2026-09-05T21:00:00.000Z", run: name,
      assembly: "review", assembly_hash: "a".repeat(64), flow: "main" },
  ];
  for (const [index, [stageName, bytes]] of outputs.entries()) {
    const path = `stages/${stageName}/1/1/output.txt`;
    await mkdir(join(directory, "stages", stageName, "1", "1"), { recursive: true });
    await writeFile(join(directory, ...path.split("/")), bytes);
    rows.push(
      { event: "stage_start", ts: `2026-09-05T21:00:0${String(index + 1)}.000Z`, stage: stageName, retry: 1 },
      { event: "stage_end", ts: `2026-09-05T21:00:0${String(index + 1)}.500Z`, stage: stageName, retry: 1,
        exit: 0, cause: "success", output: { path, sha256: sha256(bytes) }, sealed: true, judged: true },
    );
  }
  rows.push({ event: "run_end", ts: "2026-09-05T21:00:04.000Z", exit: 0, cause: "success" });
  await writeFile(join(directory, "record.jsonl"), currentRecord(rows));
}

async function parity(home: string, args: string[]): Promise<InvokedBytes> {
  const current = await invokeCliBytes(["run", "output", ...args, "--raw"], { home });
  return current;
}

test("run output preserves bytes and exits for root, stage, missing, changed, and ambiguous selection", async () => {
  const { home } = await roots.scratch("bot-run-output-parity-");
  const binary = Buffer.from([0xff, 0x00, 0x7c]);
  await retainedRun(home, RUN, binary);
  await expect(parity(home, [RUN])).resolves.toMatchObject({ code: 0, out: binary });
  await expect(parity(home, [RUN, "01-inner"])).resolves.toMatchObject({ code: 0, out: Buffer.from("inner") });
  await expect(parity(home, [RUN, "03-missing"])).resolves.toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await writeFile(join(home, "runs", RUN, "stages/02-answer/1/1/output.txt"), Buffer.from("changed"));
  await expect(parity(home, [RUN])).resolves.toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await retainedRun(home, "2026-09-05T21-00-00-b026", Buffer.from("second"));
  await expect(parity(home, ["2026-09-05T21"])).resolves.toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await expect(parity(home, ["missing"])).resolves.toMatchObject({ code: 1, out: Buffer.alloc(0) });
});

test("the compiled output command returns a large accepted output", async () => {
    const { home } = await roots.scratch("bot-run-output-limit-");
    const bytes = Buffer.alloc(1_048_577, "x"), stage = Buffer.alloc(1_048_578, "y");
    await retainedRun(home, RUN, bytes, stage);
    await expect(invokeCliBytes(["run", "output", RUN, "--raw"], {
      home, env: { TMPDIR: join(home, "absent-temporary-directory") },
    }))
      .resolves.toEqual({ code: 0, out: bytes, err: Buffer.alloc(0) });
    await expect(invokeCliBytes(["run", "output", RUN, "01-inner", "--raw"], { home }))
      .resolves.toEqual({ code: 0, out: stage, err: Buffer.alloc(0) });
});

test("the compiled output command preserves the exact retained byte boundary", async () => {
  const { home } = await roots.scratch("bot-run-output-boundary-");
  const bytes = Buffer.alloc(1_048_576, "x");
  await retainedRun(home, RUN, bytes);
  const held = await parity(home, [RUN]);
  expect(held).toMatchObject({ code: 0, out: bytes });
});

test("real start and resume descriptors resolve to their exact retained output", async () => {
  const { root, home } = await roots.scratch("bot-run-output-descriptor-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-answer.md"), "---\n---\nAnswer.\n"),
  ]);
  const bytes = Buffer.alloc(70_000, "z");
  const answer = bytes.toString();
  const execute = async (command: string[], responses: ReturnType<typeof fauxAssistantMessage>[]) => {
    const out: Buffer[] = [], err: Buffer[] = [];
    const { held, faux } = realBoundary(root, home, out, err);
    faux.setResponses(responses);
    const code = await main(command, held);
    return { code, out: Buffer.concat(out), err: Buffer.concat(err) };
  };
  const assertResult = async (held: Awaited<ReturnType<typeof execute>>) => {
    expect(held.code).toBe(0);
    expect(held.err).toEqual(Buffer.alloc(0));
    const data = (JSON.parse(held.out.toString()) as { data: {
      run: string; output: { path: string; sha256: string; contentIncluded: boolean };
    } }).data;
    expect(data.output).toMatchObject({
      path: "stages/01-answer/1/1/output.txt", sha256: sha256(bytes), contentIncluded: false,
    });
    const fetched = await invokeCliBytes(["run", "output", data.run, "--raw"], { home });
    expect(fetched).toEqual({ code: 0, out: bytes, err: Buffer.alloc(0) });
  };

  await assertResult(await execute(
    ["run", "start", "review/main", "request", "-j"],
    [writes("$OUTPUT", answer), fauxAssistantMessage("done")],
  ));
  const donor = await execute(
    ["run", "start", "review/main", "request", "--retries", "0"], [fauxAssistantMessage("done")],
  );
  expect(donor.code).toBe(1);
  const donorName = (await runsIn(home)).at(-1) ?? "";
  await assertResult(await execute(
    ["run", "resume", donorName, "-j"],
    [writes("$OUTPUT", answer), fauxAssistantMessage("done")],
  ));
});

test("malformed run output flags fail before reading the home", async () => {
  const env: NodeJS.ProcessEnv = {};
  Object.defineProperty(env, "BOT_HOME", { get: () => { throw new Error("home was read"); } });
  const out: Buffer[] = [], err: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd: "/", env, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { out.push(Buffer.from(bytes)); }, stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-05T21:00:00.000Z",
      setTimeout: () => ({ clear: () => undefined }), clearTimeout: () => undefined },
  };
  for (const args of [
    [RUN], [RUN, "--raw", "--raw"], [RUN, "--raw", "--unknown"], [RUN, "--raw", "--home"],
    [RUN, "--raw", "--home", "a", "--home", "b"], [RUN, "extra", "third", "--raw"],
  ]) {
    await expect(main(["run", "output", ...args], boundary)).resolves.toBe(2);
  }
  expect(out).toEqual([]);
  expect(err).toHaveLength(6);
});

test("capabilities and generated help publish raw output without the retired reader bound", async () => {
  const { home } = await roots.scratch("bot-run-output-help-");
  const capabilities = await invokeCliBytes(["capabilities", "-j"], { home });
  const commands = (JSON.parse(capabilities.out.toString()) as { data: { commands: Array<Record<string, unknown>> } }).data.commands;
  const descriptor = commands.find(({ operation }) => operation === "run.output");
  expect(descriptor).toMatchObject({
    operation: "run.output", command: ["run", "output"], output: { kind: "raw" },
    modes: ["raw"], home: "reads", mutates: false, network: "never",
    limits: { humanErrorBytes: 2_048 },
  });
  const help = await invokeCliBytes(["run", "output", "--help"], { home });
  expect(help.code).toBe(0);
  expect(help.out.toString()).toContain("verifies one held extent before delivery and detects a changed delivery hash");
  expect(help.out.toString()).not.toContain("1,048,576 output bytes");
});
