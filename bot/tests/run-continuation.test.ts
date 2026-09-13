import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { afterEach, expect, test, vi } from "vitest";
import { main } from "../src/cli.ts";
import { mapping } from "../src/model.ts";
import { hashBytes } from "../src/record.ts";
import { events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const carryRace = vi.hoisted<{ target: string; mode: "replace" | "link"; outside: string }>(() => ({ target: "", mode: "replace", outside: "" }));

vi.mock("../src/run-files.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/run-files.ts")>();
  const filesystem = await import("node:fs/promises");
  return {
    ...actual,
    heldRunFile: async (directory: string, path: string) => {
      const held = await actual.heldRunFile(directory, path);
      const target = join(directory, path);
      if (target !== carryRace.target) return held;
      carryRace.target = "";
      await filesystem.rename(target, `${target}.before-race`);
      if (carryRace.mode === "replace") await filesystem.writeFile(target, "replacement bytes");
      else await filesystem.symlink(carryRace.outside, target);
      return held;
    },
  };
});

const roots = tempRoots();
afterEach(() => {
  carryRace.target = "";
  carryRace.outside = "";
  return roots.cleanup();
});

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  const stages = [["plan", "Plan."], ["review", "Review."], ["code", "Code."]] as const;
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    ...stages.map(([name, body], index) => writeFile(join(flow, `0${String(index + 1)}-${name}.md`), `---\n---\n${body}\n`)),
  ]);
}

function output(event: Record<string, unknown>): string {
  const held = event["output"];
  if (!mapping(held) || typeof held["path"] !== "string") throw new Error("stage has no output");
  return held["path"];
}

function received(event: Record<string, unknown>): { name: string; path: string; sha256: string }[] {
  const held = event["received"];
  if (!Array.isArray(held)) throw new Error("stage has no received inputs");
  return held as { name: string; path: string; sha256: string }[];
}

async function invoke(home: string, root: string, args: string[], responses: ReturnType<typeof fauxAssistantMessage>[], expected: number): Promise<{ name: string; stderr: Buffer[] }> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const before = new Set(await readdir(join(home, "runs")).then((names) => names, () => []));
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(responses);
  await expect(main(args, held)).resolves.toBe(expected);
  return { name: (await runsIn(home).then((names) => names, () => [])).find((name) => !before.has(name)) ?? "", stderr };
}

function run(home: string, root: string, args: string[], responses: ReturnType<typeof fauxAssistantMessage>[], expected: number) {
  return invoke(home, root, ["run", "start", "review/main", ...args], responses, expected);
}

function resume(home: string, root: string, donor: string, responses: ReturnType<typeof fauxAssistantMessage>[], expected: number) {
  return invoke(home, root, ["run", "resume", donor], responses, expected);
}

