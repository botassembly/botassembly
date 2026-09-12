// Ticket 0176 — a stage's explicit access declaration is enforced where model
// tool calls cross into Bot. Hooks remain ordinary deterministic processes, and
// the record keeps enough bounded facts to explain denials after the stage ends.
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { main } from "../src/cli.ts";
import { at, events, realBoundary, runsIn, tempRoots } from "./cli-boundary.ts";

const execute = promisify(execFile);
const roots = tempRoots();
afterEach(() => roots.cleanup());

const POLICY = { read: ["INPUT"], write: ["OUTPUT"], bash: ["git"] };
const SECRET = "implementation-only-canary";

async function assembly(home: string, gatePasses: boolean, boundary = true): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const access = boundary
    ? "access:\n  read: [INPUT]\n  write: [OUTPUT]\n  bash: [git]\n"
    : "";
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), `---\nretries: 0\n${access}---\nDo the work.\n`),
    writeFile(join(stage, "before"), "#!/bin/sh\ncat \"$PWD/private.ts\" > \"$TMP/before.txt\"\n"),
    writeFile(join(stage, "success"), "#!/bin/sh\ncat \"$PWD/private.ts\"\n"),
    writeFile(join(stage, "failure"), "#!/bin/sh\ncat \"$PWD/private.ts\"\n"),
    writeFile(join(stage, "gate"), gatePasses
      ? "#!/bin/sh\ntest \"$(cat \"$PWD/private.ts\")\" = implementation-only-canary\ntest \"$(cat \"$TMP/before.txt\")\" = implementation-only-canary\n"
      : "#!/bin/sh\ncat \"$PWD/private.ts\"\nexit 1\n"),
  ]);
  await Promise.all(["before", "success", "failure", "gate"].map((name) =>
    chmod(join(stage, name), 0o755)));
}

function call(name: string, parameters: object) {
  return fauxAssistantMessage([fauxToolCall(name, parameters)], { stopReason: "toolUse" });
}

function toolResults(messages: unknown[]): Record<string, unknown>[] {
  return messages.filter((message): message is Record<string, unknown> =>
    typeof message === "object" && message !== null && (message as Record<string, unknown>)["role"] === "toolResult");
}

function resultText(result: Record<string, unknown>): string {
  const content = result["content"];
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "object" && part !== null && "text" in part
    ? String((part as { text: unknown }).text) : "").join("\n");
}

function responseSpy(response: ReturnType<typeof fauxAssistantMessage>, seen: Record<string, unknown>[]) {
  return (context: { messages?: unknown[] }) => {
    seen.splice(0, seen.length, ...toolResults(context.messages ?? []));
    return response;
  };
}

async function runBoundary(home: string, root: string, gatePasses: boolean) {
  await assembly(home, gatePasses);
  const output: Buffer[] = [], errors: Buffer[] = [], seen: Record<string, unknown>[] = [];
  const { held, faux } = realBoundary(root, home, output, errors);
  const replies = [
    call("read", { path: "$INPUT/request.txt" }),
    call("bash", { command: "git status --short" }),
    // The declaration governs Bot's model-facing dispatch, not what an admitted
    // executable can do through its own configuration and subprocesses.
    call("bash", { command: `git -c alias.leak=!cat leak ${join(root, "private.ts")}` }),
    call("read", { path: "$PWD/private.ts" }),
    call("write", { path: "$PWD/private.ts", content: "overwritten" }),
    call("edit", { path: "$PWD/private.ts", oldText: SECRET, newText: "edited" }),
    call("bash", { command: "find . -type f" }),
    call("bash", { command: "git status --short; cat private.ts" }),
    call("write", { path: "$OUTPUT", content: "answer" }),
    call("read", { path: "$OUTPUT" }),
    call("bash", { command: "node -e 'console.log(6 * 7)'" }),
    fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ];
  faux.setResponses(replies.map((reply) => responseSpy(reply, seen)));
  const code = await main(["run", "start", "review/main", "the evidence"], held);
  return { code, output: Buffer.concat(output).toString(), errors: Buffer.concat(errors).toString(), seen };
}

