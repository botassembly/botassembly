import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createHarness, NodeExecutionEnvironment } from "../src/harness.ts";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { GatingSession, StageRuntimeContext } from "../src/flow.ts";
import type { GatingConfig } from "../src/gating.ts";
import type { DriverClock } from "../src/process.ts";
import { attempt, scratchRun } from "./scratch.ts";
import { hashBytes } from "../src/record.ts";
import { renderSessionTools } from "../src/session.ts";
import { createControlContext } from "../src/tools.ts";
import { outputOf } from "./hostile.ts";
import { recordedStage } from "./cli-boundary.ts";

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

function factory(models: ReturnType<typeof createModels>, faux: ReturnType<typeof fauxProvider>) {
  return async (context: StageRuntimeContext): Promise<GatingSession> => {
    faux.setResponses([async () => {
      if (context.identity.stage === "assembly") await writeFile(outputOf(context), "assembly answer");
      else if (context.identity.stage === "01-first") await writeFile(outputOf(context), "alpha");
      else {
        expect(await readFile(join(context.inputPath, "first.txt"), "utf8")).toBe("alpha");
        await writeFile(outputOf(context), "beta");
      }
      return fauxAssistantMessage("done");
    }]);
    const controls = createControlContext();
    const execution = new NodeExecutionEnvironment({ cwd: context.env["PWD"] ?? "/", shellEnv: context.env });
    const harness = await createHarness({
      execution, sessionFile: context.sessionFile, session: { cwd: context.env["PWD"] ?? "/", id: context.identity.stage, createdAt: Date.parse(context.clock.timestamp()) },
      models, model: faux.getModel(), systemPrompt: "Synthetic CLI integration.", tools: context.tools, context: controls,
    });
    const common = {
      prompt: "Do the work.", timeoutMs: 2_000, retries: 0,
      cwd: context.env["PWD"] ?? "/", env: context.env,
      session: context.sessionPath, received: context.received, options: [], ...recordedStage(context),
    };
    let config: GatingConfig;
    if (context.mode.kind === "choose") config = { ...common, mode: "choose", alternatives: context.mode.alternatives };
    else {
      if (context.node.kind !== "STAGE") throw new TypeError("Fixture expected a stage.");
      const work = { ...common, outputPath: outputOf(context), outputExtension: context.node.extension };
      config = context.mode.kind === "loop"
        ? { ...work, mode: "loop", question: context.mode.question }
        : { ...work, mode: "stage" };
    }
    return { harness, controls, config, close: () => harness.close() };
  };
}

function refusing(models: ReturnType<typeof createModels>, faux: ReturnType<typeof fauxProvider>) {
  return async (context: StageRuntimeContext): Promise<GatingSession> => {
    const controls = createControlContext();
    faux.setResponses([() => {
      controls.refusal = { reason: "The request cannot be reviewed." };
      return Promise.resolve(fauxAssistantMessage("refusing"));
    }]);
    const execution = new NodeExecutionEnvironment({ cwd: context.env["PWD"] ?? "/", shellEnv: context.env });
    const harness = await createHarness({
      execution, sessionFile: context.sessionFile, session: { cwd: context.env["PWD"] ?? "/", id: context.identity.stage, createdAt: Date.parse(context.clock.timestamp()) },
      models, model: faux.getModel(), systemPrompt: "Synthetic CLI integration.", tools: context.tools, context: controls,
    });
    if (context.node.kind !== "STAGE") throw new TypeError("Fixture expected a stage.");
    return { harness, controls, close: () => harness.close(), config: {
      timeoutMs: 2_000, retries: 0,
      cwd: context.env["PWD"] ?? "/", env: context.env,
      session: context.sessionPath, received: context.received, options: [], ...recordedStage(context),
      outputPath: outputOf(context), outputExtension: context.node.extension, mode: "stage",
    } };
  };
}

function scratching(shared: boolean) {
  return (models: ReturnType<typeof createModels>, faux: ReturnType<typeof fauxProvider>) => async (context: StageRuntimeContext): Promise<GatingSession> => {
    faux.setResponses([async () => {
      const tmp = context.env["TMP"];
      if (tmp === undefined) throw new Error("TMP is not in the environment.");
      if (context.identity.stage === "01-first") await writeFile(join(tmp, "note.txt"), "passed along");
      else if (shared) expect(await readFile(join(tmp, "note.txt"), "utf8")).toBe("passed along");
      else expect(await readdir(tmp)).toEqual([]);
      await writeFile(outputOf(context), context.identity.stage);
      return fauxAssistantMessage("done");
    }, fauxAssistantMessage("finish anyway")]);
    const controls = createControlContext();
    const execution = new NodeExecutionEnvironment({ cwd: context.env["PWD"] ?? "/", shellEnv: context.env });
    const harness = await createHarness({
      execution, sessionFile: context.sessionFile, session: { cwd: context.env["PWD"] ?? "/", id: context.identity.stage, createdAt: Date.parse(context.clock.timestamp()) },
      models, model: faux.getModel(), systemPrompt: "Synthetic CLI integration.", tools: context.tools, context: controls,
    });
    if (context.node.kind !== "STAGE") throw new TypeError("Fixture expected a stage.");
    return { harness, controls, close: () => harness.close(), config: {
      timeoutMs: 2_000, retries: 0,
      cwd: context.env["PWD"] ?? "/", env: context.env,
      session: context.sessionPath, received: context.received, options: [], ...recordedStage(context),
      outputPath: outputOf(context), outputExtension: context.node.extension, mode: "stage",
    } };
  };
}