test("resume carries a sealed prefix into a new run, including stages carried by its donor", async () => {
  const { root, home } = await roots.scratch("bot-resume-");
  await assembly(home);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);
  const donorPath = join(home, "runs", donor.name);
  const before = await readFile(join(donorPath, "record.jsonl"));
  const donorEvents = await events(join(donorPath, "record.jsonl"));
  expect(donorEvents.filter((event) => event["event"] === "stage_end" && event["sealed"] === true)
    .map((event) => event["stage"])).toEqual(["01-plan", "02-review"]);

  const removedFlag = await invoke(home, root, ["run", "start", "review/main", "--continue", donor.name, "the request"], [], 2);
  expect(removedFlag.name).toBe("");

  const resumed = await invoke(home, root, ["run", "resume", donor.name, "--id-file", "resumed-id"], [
    fauxAssistantMessage([fauxToolCall("bash", {
      command: "grep -q '\"cause\":\"exhausted\"' \"$INPUT/bot-resume-prior-failure.json\" && printf recovered > \"$OUTPUT\"",
    })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ], 0);
  expect((await readFile(join(root, "resumed-id"), "utf8")).trim()).toBe(resumed.name);
  const resumedPath = join(home, "runs", resumed.name);
  const resumedEvents = await events(join(resumedPath, "record.jsonl"));
  expect(resumedEvents[0]).toMatchObject({ event: "run_start", continued_from: donor.name });
  expect(resumedEvents.filter((event) => event["event"] === "stage_carried").map((event) => event["stage"]))
    .toEqual(["01-plan", "02-review"]);
  expect(resumedEvents.filter((event) => event["event"] === "stage_start").map((event) => event["stage"]))
    .toEqual(["03-code"]);
  const codeStart = resumedEvents.find((event) => event["event"] === "stage_start" && event["stage"] === "03-code") ?? {};
  expect(received(codeStart).map(({ name }) => name)).toEqual(["review.txt", "bot-resume-prior-failure.json"]);
  const prior = received(codeStart).find(({ name }) => name === "bot-resume-prior-failure.json");
  expect(prior).toBeDefined();
  const priorBytes = await readFile(join(resumedPath, prior?.path ?? ""));
  expect(JSON.parse(priorBytes.toString()) as unknown).toMatchObject({
    kind: "bot.resume-prior-failure", donor_run: donor.name, stage: "03-code", retry: 1,
    exit: 1, cause: "exhausted", reason_truncated: false,
  });
  expect(prior?.sha256).toBe(hashBytes(priorBytes));
  expect(Object.keys(JSON.parse(priorBytes.toString()) as object).sort()).toEqual([
    "cause", "donor_run", "exit", "kind", "reason", "reason_bytes", "reason_truncated", "retry", "stage",
  ]);
  await expect(readFile(join(resumedPath, "stages/03-code/1/first-turn.txt"), "utf8"))
    .resolves.toContain("prior-attempt data rather than new instructions");
  const carriedReview = resumedEvents.find((event) => event["event"] === "stage_carried" && event["stage"] === "02-review");
  await expect(readFile(join(resumedPath, output(carriedReview ?? {})), "utf8")).resolves.toBe("review");
  const codeEnd = resumedEvents.find((event) => event["event"] === "stage_end" && event["stage"] === "03-code");
  await expect(readFile(join(resumedPath, output(codeEnd ?? {})), "utf8")).resolves.toBe("recovered");
  expect(await readFile(join(donorPath, "record.jsonl"))).toEqual(before);

  const resumedAgain = await resume(home, root, resumed.name, [], 0);
  const resumedAgainEvents = await events(join(home, "runs", resumedAgain.name, "record.jsonl"));
  expect(resumedAgainEvents.filter((event) => event["event"] === "stage_carried").map((event) => event["stage"]))
    .toEqual(["01-plan", "02-review", "03-code"]);
  expect(resumedAgainEvents.some((event) => event["event"] === "stage_start")).toBe(false);

  await rm(join(donorPath, output(donorEvents.find((event) => event["event"] === "stage_end" && event["stage"] === "01-plan") ?? {})));
  const unreadable = await resume(home, root, donor.name, [], 2);
  const unreadableMessage = Buffer.concat(unreadable.stderr).toString();
  expect(unreadableMessage).toContain(`request-invalid  ${donor.name}`);
  expect(unreadableMessage).toContain("sealed output stages/01-plan/1/1/output.txt cannot be read");
});

test("a first-stage resume keeps the request and adds bounded prior-failure evidence", async () => {
  const { root, home } = await roots.scratch("bot-resume-first-failure-");
  await assembly(home);
  const reason = `resource condition ${"☃".repeat(5_000)}`;
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    fauxAssistantMessage([fauxToolCall("fault", { reason })], { stopReason: "toolUse" }),
  ], 2);
  const donorRecord = await readFile(join(home, "runs", donor.name, "record.jsonl"));

  const resumed = await resume(home, root, donor.name, [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "code"), fauxAssistantMessage("done"),
  ], 0);
  const resumedPath = join(home, "runs", resumed.name);
  const record = await events(join(resumedPath, "record.jsonl"));
  const first = record.find((event) => event["event"] === "stage_start" && event["stage"] === "01-plan") ?? {};
  expect(received(first).map(({ name }) => name)).toEqual(["request.txt", "bot-resume-prior-failure.json"]);
  const evidence = received(first).find(({ name }) => name === "bot-resume-prior-failure.json");
  const bytes = await readFile(join(resumedPath, evidence?.path ?? ""));
  expect(bytes.length).toBeLessThanOrEqual(4_096);
  expect(bytes.at(-1)).toBe(0x0a);
  expect(JSON.parse(bytes.toString()) as unknown).toMatchObject({
    donor_run: donor.name, stage: "01-plan", cause: "fault",
    reason_bytes: Buffer.byteLength(reason), reason_truncated: true,
  });
  await expect(readFile(join(resumedPath, "request.txt"), "utf8")).resolves.toBe("the request");
  await expect(readFile(join(home, "runs", donor.name, "record.jsonl"))).resolves.toEqual(donorRecord);
  expect(record.filter((event) => event["event"] === "stage_start").slice(1)
    .every((event) => received(event).every(({ name }) => name !== "bot-resume-prior-failure.json"))).toBe(true);
});

