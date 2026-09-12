// Provider cache and diagnostic affinity both receive Pi's sessionId. Drive the
// real runner so this witnesses the identifier issued for two live run records.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

interface SessionIdentity { id: string; prompt: string }

function boundary(root: string, home: string, sessionIds: SessionIdentity[]): { held: CliBoundary; faux: ReturnType<typeof fauxProvider> } {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider({
    ...faux.provider,
    stream: (model, context, options) => {
      sessionIds.push({ id: options?.sessionId ?? "", prompt: context.systemPrompt ?? "" });
      return faux.provider.stream(model, context, options);
    },
    streamSimple: (model, context, options) => {
      sessionIds.push({ id: options?.sessionId ?? "", prompt: context.systemPrompt ?? "" });
      return faux.provider.streamSimple(model, context, options);
    },
  });
  return {
    held: {
      cwd: root,
      env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
      stdinIsTTY: true,
      stderrIsTTY: false,
      readStdin: () => Promise.resolve(Buffer.alloc(0)),
      stdout: () => undefined,
      stderr: () => undefined,
      clock,
      models,
    },
    faux,
  };
}

async function assembly(home: string, child = false): Promise<void> {
  const root = join(home, "assemblies/review");
  const stage = join(root, "flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const files: Promise<void>[] = [
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${child ? "Ask the child agent." : "Confirm the prepared result."}\n`),
    writeFile(join(stage, "before"), "#!/bin/sh\nprintf result > \"$OUTPUT\"\n"),
  ];
  if (child) {
    const helper = join(root, "subflows/helper/01-answer");
    await mkdir(helper, { recursive: true });
    files.push(
      writeFile(join(root, "subflows/helper/FLOW.md"), "---\ndescription: helper\n---\n"),
      writeFile(join(helper, "STAGE.md"), "---\n---\nChild agent answers.\n"),
    );
  }
  await Promise.all(files);
  await chmod(join(stage, "before"), 0o755);
}

test("concurrent runs of one stage receive distinct provider cache and diagnostic identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-provider-session-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const sessionIds: SessionIdentity[] = [];
  const { held, faux } = boundary(root, home, sessionIds);
  const first = join(root, "first-worktree");
  const second = join(root, "second-worktree");
  await Promise.all([mkdir(first), mkdir(second)]);
  faux.setResponses([fauxAssistantMessage("done"), fauxAssistantMessage("done")]);

  await expect(Promise.all([
    main(["run", "start", "review/main", "first request"], { ...held, cwd: first, env: { ...held.env, PWD: first } }),
    main(["run", "start", "review/main", "second request"], { ...held, cwd: second, env: { ...held.env, PWD: second } }),
  ])).resolves.toEqual([0, 0]);

  expect(new Set(sessionIds.map(({ id }) => id))).toHaveLength(2);
});

test("concurrent subflow children receive separate, stable provider identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-provider-child-session-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home, true);
  const sessionIds: SessionIdentity[] = [];
  const { held, faux } = boundary(root, home, sessionIds);
  const first = join(root, "first-worktree");
  const second = join(root, "second-worktree");
  await Promise.all([mkdir(first), mkdir(second)]);
  const respond = (context: { systemPrompt?: string; messages?: unknown[] }) => {
    const child = context.systemPrompt?.includes("Child agent answers.") === true;
    const replied = JSON.stringify(context.messages ?? []).includes("toolResult");
    if (replied) return fauxAssistantMessage("done");
    return child
      ? fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "child result" })], { stopReason: "toolUse" })
      : fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "helper", input: "answer" }] })], { stopReason: "toolUse" });
  };
  faux.setResponses(Array.from({ length: 8 }, () => respond));

  await expect(Promise.all([
    main(["run", "start", "review/main", "first request"], { ...held, cwd: first, env: { ...held.env, PWD: first } }),
    main(["run", "start", "review/main", "second request"], { ...held, cwd: second, env: { ...held.env, PWD: second } }),
  ])).resolves.toEqual([0, 0]);

  const children = sessionIds.filter(({ prompt }) => prompt.includes("Child agent answers.")).map(({ id }) => id);
  expect(new Set(children)).toHaveLength(2);
  expect([...new Set(children)].every((id) => children.filter((held) => held === id).length > 1)).toBe(true);
});
