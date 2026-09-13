// Ticket 0045 — pin queue P3: the invocation legs, end to end through the
// REAL defaultGating via main() with the faux provider (the cli-stage-options
// idiom, 0041). Four pins, invocation.md the assertion source:
// (1) Stdin: "Stdin is the request only when no argument was given, it is not
//     a terminal, and it holds bytes" — the bytes land as request.txt byte for
//     byte, run_start.request says how it arrived (record.md "What a record
//     answers": "the request, byte for byte, and how it arrived").
// (2) "An argument beats the stream: when a string or a task file is given,
//     stdin is not read at all" — a throwing readStdin proves it.
// (3) @task live: "Its frontmatter may carry option overrides and is not part
//     of the request; its body is" — the body lands as request.md (slots.md:
//     the request "keeps the extension of the task file it came from"), and
//     the override shows at the task rung in the stage's 0041 ladder
//     (invocation.md rung 2: "the task file's frontmatter").
// (4) --in: "It becomes the agent's `$PWD`" (invocation.md); "Without it, the
//     caller's own working directory is used." Captured the 0037 way: a
//     success hook writes $PWD to a file (hooks run in the stage's cwd with
//     the slot-overwritten environment, invariant 43).
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

function realBoundary(
  root: string, home: string, output: Buffer[], errors: Buffer[],
  stdin?: Pick<CliBoundary, "stdinIsTTY" | "readStdin">,
) {
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
    ...stdin,
  };
  return { held, faux };
}

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

function start(events: Record<string, unknown>[], stage: string): Record<string, unknown> | undefined {
  return events.find((event) => event["event"] === "stage_start" && event["stage"] === stage);
}

async function oneStageAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n  hard: { provider: faux, model: faux-1, reasoning: high }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
}

// Pin 4's assembly: a folder-form stage whose success hook writes the $PWD it
// was handed — the 0037 env-capture idiom (cli.test.ts), here with the real
// defaultGating since the hook is ordinary assembly machinery.
async function pwdAssembly(home: string, capture: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const hook = join(stage, "success");
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(hook, `#!/bin/sh\nprintf '%s' "$PWD" > '${capture}'\nexit 0\n`),
  ]);
  await chmod(hook, 0o755);
}

test("stdin leg: no argument, a non-TTY stream with bytes is the request — request.txt byte for byte, via stdin, received by the first stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-stdin-"));
  roots.push(root);
  const home = join(root, "home");
  await oneStageAssembly(home);
  const stdinBytes = Buffer.from("act on the piped request\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr, {
    stdinIsTTY: false, readStdin: () => Promise.resolve(stdinBytes),
  });
  faux.setResponses(writes("the answer"));

  // invocation.md: "Stdin is the request only when no argument was given, it
  // is not a terminal, and it holds bytes." All three hold, so the run runs.
  await expect(main(["run", "start", "review/main"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  // record.md "What is kept beside it": the run's directory holds the request
  // — request.txt in its tree — and invocation.md "What the run keeps": "The
  // request as supplied, byte for byte" with `.txt` "when it came from ...
  // stdin". Bytes compared as bytes.
  const kept = await readFile(join(home, "runs", run, "request.txt"));
  expect(kept.equals(stdinBytes)).toBe(true);

  // invocation.md "What the run keeps": "Which of the three ways it arrived."
  // The runtime's word for this way is "stdin" (RunRequest's closed via
  // union); record.md's shape is path/sha256/bytes beside it.
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(events[0]).toMatchObject({
    event: "run_start",
    request: { path: "request.txt", sha256: hashBytes(stdinBytes), bytes: stdinBytes.length, via: "stdin" },
  });

  // invocation.md: the request "becomes one file in the first stage's
  // `$INPUT`, named `request`"; slots.md: "first in a flow → request.txt".
  expect(start(events, "01-work")?.["received"]).toEqual([
    { name: "request.txt", path: "request.txt", sha256: hashBytes(stdinBytes) },
  ]);
});

test("an argument beats the stream: with a request argument stdin is not read at all, and the argument's bytes are what is recorded", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-argbeats-"));
  roots.push(root);
  const home = join(root, "home");
  await oneStageAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  // Different bytes wait on stdin, and reading them throws: a run that
  // resolves 0 proves stdin was never touched (invocation.md: "when a string
  // or a task file is given, stdin is not read at all").
  let stdinRead = false;
  const { held, faux } = realBoundary(root, home, stdout, stderr, {
    stdinIsTTY: false,
    readStdin: () => { stdinRead = true; return Promise.reject(new Error("the stream was read")); },
  });
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the argument request"], held)).resolves.toBe(0);
  expect(stdinRead).toBe(false);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const argument = Buffer.from("the argument request");
  await expect(readFile(join(home, "runs", run, "request.txt"))).resolves.toEqual(argument);
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(events[0]).toMatchObject({
    event: "run_start",
    request: { path: "request.txt", sha256: hashBytes(argument), bytes: argument.length, via: "argument" },
  });
});