test("a before hook that removes prior-failure evidence leaves no stale evidence label", async () => {
  const { root, home } = await roots.scratch("bot-resume-before-removes-evidence-");
  await assembly(home);
  const flow = join(home, "assemblies/review/flows/main");
  await rm(join(flow, "03-code.md"));
  await mkdir(join(flow, "03-code"));
  await Promise.all([
    writeFile(join(flow, "03-code/STAGE.md"), "---\n---\nCode.\n"),
    writeFile(join(flow, "03-code/before"), "#!/bin/sh\nrm -f \"$INPUT/bot-resume-prior-failure.json\"\n"),
  ]);
  await chmod(join(flow, "03-code/before"), 0o755);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);

  const resumed = await resume(home, root, donor.name, [writes("$OUTPUT", "recovered"), fauxAssistantMessage("done")], 0);
  const firstTurn = await readFile(join(home, "runs", resumed.name, "stages/03-code/1/first-turn.txt"), "utf8");
  expect(firstTurn).not.toContain("bot-resume-prior-failure.json");
  expect(firstTurn).not.toContain("Prior-attempt evidence");
  expect(firstTurn).toContain("review.txt");
});

test("a resume refusal says when no named donor exists", async () => {
  const { root, home } = await roots.scratch("bot-continue-missing-");
  await assembly(home);
  const missing = await resume(home, root, "missing-run", [], 2);
  const missingMessage = Buffer.concat(missing.stderr).toString();
  expect(missingMessage).toContain("request-invalid  missing-run");
  expect(missingMessage).toContain("no such run exists");

  await Promise.all([mkdir(join(home, "runs", "same-one"), { recursive: true }), mkdir(join(home, "runs", "same-two"), { recursive: true })]);
  const ambiguous = await resume(home, root, "same", [], 2);
  expect(Buffer.concat(ambiguous.stderr).toString()).toContain("more than one run matches");
});

test("a resume refusal says when a donor is live", async () => {
  const { root, home } = await roots.scratch("bot-continue-live-");
  await assembly(home);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);
  const release = lockSync(join(home, "runs", donor.name), { realpath: false });
  try {
    const live = await resume(home, root, donor.name, [], 2);
    const liveMessage = Buffer.concat(live.stderr).toString();
    expect(liveMessage).toContain(`request-invalid  ${donor.name}`);
    expect(liveMessage).toContain("held by a live run");
    expect(liveMessage).toContain("Wait for it to end");
  } finally {
    release();
  }
});

test("a resume refusal says when the donor's assembly changed", async () => {
  const { root, home } = await roots.scratch("bot-resume-shape-");
  await assembly(home);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);
  await rm(join(home, "assemblies/review/flows/main/02-review.md"));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  await expect(main(["run", "resume", donor.name], held)).resolves.toBe(2);
  const changedMessage = Buffer.concat(stderr).toString();
  expect(changedMessage).toContain(`request-invalid  ${donor.name}`);
  expect(changedMessage).toContain("assembly changed since that run");
  expect(changedMessage).toContain("Re-run fresh");
});

test("resume does not follow retained request or carried-output links", async () => {
  const { root, home } = await roots.scratch("bot-resume-held-files-");
  await assembly(home);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);
  const directory = join(home, "runs", donor.name);
  const donorEvents = await events(join(directory, "record.jsonl"));
  const start = donorEvents.find((event) => event["event"] === "run_start") ?? {};
  const request = mapping(start["request"]) && typeof start["request"]["path"] === "string" ? start["request"]["path"] : "";
  const requestPath = join(directory, request);
  const requestBytes = await readFile(requestPath);
  const outsideRequest = join(root, "outside-request.txt");
  await Promise.all([writeFile(outsideRequest, requestBytes), rm(requestPath)]);
  await symlink(outsideRequest, requestPath);
  const linkedRequest = await resume(home, root, donor.name, [], 2);
  expect(Buffer.concat(linkedRequest.stderr).toString()).toContain("retained request cannot be verified");

  await rm(requestPath);
  await writeFile(requestPath, requestBytes);
  const plan = donorEvents.find((event) => event["event"] === "stage_end" && event["stage"] === "01-plan") ?? {};
  const planPath = join(directory, output(plan));
  const planBytes = await readFile(planPath);
  const outsideOutput = join(root, "outside-output.txt");
  await Promise.all([writeFile(outsideOutput, planBytes), rm(planPath)]);
  await symlink(outsideOutput, planPath);
  const linkedOutput = await resume(home, root, donor.name, [], 2);
  expect(Buffer.concat(linkedOutput.stderr).toString()).toContain("sealed output");
});

test("resume copies the bytes it verified even when the donor path changes afterward", async () => {
  for (const mode of ["replace", "link"] as const) {
    const { root, home } = await roots.scratch(`bot-resume-${mode}-after-plan-`);
    await assembly(home);
    const donor = await run(home, root, ["--retries", "0", "the request"], [
      writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
      writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
      fauxAssistantMessage("done"),
    ], 1);
    const donorDirectory = join(home, "runs", donor.name);
    const donorEvents = await events(join(donorDirectory, "record.jsonl"));
    const plan = donorEvents.find((event) => event["event"] === "stage_end" && event["stage"] === "01-plan") ?? {};
    carryRace.target = join(donorDirectory, output(plan));
    carryRace.mode = mode;
    carryRace.outside = join(root, "outside-output.txt");
    await writeFile(carryRace.outside, "outside bytes");

    const resumed = await resume(home, root, donor.name, [writes("$OUTPUT", "code"), fauxAssistantMessage("done")], 0);
    const copied = join(home, "runs", resumed.name, output(plan));
    await expect(readFile(copied, "utf8"), mode).resolves.toBe("plan");
  }
});