test("a declared stage boundary admits only its slot operations and named project commands", async () => {
  const { root, home } = await roots.scratch("bot-stage-access-");
  await writeFile(join(root, "private.ts"), SECRET);
  await execute("git", ["init", "-q"], { cwd: root });

  // A passing run proves before, gate, and success hooks still read the
  // implementation path even though the model cannot.
  const passing = await runBoundary(home, root, true);
  expect([passing.code, passing.output, passing.errors]).toEqual([0, "answer", ""]);
  expect(passing.seen.slice(0, 3).map(resultText)).toEqual([
    "the evidence",
    expect.stringContaining("private.ts"),
    SECRET,
  ]);
  const denied = passing.seen.slice(3).filter((result) => result["isError"] === true);
  expect(denied).toHaveLength(7);
  expect(denied.map((result) => result["details"])).toEqual([
    { type: "access-denied", tool: "read", boundary: "PWD" },
    { type: "access-denied", tool: "write", boundary: "PWD" },
    { type: "access-denied", tool: "edit", boundary: "PWD" },
    { type: "access-denied", tool: "bash", boundary: "command" },
    { type: "access-denied", tool: "bash", boundary: "command" },
    { type: "access-denied", tool: "read", boundary: "OUTPUT" },
    { type: "access-denied", tool: "bash", boundary: "command" },
  ]);
  for (const result of denied) {
    const text = resultText(result);
    expect(text).toMatch(/denied.*declared.*boundary|declared.*boundary.*denied/iu);
    expect(Buffer.byteLength(text)).toBeLessThan(512);
    expect(text).not.toContain(SECRET);
  }
  expect(await readFile(join(root, "private.ts"), "utf8")).toBe(SECRET);

  // An exhausted run proves denial evidence is published before normal stage
  // completion, while its gate and failure hook retain ordinary process access.
  const exhausted = await runBoundary(home, root, false);
  expect(exhausted.code).toBe(1);
  const recordedRuns = await Promise.all((await runsIn(home)).map(async (run) => ({
    run, record: await events(join(home, "runs", run, "record.jsonl")),
  })));
  const exhaustedRun = recordedRuns.find(({ record }) => record.some((event) =>
    event["event"] === "stage_end" && event["cause"] === "exhausted"));
  const run = at(exhaustedRun === undefined ? [] : [exhaustedRun.run], 0);
  const record = exhaustedRun?.record ?? [];
  expect(record.find((event) => event["event"] === "stage_start")).toMatchObject({ access: POLICY });
  expect(record.filter((event) => event["event"] === "tool_denied").map((event) => ({
    tool: event["tool"], boundary: event["boundary"],
  }))).toEqual([
    { tool: "read", boundary: "PWD" },
    { tool: "write", boundary: "PWD" },
    { tool: "edit", boundary: "PWD" },
    { tool: "bash", boundary: "command" },
    { tool: "bash", boundary: "command" },
    { tool: "read", boundary: "OUTPUT" },
    { tool: "bash", boundary: "command" },
  ]);
  expect(record).toContainEqual(expect.objectContaining({ event: "stage_end", cause: "exhausted" }));
  const hookKinds = record.filter((event) => event["event"] === "hook").map((event) => event["hook"]);
  expect(hookKinds).toEqual(["before", "failure"]);
  const failure = record.find((event) => event["event"] === "hook" && event["hook"] === "failure");
  expect(await readFile(join(home, "runs", run, String(failure?.["capture"])), "utf8")).toBe(SECRET);

});

test("a stage without an access declaration keeps the existing unrestricted tools", async () => {
  const { root, home } = await roots.scratch("bot-stage-access-compat-");
  const outside = await mkdtemp(join(tmpdir(), "bot-stage-access-outside-"));
  try {
    const outsideFile = join(outside, "written.txt");
    await writeFile(join(root, "private.ts"), SECRET);
    await assembly(home, true, false);
    const output: Buffer[] = [], errors: Buffer[] = [], seen: Record<string, unknown>[] = [];
    const { held, faux } = realBoundary(root, home, output, errors);
    faux.setResponses([
      responseSpy(call("read", { path: "$PWD/private.ts" }), seen),
      responseSpy(call("write", { path: outsideFile, content: "outside the working directory" }), seen),
      responseSpy(call("bash", { command: "node -e 'process.stdout.write(String(6 * 7))'" }), seen),
      responseSpy(call("write", { path: "$OUTPUT", content: "answer" }), seen),
      responseSpy(call("read", { path: "$OUTPUT" }), seen),
      responseSpy(fauxAssistantMessage("done"), seen),
      responseSpy(fauxAssistantMessage("done"), seen),
    ]);

    const code = await main(["run", "start", "review/main", "the evidence"], held);
    expect([code, Buffer.concat(errors).toString()]).toEqual([0, ""]);
    expect(await readFile(outsideFile, "utf8")).toBe("outside the working directory");
    expect(seen.map(resultText)).toEqual([
      SECRET,
      expect.stringContaining("Successfully wrote"),
      "42",
      expect.stringContaining("Successfully wrote"),
      "answer",
    ]);
    const run = at(await runsIn(home), 0);
    const record = await events(join(home, "runs", run, "record.jsonl"));
    expect(record.find((event) => event["event"] === "stage_start")).not.toHaveProperty("access");
    expect(record).not.toContainEqual(expect.objectContaining({ event: "tool_denied" }));
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