test("@task live: the body is the request as request.md, the frontmatter override sits at the task rung, via says task", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-task-"));
  roots.push(root);
  const home = join(root, "home");
  await oneStageAssembly(home);
  // invocation.md: a task file "is markdown by construction. Its frontmatter
  // may carry option overrides and is not part of the request; its body is."
  // reasoning is one of the five resolvable keys (invocation.md "Options and
  // where they resolve").
  await writeFile(join(root, "task.md"), "---\nintelligence: hard\n---\nReview the change described in this body.\n");
  const body = Buffer.from("Review the change described in this body.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdinRead = false;
  const { held, faux } = realBoundary(root, home, stdout, stderr, {
    stdinIsTTY: false,
    readStdin: () => { stdinRead = true; return Promise.reject(new Error("the stream was read")); },
  });
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "@task.md"], held)).resolves.toBe(0);
  expect(stdinRead).toBe(false);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  // invocation.md: the request file carries "the extension of the task file
  // it came from" — task.md makes request.md — and holds the BODY only, the
  // frontmatter stripped.
  await expect(readFile(join(home, "runs", run, "request.md"))).resolves.toEqual(body);
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(events[0]).toMatchObject({
    event: "run_start",
    request: { path: "request.md", sha256: hashBytes(body), bytes: body.length, via: "task" },
  });

  // invocation.md rung 2 is "the task file's frontmatter"; the ladder's word
  // for that rung is "task" (ticket 0041: stage_start carries the resolved
  // ladder, every value "with the rung it came from", record.md).
  const work = start(events, "01-work");
  expect(work?.["options"]).toContainEqual({ name: "reasoning", value: "high", rung: "task" });
  expect(work?.["received"]).toEqual([{ name: "request.md", path: "request.md", sha256: hashBytes(body) }]);
});

test("--in: the named directory becomes the agent's $PWD", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-workdir-"));
  roots.push(root);
  const home = join(root, "home");
  const capture = join(root, "pwd-capture.txt");
  const workdir = join(root, "worktree");
  await mkdir(workdir);
  await pwdAssembly(home, capture);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the answer"));

  // invocation.md "Where the work happens": "The directory the agent works in
  // is named by the caller ... It becomes the agent's `$PWD`"; slots.md#pwd:
  // "it is a slot because the caller decides what it is."
  await expect(main(["run", "start", "review/main", "the request", "--in", workdir], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  await expect(readFile(capture, "utf8")).resolves.toBe(workdir);
});

test("without --in the caller's own working directory is the agent's $PWD", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-defaultpwd-"));
  roots.push(root);
  const home = join(root, "home");
  const capture = join(root, "pwd-capture.txt");
  await pwdAssembly(home, capture);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the answer"));

  // invocation.md: "Without it, the caller's own working directory is used"
  // — the CliBoundary's cwd, which is this test's root.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  await expect(readFile(capture, "utf8")).resolves.toBe(root);
});
