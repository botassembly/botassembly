// Ticket 0048 — pin queue P6: hook environment, the failure extras, and the
// $INPUT rewrite, end to end through the REAL defaultGating via main() with
// the faux provider (the cli-stage-options idiom, 0041). The assertion
// sources:
// - hooks.md "How a hook is run": "A hook is an ordinary process, started with
//   the same slots in its environment as the agent gets — `$INPUT`, `$OUTPUT`,
//   `$TMP`, `$SKILLS`, `$PWD` ... — over the caller's environment, which
//   passes through beneath them"; invariant 43: "The environment passes
//   through; the slots overwrite it."
// - hooks.md: "`failure` gets two things more ... `$CAUSE`, the one word from
//   the cause vocabulary, and `$REASON`, the path to the captured text behind
//   it — the failing check's output, or the agent's refusal — when there is
//   one."
// - hooks.md: "`before` rewrites, adds, or removes the files in `$INPUT`, and
//   the agent sees what `before` left there — the prompt names whatever is in
//   the directory when the agent starts (prompt construction)."
// - hooks.md: success "holds `$OUTPUT` as a path to read"; "Whatever a hook
//   prints on stdout and stderr is captured as diagnostics and kept with the
//   run."
// - hooks.md "Exit codes": "`failure` runs after the fact, so its exit code
//   changes nothing."
// - slots.md: $INPUT "a directory holding the stage's input", first in a flow
//   it holds `request.txt`; $TMP "an empty scratch directory" that "sits in a
//   cache directory the runtime owns (`$XDG_CACHE_HOME/bot/tmp/`)" and "is not
//   deleted when the stage or the run ends"; $PWD "the tree the work happens
//   in".
// - record.md cause table: exhausted / 1 — "the retries were spent with a
//   check still saying no".
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import { runtimeModels } from "../src/run.ts";
import type { DriverClock } from "../src/process.ts";
import { attempt, scratchRun } from "./scratch.ts";
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

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

function hookEvents(events: Record<string, unknown>[], hook: string): Record<string, unknown>[] {
  return events.filter((event) => event["event"] === "hook" && event["hook"] === hook);
}

