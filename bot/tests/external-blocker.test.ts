// An external machine condition is a gate verdict, not a model escape hatch.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { GATE_TERMINAL_FEEDBACK_MAX } from "../src/gate-feedback.ts";
import { events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(roots.cleanup);

async function record(home: string): Promise<Record<string, unknown>[]> {
  const run = (await runsIn(home))[0] ?? "";
  return events(join(home, "runs", run, "record.jsonl"));
}

async function fixture(gate: string, failure?: string) {
  const { root, home } = await roots.scratch("bot-external-blocker-");
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\nretries: 2\n---\nWrite the report.\n"),
    writeFile(join(stage, "gate"), gate),
  ]);
  await chmod(join(stage, "gate"), 0o755);
  if (failure !== undefined) {
    await writeFile(join(stage, "failure"), failure);
    await chmod(join(stage, "failure"), 0o755);
  }
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  const { held: boundary, faux } = realBoundary(root, home, output, errors);
  return { home, faux, boundary, errors };
}

function responses(content: string) {
  return [
    writes("$OUTPUT", content),
    fauxAssistantMessage("done"),
    fauxAssistantMessage("retry one"),
    fauxAssistantMessage("retry two"),
  ];
}

test("a gate exit 75 is a blocked run with its captured external evidence and no retry", async () => {
  const f = await fixture("#!/bin/sh\nprintf 'disk full on the build volume\\n'\nexit 75\n");
  f.faux.setResponses(responses("the report"));

  await expect(main(["run", "start", "review/main", "request"], f.boundary)).resolves.toBe(1);

  const events = await record(f.home);
  expect(events.filter((event) => event["event"] === "stage_start")).toHaveLength(1);
  expect(events).toContainEqual(expect.objectContaining({ event: "check", check: "gate", exit: 75 }));
  expect(events).toContainEqual(expect.objectContaining({ event: "stage_end", exit: 1, cause: "blocked" }));
  expect(events).toContainEqual(expect.objectContaining({ event: "run_end", exit: 1, cause: "blocked" }));
  const run = (await readdir(join(f.home, "runs")))[0] ?? "";
  await expect(readFile(join(f.home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8"))
    .resolves.toBe("disk full on the build volume\n");
  expect(Buffer.concat(f.errors).toString()).toContain("blocked: disk full on the build volume");
});

test("a gate exit 75 without captured evidence remains an ordinary red gate", async () => {
  const f = await fixture("#!/bin/sh\nexit 75\n");
  f.faux.setResponses(responses("the report"));

  await expect(main(["run", "start", "review/main", "request"], f.boundary)).resolves.toBe(1);

  const events = await record(f.home);
  expect(events.filter((event) => event["event"] === "stage_start")).toHaveLength(3);
  expect(events).toContainEqual(expect.objectContaining({ event: "stage_end", exit: 1, cause: "exhausted" }));
  expect(events).toContainEqual(expect.objectContaining({ event: "run_end", exit: 1, cause: "exhausted" }));
});

test("a model saying it is externally blocked still exhausts a normal red gate", async () => {
  const f = await fixture("#!/bin/sh\nprintf 'repair the report\\n'\nexit 1\n");
  f.faux.setResponses(responses("The machine is externally blocked."));

  await expect(main(["run", "start", "review/main", "request"], f.boundary)).resolves.toBe(1);

  const events = await record(f.home);
  expect(events.filter((event) => event["event"] === "stage_start")).toHaveLength(3);
  expect(events).toContainEqual(expect.objectContaining({ event: "stage_end", exit: 1, cause: "exhausted" }));
  expect(events).toContainEqual(expect.objectContaining({ event: "run_end", exit: 1, cause: "exhausted" }));
});

test("a verbose red gate sends bounded feedback, records bounded endings, and retains exact evidence", async () => {
  const raw = `${"h".repeat(8_000)}${"t".repeat(8_000)}`;
  const f = await fixture(
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(raw)});\nprocess.exit(1);\n`,
    "#!/bin/sh\nprintf '%s' \"$REASON\"\n",
  );
  const seen: string[] = [];
  const retry = (context: { messages?: unknown[] }) => {
    seen.push(JSON.stringify(context.messages ?? []));
    return fauxAssistantMessage("unchanged");
  };
  f.faux.setResponses([writes("$OUTPUT", "the report"), fauxAssistantMessage("done"), retry, retry]);

  await expect(main(["run", "start", "review/main", "request"], f.boundary)).resolves.toBe(1);

  expect(seen).toHaveLength(2);
  for (const prompt of seen) {
    expect(prompt).toContain("16000 bytes total");
    expect(prompt).toContain("check.capture");
    const excerpts = prompt.match(/[ht]+/gu) ?? [];
    expect(Math.max(...excerpts.map((excerpt) => Buffer.byteLength(excerpt)))).toBeLessThan(5_000);
  }
  const held = await record(f.home);
  const endings = held.filter((event) => event["event"] === "stage_end" || event["event"] === "run_end");
  expect(endings).toHaveLength(2);
  for (const ending of endings) {
    expect(Buffer.byteLength(String(ending["reason"]))).toBeLessThanOrEqual(GATE_TERMINAL_FEEDBACK_MAX);
    expect(String(ending["reason"])).toContain("check.capture");
  }
  const checks = held.filter((event) => event["event"] === "check" && event["check"] === "gate");
  expect(checks).toHaveLength(3);
  expect(Object.keys(checks[0] ?? {}).sort()).toEqual([
    "capture", "check", "event", "exit", "file", "retry", "sha256", "stage", "ts",
  ]);
  const run = (await readdir(join(f.home, "runs")))[0] ?? "";
  const capture = join(f.home, "runs", run, "stages/01-work/1/3/checks/gate.txt");
  await expect(readFile(capture)).resolves.toEqual(Buffer.from(raw));
  await expect(readFile(join(f.home, "runs", run, "stages/01-work/1/3/hooks/failure.txt"), "utf8"))
    .resolves.toBe(capture);
});

test("a verbose gate exit 75 uses the bounded terminal view and retains exact evidence", async () => {
  const raw = `${"outside ".repeat(2_000)}blocked`;
  const f = await fixture(`#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(raw)});\nprocess.exit(75);\n`);
  f.faux.setResponses(responses("the report"));

  await expect(main(["run", "start", "review/main", "request"], f.boundary)).resolves.toBe(1);

  const held = await record(f.home);
  const endings = held.filter((event) => event["event"] === "stage_end" || event["event"] === "run_end");
  for (const ending of endings) {
    expect(Buffer.byteLength(String(ending["reason"]))).toBeLessThanOrEqual(GATE_TERMINAL_FEEDBACK_MAX);
    expect(String(ending["reason"])).toContain("check.capture");
  }
  const run = (await readdir(join(f.home, "runs")))[0] ?? "";
  await expect(readFile(join(f.home, "runs", run, "stages/01-work/1/1/checks/gate.txt")))
    .resolves.toEqual(Buffer.from(raw));
});

test("invalid UTF-8 gate bytes stay exact in the capture and expose no decoded fragment", async () => {
  const raw = Buffer.concat([Buffer.from("SECRET-HEAD"), Buffer.from([0xff]), Buffer.from("SECRET-TAIL")]);
  const f = await fixture("#!/usr/bin/env node\nprocess.stdout.write(Buffer.from([83,69,67,82,69,84,45,72,69,65,68,255,83,69,67,82,69,84,45,84,65,73,76]));\nprocess.exit(1);\n");
  const seen: string[] = [];
  const retry = (context: { messages?: unknown[] }) => {
    seen.push(JSON.stringify(context.messages ?? []));
    return fauxAssistantMessage("unchanged");
  };
  f.faux.setResponses([writes("$OUTPUT", "the report"), fauxAssistantMessage("done"), retry, retry]);

  await expect(main(["run", "start", "review/main", "request"], f.boundary)).resolves.toBe(1);

  for (const prompt of seen) {
    expect(prompt).toContain("not valid UTF-8");
    expect(prompt).not.toContain("SECRET");
    expect(prompt).not.toContain("�");
  }
  const held = await record(f.home);
  for (const ending of held.filter((event) => event["event"] === "stage_end" || event["event"] === "run_end")) {
    expect(String(ending["reason"])).toContain("not valid UTF-8");
    expect(String(ending["reason"])).not.toContain("SECRET");
    expect(String(ending["reason"])).not.toContain("�");
  }
  const run = (await readdir(join(f.home, "runs")))[0] ?? "";
  await expect(readFile(join(f.home, "runs", run, "stages/01-work/1/3/checks/gate.txt"))).resolves.toEqual(raw);
});