function boundary(root: string, home: string, output: Buffer[], errors: Buffer[], make = factory): CliBoundary {
  const faux = fauxProvider({ tokensPerSecond: 10_000 });
  const models = createModels();
  models.setProvider(faux.provider);
  return {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
    createGating: make(models, faux),
  };
}

async function assembly(home: string, tmp?: "flow" | "stage"): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), `---\ndescription: main flow\n${tmp === undefined ? "" : `tmp: ${tmp}\n`}---\n`),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
    writeFile(join(flow, "02-second.md"), "---\n---\nWrite the second result.\n"),
  ]);
}

test("CLI runs two faux-provider stages, seals the record, and inspects record and session", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-test-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const held = boundary(root, home, stdout, stderr);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("beta");
  expect(Buffer.concat(stderr).toString()).toBe("");

  const runs = await readdir(join(home, "runs"));
  expect(runs).toHaveLength(1);
  const run = runs[0] ?? "";
  const runDirectory = join(home, "runs", run);
  const record = await readFile(join(runDirectory, "record.jsonl"), "utf8");
  expect(record).toContain('"event":"run_start"');
  expect(record).toContain('"event":"run_end","exit":0,"cause":"success"');
  expect(record.match(/"sealed":true/gu)).toHaveLength(2);
  await expect(readFile(join(runDirectory, "stages/02-second/1/1/output.txt"), "utf8")).resolves.toBe("beta");

  stdout.length = 0;
  await expect(main(["run", "events", run, "--json"], held)).resolves.toBe(0);
  expect((JSON.parse(Buffer.concat(stdout).toString()) as { data: { events: unknown[] } }).data.events)
    .toEqual(record.trimEnd().split("\n").map((line): unknown => JSON.parse(line) as unknown));

  stdout.length = 0;
  await expect(main(["run", "session", run, "02-second"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toContain("assistant  done");

  stdout.length = 0;
  await expect(main(["run", "session", run, "02-second", "--raw"], held)).resolves.toBe(0);
  await expect(readFile(join(runDirectory, "stages/02-second/1/session.jsonl"))).resolves.toEqual(Buffer.concat(stdout));

  stdout.length = 0;
  await expect(main(["run", "list"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toContain(`| ${run} | review | main |`);
});

test("CLI can run the assembly agent without naming a flow", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-assembly-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "review", "route this"], boundary(root, home, stdout, stderr))).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("assembly answer");
  expect(Buffer.concat(stderr).toString()).toBe("");
});

test("CLI names resume as the donor-derived operation and removes the continue flag", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-resume-help-"));
  roots.push(root);
  const home = join(root, "home");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const held = boundary(root, home, stdout, stderr);

  await expect(main(["run", "resume", "--help"], held)).resolves.toBe(0);
  const resumeHelp = Buffer.concat(stdout).toString();
  expect(resumeHelp).toContain("usage: bot run resume <run>");
  expect(resumeHelp).toMatch(/--id-file\s+path\b/u);
  expect(resumeHelp).not.toContain("--continue");
  expect(Buffer.concat(stderr).toString()).toBe("");

  stdout.length = 0;
  await expect(main(["run", "start", "--help"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).not.toContain("--continue");
});

test("$TMP is per stage by default and is deleted when each stage settles", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-scratch-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "review/main", "the request"], boundary(root, home, stdout, stderr, scratching(false)))).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const run = (await readdir(join(home, "runs")))[0] ?? "";
  await expect(readFile(join(attempt(scratchRun(join(root, "cache"), home, run), "01-first"), "tmp/note.txt"), "utf8")).rejects.toThrow();
  await expect(readdir(join(home, "runs", run))).resolves.not.toContain("tmp");
});

test("tmp: stage is accepted and behaves exactly as the default", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-perstage-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home, "stage");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "review/main", "the request"], boundary(root, home, stdout, stderr, scratching(false)))).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const run = (await readdir(join(home, "runs")))[0] ?? "";
  await expect(readFile(join(attempt(scratchRun(join(root, "cache"), home, run), "01-first"), "tmp/note.txt"), "utf8")).rejects.toThrow();
});

test("tmp: flow shares $TMP across stages and deletes it when the flow settles", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-shared-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home, "flow");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "review/main", "the request"], boundary(root, home, stdout, stderr, scratching(true)))).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const run = (await readdir(join(home, "runs")))[0] ?? "";
  await expect(readFile(join(scratchRun(join(root, "cache"), home, run), "shared/note.txt"), "utf8")).rejects.toThrow();
});


