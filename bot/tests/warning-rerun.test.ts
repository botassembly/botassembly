import { createModels, fauxAssistantMessage, fauxProvider, type FauxResponseStep } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createMemoryHarness } from "../src/harness.ts";
import { runGating, type GatingInput } from "../src/gating.ts";
import type { DriverClock, Executable } from "../src/process.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes } from "../src/record.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(), timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(responses: FauxResponseStep[]) {
  const root = await mkdtemp(join(tmpdir(), "bot-warning-rerun-test-"));
  roots.push(root);
  const runs = join(root, "runs");
  const input = join(root, "input");
  const output = join(root, "output");
  const work = join(root, "work");
  const tmp = join(root, "tmp");
  await Promise.all([mkdir(runs), mkdir(input), mkdir(work), mkdir(tmp)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(), run: "2026-09-01T12-00-00-cafe", assembly: "gating",
    assemblyHash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  const faux = fauxProvider({ tokensPerSecond: 10_000 });
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const controls = createControlContext();
  const harness = createMemoryHarness({
    models, model: faux.getModel(),
    systemPrompt: "Synthetic warning test.", tools: createControlTools(tmp), context: controls,
  });
  const config = {
    prompt: "Do the work.", timeoutMs: 500, retries: 0, cwd: work,
    env: { ...process.env, INPUT: input, OUTPUT: output, TMP: tmp, PWD: work },
    session: "stages/01-work/1/session.jsonl", received: [], options: [],
    mode: "stage" as const, outputPath: output, outputExtension: "txt" as const,
  };
  return { root, work, tmp, output, writer: created.writer, harness, controls, config };
}

async function executable(root: string, relative: string, source: string): Promise<Executable> {
  const path = join(root, relative);
  await writeFile(path, source);
  await chmod(path, 0o755);
  return { path, file: `flows/main/01-work/${relative}`, sha256: hashBytes(source) };
}

async function run(f: Awaited<ReturnType<typeof fixture>>, gate: Executable, retries = 0) {
  const input: GatingInput = {
    harness: f.harness, controls: f.controls, writer: f.writer,
    identity: { stage: "01-work", retry: 1 }, clock, config: { ...f.config, retries, gates: [gate] }, close: () => f.harness.close(),
  };
  return runGating(input);
}

async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function checkEvents(recorded: Record<string, unknown>[]): Record<string, unknown>[] {
  return recorded.filter((event) => event["event"] === "check");
}

test("a populated tmp draws the warning before the ladder, and the ladder runs once", async () => {
  let output = "";
  let tmp = "";
  let warning = "";
  const f = await fixture([
    async () => {
      await Promise.all([writeFile(output, "ready"), writeFile(join(tmp, "evidence.log"), "keep")]);
      return fauxAssistantMessage("ready");
    },
    (provider) => {
      warning = JSON.stringify(provider.messages[provider.messages.length - 1]);
      return fauxAssistantMessage("finish anyway");
    },
  ]);
  output = f.output;
  tmp = f.tmp;
  const executions = join(f.root, "gate-executions");
  const gate = await executable(f.root, "gate.sh", `#!/bin/sh\nprintf 'ran\\n' >> '${executions}'\nexit 0\n`);

  await expect(run(f, gate)).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(await readFile(executions, "utf8")).toBe("ran\n");
  expect(checkEvents(await events(f.writer.recordPath)).map((event) => event["check"])).toEqual(["output", "gate"]);
  expect(warning).toContain("evidence.log");
  expect(warning).toContain("$OUTPUT");
  expect(warning).toContain("$PWD");
  expect(warning).toContain("clean-temp");
});

test("an empty tmp draws no warning and one ladder run", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "ready"); return fauxAssistantMessage("ready"); },
  ]);
  output = f.output;
  const executions = join(f.root, "gate-executions");
  const gate = await executable(f.root, "gate.sh", `#!/bin/sh\nprintf 'ran\\n' >> '${executions}'\nexit 0\n`);

  await expect(run(f, gate)).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(await readFile(executions, "utf8")).toBe("ran\n");
  expect(checkEvents(await events(f.writer.recordPath)).map((event) => event["check"])).toEqual(["output", "gate"]);
});

test("cleaning tmp after the warning completes with one witness-shaped gate event", async () => {
  let output = "";
  let tmp = "";
  const f = await fixture([
    async () => {
      await Promise.all([writeFile(output, "ready"), writeFile(join(tmp, "scratch.log"), "junk")]);
      return fauxAssistantMessage("ready");
    },
    async () => { await rm(join(tmp, "scratch.log")); return fauxAssistantMessage("cleaned tmp"); },
  ]);
  output = f.output;
  tmp = f.tmp;
  const gate = await executable(f.root, "gate.sh", "#!/bin/sh\nexit 0\n");

  await expect(run(f, gate)).resolves.toMatchObject({ exit: 0, cause: "success" });
  const gates = checkEvents(await events(f.writer.recordPath)).filter((event) => event["check"] === "gate");
  expect(gates).toHaveLength(1);
  expect(gates[0]).toMatchObject({ event: "check", check: "gate", file: gate.file, sha256: gate.sha256, exit: 0 });
  expect(gates[0]?.["capture"]).toMatch(/checks\/gate\.txt$/);
});

test("a failing check after the warning still re-runs the ladder", async () => {
  let output = "";
  let tmp = "";
  let gateInput = "";
  const f = await fixture([
    async () => {
      await Promise.all([writeFile(output, "ready"), writeFile(join(tmp, "evidence.log"), "keep"), writeFile(gateInput, "fail")]);
      return fauxAssistantMessage("ready");
    },
    () => fauxAssistantMessage("finish anyway"),
    async () => { await writeFile(gateInput, "pass"); return fauxAssistantMessage("fixed the gate input"); },
  ]);
  output = f.output;
  tmp = f.tmp;
  gateInput = join(f.work, "gate-input");
  const executions = join(f.root, "gate-executions");
  const gate = await executable(f.root, "gate.sh", `#!/bin/sh\nprintf 'ran\\n' >> '${executions}'\ngrep -q '^pass$' '${gateInput}'\n`);

  await expect(run(f, gate, 1)).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect((await readFile(executions, "utf8")).match(/ran/g)).toHaveLength(2);
  const gates = checkEvents(await events(f.writer.recordPath)).filter((event) => event["check"] === "gate");
  expect(gates.map((event) => event["exit"])).toEqual([1, 0]);
});