// One folder-form stage; the caller supplies each hook's script text.
async function hookAssembly(home: string, hooks: Partial<Record<"before" | "success" | "failure", string>>, gate?: string, slots = ""): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const files = [...Object.entries(hooks), ...(gate === undefined ? [] : [["gate", gate] as const])];
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\nintelligence: default\n${slots}---\nReview assembly.\n`),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    ...files.map(([name, script]) => writeFile(join(stage, name), script)),
  ]);
  await Promise.all(files.map(([name]) => chmod(join(stage, name), 0o755)));
}

test("hook slot parity and canary: a before hook sees the agent's $INPUT/$TMP/$PWD and the caller's variable beneath them; a success hook reads the sealed bytes at $OUTPUT", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-hook-slots-"));
  roots.push(root);
  const home = join(root, "home");
  // hooks.md "How a hook is run": the same slots as the agent gets, printed to
  // stdout, which is "captured as diagnostics and kept with the run"
  // (hooks.md "Whatever a hook prints").
  await hookAssembly(home, {
    before: "#!/bin/sh\nprintf 'input=[%s]\\ntmp=[%s]\\npwd=[%s]\\ncanary=[%s]\\n' \"$INPUT\" \"$TMP\" \"$PWD\" \"$HOOK_CANARY\"\nexit 0\n",
    success: '#!/bin/sh\ncat "$OUTPUT"\nexit 0\n',
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // Invariant 43's surviving half: a caller variable no slot shadows passes
  // through to the hook untouched.
  held.env = { ...held.env, HOOK_CANARY: "passes-through-beneath-the-slots" };
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(hookEvents(events, "before")).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, capture: "stages/01-work/1/1/hooks/before.txt" }),
  ]);

  const lines = (await readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/before.txt"), "utf8")).trimEnd().split("\n");
  const slot = (name: string): string => {
    const match = lines.find((line) => line.startsWith(`${name}=[`)) ?? "";
    return match.slice(name.length + 2, -1);
  };

  // slots.md: $INPUT is "a directory holding the stage's input" and "first in
  // a flow" it holds `request.txt` — the same fact the record's stage_start
  // carries in `received`. The retained `$INPUT` directory remains inspectable
  // after the run, even though the sibling `$TMP` directory is deleted: it
  // holds exactly the received file, byte for byte.
  const input = slot("input");
  // Ticket 0067: the stage's scratch is an opaque directory under the run's,
  // so the shape is asked for rather than spelled — and what the hook saw is
  // exactly it, not a path composed from the stage's own name.
  const scratchStage = attempt(scratchRun(join(root, "cache"), home, run), "01-work");
  expect(input).toBe(join(scratchStage, "input"));
  await expect(readdir(input)).resolves.toEqual(["request.txt"]);
  await expect(readFile(join(input, "request.txt"), "utf8")).resolves.toBe("the request");
  const start = events.find((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(start?.["received"]).toEqual([expect.objectContaining({ name: "request.txt", path: "request.txt" })]);

  // slots.md $TMP: "it sits in a cache directory the runtime owns
  // (`$XDG_CACHE_HOME/bot/tmp/`)" — the boundary's XDG_CACHE_HOME is
  // root/cache — "so no slot value discloses where runs live". Same root for
  // $INPUT: both are stage scratch, not run-directory paths.
  const tmp = slot("tmp");
  expect(tmp.startsWith(join(root, "cache", "bot", "tmp") + "/")).toBe(true);
  expect(input.startsWith(join(root, "cache", "bot", "tmp") + "/")).toBe(true);
  expect(tmp).toBe(join(scratchStage, "tmp"));

  // slots.md $PWD: "the tree the work happens in"; invocation.md: without
  // --in, the caller's own working directory — the boundary's cwd, this root.
  expect(slot("pwd")).toBe(root);

  // invariant 43: "The environment passes through" — the canary's value
  // survives beneath the slots, unrewritten.
  expect(slot("canary")).toBe("passes-through-beneath-the-slots");

  // hooks.md: success "holds `$OUTPUT` as a path to read" — the hook's cat of
  // $OUTPUT captured byte-for-byte the bytes the stage sealed (record.md:
  // "What passed the checks is what is sealed, always").
  expect(hookEvents(events, "success")).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, capture: "stages/01-work/1/1/hooks/success.txt" }),
  ]);
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/success.txt"), "utf8")).resolves.toBe("the answer");
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ exit: 0, cause: "success", sealed: true });
  expect(end?.["output"]).toEqual({ path: "stages/01-work/1/1/output.txt", sha256: hashBytes(Buffer.from("the answer")) });
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/output.txt"), "utf8")).resolves.toBe("the answer");
});

test("a shell-valid declared slot remains reachable from its hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-prototype-slot-"));
  roots.push(root);
  const home = join(root, "home");
  await hookAssembly(home, {
    before: "#!/bin/sh\nprintf '%s' \"$__PROTO__\"\n",
  }, undefined, "slots:\n  __proto__: a shell-reachable directory\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "--__proto__", root, "the request"], held)).resolves.toBe(0);
  const run = (await readdir(join(home, "runs")))[0] ?? "";
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/before.txt"), "utf8")).resolves.toBe(root);
});

test("the agent, gate, and successful hooks receive the basename of their run as BOT_RUN_ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-run-id-env-"));
  roots.push(root);
  const home = join(root, "home");
  const agent = join(root, "agent-run-id");
  await hookAssembly(home, {
    before: "#!/bin/sh\nprintf '%s' \"$BOT_RUN_ID\"\n",
    success: "#!/bin/sh\nprintf '%s' \"$BOT_RUN_ID\"\n",
  }, "#!/bin/sh\nprintf '%s' \"$BOT_RUN_ID\"\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // The run owns this name: a caller cannot make work cite a different run.
  held.env = { ...held.env, BOT_RUN_ID: "caller-spoof" };
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("bash", { command: `printf '%s' "$BOT_RUN_ID" > '${agent}'` })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  await main(["run", "start", "review/main", "the request"], held);

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  await expect(Promise.all([
    readFile(agent, "utf8"),
    readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/before.txt"), "utf8"),
    readFile(join(home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8"),
    readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/success.txt"), "utf8"),
  ])).resolves.toEqual([run, run, run, run]);
});

test("a provider key authenticates the model but is absent from the agent, gate, and hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-credential-env-"));
  roots.push(root);
  const home = join(root, "home");
  const agent = join(root, "agent-credential.txt");
  // The `+x` expansion prints `x` whenever the name exists, even if a scrub
  // only blanked its value; an empty capture therefore proves removal.
  await hookAssembly(home, {
    before: "#!/bin/sh\nprintf '%s' \"${GROQ_API_KEY+x}\"\n",
    success: "#!/bin/sh\nprintf '%s' \"${GROQ_API_KEY+x}\"\n",
  }, "#!/bin/sh\nprintf '%s' \"${GROQ_API_KEY+x}\"\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const key = "not-a-real-provider-key-0009";
  held.env = { ...held.env, XDG_CONFIG_HOME: join(root, "config"), GROQ_API_KEY: key };

  // `getAuth` is the model's request-time resolution: the parent snapshot,
  // rather than any child environment, still supplies this provider key.
  await expect(runtimeModels({ clock, cwd: root, env: held.env, progress: () => undefined }).getAuth("groq"))
    .resolves.toMatchObject({ auth: { apiKey: key } });

  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("bash", { command: `printf '%s' "\${GROQ_API_KEY+x}" > '${agent}'` })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  await expect(Promise.all([
    readFile(agent, "utf8"),
    readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/before.txt"), "utf8"),
    readFile(join(home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8"),
    readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/success.txt"), "utf8"),
  ])).resolves.toEqual(["", "", "", ""]);
});

test("before rewrites $INPUT: the hook deletes the received file and writes another, and the prompt the agent was sent names what before left", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-hook-rewrite-"));
  roots.push(root);
  const home = join(root, "home");
  // hooks.md: "`before` rewrites, adds, or removes the files in `$INPUT`, and
  // the agent sees what `before` left there".
  await hookAssembly(home, {
    before: "#!/bin/sh\nrm \"$INPUT/request.txt\"\nprintf 'normalized request\\n' > \"$INPUT/prepared.txt\"\nexit 0\n",
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // The record stays honest about what ARRIVED: stage_start's `received`
  // names the request file the flow handed over (record.md: "what it
  // received"), before the hook touched anything.
  const start = events.find((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(start?.["received"]).toEqual([expect.objectContaining({ name: "request.txt", path: "request.txt" })]);

  // The visible seam for what the AGENT saw: the session the record points at
  // (record.md: the turns are "the session's, reachable from here"). The
  // initial prompt is built from a readdir of $INPUT when the agent starts
  // (hooks.md: "the prompt names whatever is in the directory when the agent
  // starts"), and the session holds it byte-for-byte as the first user
  // message. It names only what before left.
  expect(start?.["session"]).toBe("stages/01-work/1/session.jsonl");
  const session = await readFile(join(home, "runs", run, "stages/01-work/1/session.jsonl"), "utf8");
  expect(session).toContain("The files in `$INPUT` are:");
  expect(session).toContain("- `prepared.txt`");
  expect(session).not.toContain("request.txt");

  // `$INPUT` is retained, so the rewrite itself is inspectable: the directory
  // holds exactly what before wrote, and the run stayed consistent downstream
  // — the stage sealed its output as usual.
  const events2 = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(events2).toMatchObject({ exit: 0, cause: "success", sealed: true });
  const scratchInput = join(attempt(scratchRun(join(root, "cache"), home, run), "01-work"), "input");
  await expect(readdir(scratchInput)).resolves.toEqual(["prepared.txt"]);
  await expect(readFile(join(scratchInput, "prepared.txt"), "utf8")).resolves.toBe("normalized request\n");
});

test("failure extras and exit-code impotence: an exhausted stage hands the failure hook $CAUSE and $REASON, and the hook exiting 7 changes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-hook-failure-"));
  roots.push(root);
  const home = join(root, "home");
  // A gate that says no every round exhausts the default retries (record.md:
  // exhausted — "the retries were spent with a check still saying no").
  // hooks.md: `failure` gets "$CAUSE, the one word from the cause vocabulary,
  // and $REASON, the path to the captured text behind it — the failing
  // check's output ... when there is one". The hook exits 7 on purpose:
  // hooks.md "Exit codes": "`failure` runs after the fact, so its exit code
  // changes nothing."
  await hookAssembly(home, {
    failure: "#!/bin/sh\nprintf 'run=[%s]\\ncause=[%s]\\nreason=[%s]\\n' \"$BOT_RUN_ID\" \"$CAUSE\" \"$REASON\"\ncat \"$REASON\"\nexit 7\n",
  }, "#!/bin/sh\necho 'the gate says no'\nexit 1\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // Attempt 1 writes the output; the later attempts change nothing, so the
  // gate re-judges the same bytes and says no all three times (default
  // retries 2 → attempts 1..3, record.md Identity).
  faux.setResponses([
    ...writes("the work"),
    fauxAssistantMessage("still the same"),
    fauxAssistantMessage("never fixed"),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(1);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toContain("exhausted");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // Three gate rounds, each captured (record.md "What a check printed").
  expect(events.filter((event) => event["event"] === "check" && event["check"] === "gate")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1, capture: "stages/01-work/1/1/checks/gate.txt" }),
    expect.objectContaining({ retry: 2, exit: 1, capture: "stages/01-work/1/2/checks/gate.txt" }),
    expect.objectContaining({ retry: 3, exit: 1, capture: "stages/01-work/1/3/checks/gate.txt" }),
  ]);

  // hooks.md "When they run": failure runs once, after the last attempt; its
  // print is kept as diagnostics with its honest exit code.
  expect(hookEvents(events, "failure")).toEqual([
    expect.objectContaining({ retry: 3, exit: 7, capture: "stages/01-work/1/3/hooks/failure.txt" }),
  ]);

  // $CAUSE is the cause word; $REASON is the path to the failing check's
  // capture — present here because there IS one (hooks.md: "when there is
  // one") — and the bytes at it are exactly what the gate printed.
  const reasonPath = join(home, "runs", run, "stages", "01-work", "1", "3", "checks", "gate.txt");
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/3/hooks/failure.txt"), "utf8"))
    .resolves.toBe(`run=[${run}]\ncause=[exhausted]\nreason=[${reasonPath}]\nthe gate says no\n`);
  await expect(readFile(reasonPath, "utf8")).resolves.toBe("the gate says no\n");

  // hooks.md:57: "`failure` runs after the fact, so its exit code changes
  // nothing" — the exhausted cause and exit 1 stand at the stage's end and
  // the run's end, untouched by the hook's 7.
  const end = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 3, exit: 1, cause: "exhausted", reason: "the gate says no\n" });
  expect(events.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 1, cause: "exhausted" }),
  ]);
});

test("an agent-reported fault hands its exact cause and retained reason to one failure hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-hook-fault-"));
  roots.push(root);
  const home = join(root, "home");
  const reason = "the agent reported these fault bytes";
  await hookAssembly(home, {
    failure: "#!/bin/sh\nprintf 'cause=[%s]\\nreason=[%s]\\n' \"$CAUSE\" \"$REASON\"\ncat \"$REASON\"\n",
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("fault", { reason })], { stopReason: "toolUse" }),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toContain(reason);

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const runRoot = join(home, "runs", run);
  const events = await record(join(runRoot, "record.jsonl"));
  const reasonPath = join(runRoot, "stages/01-work/1/1/checks/fault.txt");
  const hookCapture = "stages/01-work/1/1/hooks/failure.txt";

  await expect(readFile(reasonPath, "utf8")).resolves.toBe(reason);
  expect(hookEvents(events, "failure")).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, capture: hookCapture }),
  ]);
  await expect(readFile(join(runRoot, hookCapture), "utf8"))
    .resolves.toBe(`cause=[fault]\nreason=[${reasonPath}]\n${reason}`);
  expect(events.filter((event) => event["event"] === "check")).toEqual([]);
  expect(events.filter((event) => event["event"] === "stage_start")).toEqual([
    expect.objectContaining({ stage: "01-work", retry: 1 }),
  ]);
  expect(events.filter((event) => event["event"] === "stage_end")).toEqual([
    expect.objectContaining({ stage: "01-work", retry: 1, exit: 2, cause: "fault", reason }),
  ]);
  expect(events.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason }),
  ]);
});