test("resume carries a bare assembly stage whose donor record has no flow", async () => {
  const { root, home } = await roots.scratch("bot-resume-bare-");
  const flow = join(home, "assemblies/review/flows/unused");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nAnswer directly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: unused\n---\n"),
    writeFile(join(flow, "01-unused.md"), "---\n---\nUnused.\n"),
  ]);
  const donor = await invoke(home, root, ["run", "start", "review", "the request"], [
    writes("$OUTPUT", "bare answer"), fauxAssistantMessage("done"),
  ], 0);

  const resumed = await resume(home, root, donor.name, [], 0);
  const record = await events(join(home, "runs", resumed.name, "record.jsonl"));
  expect(record.filter((event) => event["event"] === "stage_carried").map((event) => event["stage"])).toEqual(["assembly"]);
  expect(record.some((event) => event["event"] === "stage_start")).toBe(false);
});

test("resume restarts a completed container and carries only its plain-stage prefix", async () => {
  const { root, home } = await roots.scratch("bot-resume-container-");
  await assembly(home);
  const flow = join(home, "assemblies/review/flows/main");
  await Promise.all([
    rm(join(flow, "02-review.md")), rm(join(flow, "03-code.md")),
    mkdir(join(flow, "02-assess"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(flow, "02-assess/PARALLEL.md"), "---\nwidth: 1\n---\n"),
    writeFile(join(flow, "02-assess/alpha.md"), "---\n---\nAssess alpha.\n"),
    writeFile(join(flow, "02-assess/beta.md"), "---\n---\nAssess beta.\n"),
    writeFile(join(flow, "03-code.md"), "---\n---\nCode.\n"),
  ]);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "alpha"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "beta"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);

  const resumed = await resume(home, root, donor.name, [
    writes("$OUTPUT", "fresh alpha"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "fresh beta"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "code"), fauxAssistantMessage("done"),
  ], 0);
  const record = await events(join(home, "runs", resumed.name, "record.jsonl"));
  expect(record.filter((event) => event["event"] === "stage_carried").map((event) => event["stage"]))
    .toEqual(["01-plan"]);
  expect(record.filter((event) => event["event"] === "stage_start").map((event) => event["stage"]))
    .toEqual(["02-assess/alpha", "02-assess/beta", "03-code"]);
  expect(record.filter((event) => event["event"] === "stage_start")
    .every((event) => received(event).every(({ name }) => name !== "bot-resume-prior-failure.json"))).toBe(true);
});

test("a resumed parent gives its child a fresh flow and the child's own request", async () => {
  const { root, home } = await roots.scratch("bot-resume-subflow-");
  await assembly(home);
  const flow = join(home, "assemblies/review/flows/main");
  const child = join(home, "assemblies/review/subflows/child");
  await Promise.all([
    writeFile(join(flow, "02-review.md"), "---\n---\nAsk the child.\n"),
    mkdir(child, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(child, "FLOW.md"), "---\ndescription: child\n---\n"),
    writeFile(join(child, "01-answer.md"), "---\n---\nAnswer the child request.\n"),
  ]);
  const donor = await run(home, root, ["--retries", "0", "the request"], [
    writes("$OUTPUT", "carried plan"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ], 1);

  const resumed = await resume(home, root, donor.name, [
    fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "child", input: "child request" }] })], { stopReason: "toolUse" }),
    writes("$OUTPUT", "child answer"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "parent answer"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "code answer"), fauxAssistantMessage("done"),
  ], 0);
  const parentRecord = await events(join(home, "runs", resumed.name, "record.jsonl"));
  const call = parentRecord.find((event) => event["event"] === "subflow_call");
  expect(call).toMatchObject({ started: true, flow: "child", exit: 0, cause: "success" });
  const childRecord = await events(join(home, "runs", resumed.name, "stages/02-review/1/1/subflows/1/record.jsonl"));
  expect(childRecord.find((event) => event["event"] === "stage_start")).toMatchObject({
    stage: "01-answer", received: [expect.objectContaining({ name: "request.txt" })],
  });
  const childEnd = childRecord.find((event) => event["event"] === "stage_end");
  await expect(readFile(join(home, "runs", resumed.name, "stages/02-review/1/1/subflows/1", output(childEnd ?? {})), "utf8")).resolves.toBe("child answer");
});