test("CLI writes one stderr line naming a failed run's cause and reason", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-stderr-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "review/main", "the request"], boundary(root, home, stdout, stderr, refusing))).resolves.toBe(1);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toBe("refused: The request cannot be reviewed.\n");
});

// 0026 finding (ticket 0029 item 9): a reason that is a gate capture ending in
// its own newline prints as ONE stderr line; the record keeps the true bytes.
test("CLI stderr does not double the newline of a gate-capture reason", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-gate-stderr-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const script = "#!/bin/sh\nprintf 'not good enough\\n'\nexit 1\n";
  const gatePath = join(root, "gate.sh");
  await writeFile(gatePath, script);
  await chmod(gatePath, 0o755);
  const gated = (models: ReturnType<typeof createModels>, faux: ReturnType<typeof fauxProvider>) =>
    async (context: StageRuntimeContext): Promise<GatingSession> => {
      const session = await factory(models, faux)(context);
      faux.setResponses([async () => {
        await writeFile(outputOf(context), "attempt");
        return fauxAssistantMessage("done");
      }]);
      if (session.config.mode === "choose") throw new TypeError("Fixture expected a stage.");
      const config: GatingConfig = { ...session.config, gates: [{ path: gatePath, file: "gate.sh", sha256: hashBytes(script) }] };
      return { ...session, config };
    };
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  await expect(main(["run", "start", "review/main", "the request"], boundary(root, home, stdout, stderr, gated))).resolves.toBe(1);
  expect(Buffer.concat(stderr).toString()).toBe("exhausted: not good enough\n");
});

test("CLI leaves stderr empty when the run exits 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-quiet-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "review/main", "the request"], boundary(root, home, stdout, stderr))).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("beta");
  expect(Buffer.concat(stderr).toString()).toBe("");
});

test("CLI refuses a malformed assembly with no run record", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-refusal-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(join(home, "assemblies/broken"), { recursive: true });
  await writeFile(join(home, "assemblies/broken/ASSEMBLY.md"), "---\nintelligence: default\n---\nBroken.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(main(["run", "start", "broken", "request"], boundary(root, home, stdout, stderr))).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toBe("assembly-incomplete  flows\n  Add the flows folder.\n");
  // No RUN, which is what "no run record" means. `runs/` itself is now made
  // before the assembly is read — birth needs somewhere to copy it (ADR 0016)
  // — and the refusal takes the run directory back off disk.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// Ticket 0037 — invariant 43's named exception: BOT_HOME is the runtime's own
// variable, scrubbed from the environment agent-side processes receive.
async function envCapture(prefix: string, extraEnv: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const capture = join(root, "env-capture.txt");
  const script = `#!/bin/sh\nprintf 'home=[%s] caller=[%s] tmp=[%s]' "$BOT_HOME" "$CALLER_PROBE" "$TMP" > '${capture}'\nexit 0\n`;
  const gatePath = join(root, "gate.sh");
  await writeFile(gatePath, script);
  await chmod(gatePath, 0o755);
  const gated = (models: ReturnType<typeof createModels>, faux: ReturnType<typeof fauxProvider>) =>
    async (context: StageRuntimeContext): Promise<GatingSession> => {
      const session = await factory(models, faux)(context);
      if (session.config.mode === "choose") throw new TypeError("Fixture expected a stage.");
      const config: GatingConfig = { ...session.config, gates: [{ path: gatePath, file: "gate.sh", sha256: hashBytes(script) }] };
      return { ...session, config };
    };
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const held = boundary(root, home, stdout, stderr, gated);
  held.env = { ...held.env, ...extraEnv };
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  return readFile(capture, "utf8");
}

test("a gate script sees no BOT_HOME in its environment", async () => {
  const text = await envCapture("bot-cli-scrub-", {});
  expect(text).toContain("home=[]");
});

test("a caller variable passes through beneath the slots, and a slot overwrites a same-named caller variable", async () => {
  const text = await envCapture("bot-cli-passthrough-", { CALLER_PROBE: "passes-through", TMP: "/caller-owned-tmp" });
  expect(text).toContain("caller=[passes-through]");
  expect(text).not.toContain("/caller-owned-tmp");
  expect(text).toMatch(/tmp=\[[^\]]*\/cache\/bot\/tmp\//u);
});

test("Pi session tool rendering reports recorded outcome and duration", () => {
  const source = [
    { type: "message", timestamp: "2026-07-31T12:00:00.000Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a" } }] } },
    { type: "message", timestamp: "2026-07-31T12:00:00.025Z", message: { role: "toolResult", toolCallId: "call-1", toolName: "read", isError: false, content: [] } },
  ].map((entry) => JSON.stringify(entry)).join("\n");
  expect(renderSessionTools(source, "01-work")).toEqual(["01-work  read  ok  25ms"]);
});
