import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { parseRunResume, renderRunStart } from "../src/run-start.ts";
import { prehashAssembly } from "../src/record.ts";
import type { StartedRunResult } from "../src/run.ts";
import { events, realBoundary, runsIn, tempRoots, TEST_INSTALLATION_ID, writes } from "./cli-boundary.ts";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n  fast: { provider: faux, model: faux-1, reasoning: low }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    ...["plan", "review", "code"].map((name, index) =>
      writeFile(join(flow, `0${String(index + 1)}-${name}.md`), `---\n---\n${name}\n`)),
  ]);
}

async function donor(home: string, root: string, controls: string[] = []): Promise<string> {
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, out, err);
  faux.setResponses([
    writes("$OUTPUT", "plan"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "review"), fauxAssistantMessage("done"),
    fauxAssistantMessage("done"),
  ]);
  await expect(main(["run", "start", "review/main", "request", "--retries", "0", ...controls], held)).resolves.toBe(1);
  return (await runsIn(home))[0] ?? "";
}

async function resumeJson(
  home: string, root: string, donorRun: string, copyingCarried?: (identity: { stage: string }) => Promise<void>,
): Promise<{ code: number; out: Buffer; err: Buffer }> {
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, out, err);
  faux.setResponses([writes("$OUTPUT", "fixed"), fauxAssistantMessage("done")]);
  const code = await main(["run", "resume", donorRun, "--correlation", "caller-7", "-j"], {
    ...held, ...(copyingCarried === undefined ? {} : { copyingCarried }),
  });
  return { code, out: Buffer.concat(out), err: Buffer.concat(err) };
}

test("run resume returns donor and exact durably carried identities", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-");
  await assembly(home);
  const donorRun = await donor(home, root);
  const held = await resumeJson(home, root, donorRun);
  expect(held.code).toBe(0);
  expect(held.err).toEqual(Buffer.alloc(0));
  const data = (JSON.parse(held.out.toString()) as { data: Record<string, unknown> }).data;
  expect(data).toMatchObject({ donor: donorRun, correlation: "caller-7", installationId: TEST_INSTALLATION_ID, complete: true, exit: 0,
    carried: { count: 2, identitiesIncluded: true, identities: [
      { stage: "01-plan", retry: 1 }, { stage: "02-review", retry: 1 },
    ] } });
  const record = await events(join(home, "runs", String(data["run"]), "record.jsonl"));
  expect(record[0]?.["installation_id"]).toBe(TEST_INSTALLATION_ID);
  expect(record.filter(({ event }) => event === "stage_carried").map(({ stage }) => stage)).toEqual(["01-plan", "02-review"]);
});

test.each([["before first", 1, 0], ["after one", 2, 1]] as const)(
  "copy failure %s reports only the durable carried prefix",
  async (_name, failAt, expected) => {
    const { root, home } = await roots.scratch("bot-run-resume-copy-");
    await assembly(home);
    const donorRun = await donor(home, root);
    let seen = 0;
    const held = await resumeJson(home, root, donorRun, () => {
      seen += 1;
      return seen === failAt ? Promise.reject(new Error("copy stopped")) : Promise.resolve();
    });
    expect(held.code).toBe(2);
    const data = (JSON.parse(held.out.toString()) as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ donor: donorRun, complete: true, exit: 2,
      carried: { count: expected, identitiesIncluded: true } });
    expect((data["carried"] as { identities: unknown[] }).identities).toHaveLength(expected);
  },
);

test("a refused donor uses the common error before starting a run", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-missing-");
  await assembly(home);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  await expect(main(["run", "resume", "missing", "-j"], held)).resolves.toBe(2);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(err).toString())).toMatchObject({ kind: "error", error: { operation: "run.resume" } });
  await expect(runsIn(home).catch(() => [])).resolves.toEqual([]);
});

test("resume refuses a captured assembly that uses retired access syntax", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-retired-access-");
  await assembly(home);
  const donorRun = await donor(home, root);
  const capturedStage = join(home, "runs", donorRun, "assembly/flows/main/03-code.md");
  const installedStage = join(home, "assemblies/review/flows/main/03-code.md");
  await chmod(capturedStage, 0o600);
  const original = await readFile(capturedStage, "utf8");
  const retired = original.replace("---\n---", "---\naccess: {}\n---");
  await Promise.all([writeFile(capturedStage, retired), writeFile(installedStage, retired)]);
  const recordPath = join(home, "runs", donorRun, "record.jsonl");
  const record = await events(recordPath);
  const opening = record[0];
  if (opening !== undefined) opening["assembly_hash"] = (await prehashAssembly(join(home, "runs", donorRun, "assembly"))).sha256;
  await chmod(recordPath, 0o600);
  await writeFile(recordPath, `${record.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  let executed = false;
  const code = await main(["run", "resume", donorRun, "-j"], {
    ...held, executeFlow: () => { executed = true; throw new Error("must not execute"); },
  });
  expect(code).toBe(2);
  expect(executed).toBe(false);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(Buffer.concat(err).toString()).toContain("unknown key access");
  expect(await runsIn(home)).toEqual([donorRun]);
});

test("a first run resume initializes the home before run birth", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-first-use-");
  await assembly(home);
  const donorRun = await donor(home, root);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, out, err);
  await unlink(join(home, "installation.json"));
  faux.setResponses([writes("$OUTPUT", "fixed"), fauxAssistantMessage("done")]);
  const code = await main(["run", "resume", donorRun, "-j"], held);
  expect(code).toBe(0);
  expect(Buffer.concat(err)).toEqual(Buffer.alloc(0));
  const data = (JSON.parse(Buffer.concat(out).toString()) as { data: Record<string, unknown> }).data;
  const record = await events(join(home, "runs", String(data["run"]), "record.jsonl"));
  expect(record[0]?.["installation_id"]).toBe(data["installationId"]);
  expect((await lstat(join(home, "installation.json"))).mode & 0o777).toBe(0o600);
});

test("a malformed installation refuses resume before birth", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-installation-");
  await assembly(home);
  const donorRun = await donor(home, root);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  const record = join(home, "installation.json"), idFile = join(root, "new-run-id");
  await writeFile(record, "{}\n", { mode: 0o600 });
  let contacted = false;
  const code = await main(["run", "resume", donorRun, "--id-file", idFile, "-j"], {
    ...held, executeFlow: () => { contacted = true; throw new Error("provider contact"); },
  });
  expect(code).toBe(5);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(err).toString())).toMatchObject({ error: { operation: "run.resume" } });
  expect(await runsIn(home)).toEqual([donorRun]);
  expect(contacted).toBe(false);
  await expect(lstat(idFile)).rejects.toMatchObject({ code: "ENOENT" });
});

test("large carried prefixes keep the count and explicitly omit identities", () => {
  const carried = Array.from({ length: 10_000 }, (_, index) => ({ stage: `stage-${String(index)}`, retry: 1 }));
  const result: StartedRunResult = {
    run: "2026-09-05T20-00-00-a025", startedAt: "2026-09-05T20:00:00.000Z",
    installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8",
    exitCode: 2, cause: "fault", donor: "donor", carried,
    ending: { ts: "2026-09-05T20:00:01.000Z", event: "run_end", exit: 2, cause: "fault" },
  };
  const rendered = renderRunStart(result);
  expect(rendered.stdout.length).toBeLessThanOrEqual(65_536);
  expect(JSON.parse(rendered.stdout.toString())).toMatchObject({ data: {
    donor: "donor", carried: { count: 10_000, identitiesIncluded: false },
  } });
});

test("resume parsing names its own errors, rejects separators, and preserves shared options", () => {
  expect(parseRunResume(["donor", "--correlation", "", "-j"])).toMatchObject({
    json: true, failure: { message: "Run resume correlation must not be empty." },
  });
  expect(parseRunResume(["donor", "--", "tail", "-j"])).toMatchObject({
    json: false, failure: { cause: "option-invalid" },
  });
  expect(parseRunResume(["donor", "--home", "a", "--home", "b", "-j"])).toMatchObject({
    json: true, failure: { cause: "option-repeated" },
  });
  expect(parseRunResume(["donor", "--id-file", "a", "--id-file", "b"])).toMatchObject({
    failure: { cause: "option-repeated" },
  });
  expect(parseRunResume(["donor", "--EVIDENCE", "a", "--EVIDENCE", "b", "-j"])).toEqual({
    args: ["donor", "--EVIDENCE", "a", "--EVIDENCE", "b"], json: true,
  });
});

test("a resume defensive rendering failure is delivered as a resume error", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-render-");
  await assembly(home);
  const donorRun = await donor(home, root);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  const path = "x".repeat(70_000);
  const exit = await main(["run", "resume", donorRun, "-j"], { ...held,
    executeFlow: () => Promise.resolve({
      exit: 0, cause: "success", outputBytes: Buffer.alloc(0),
      output: { name: "answer", extension: "txt", diskPath: "/unused", record: { path, sha256: "a".repeat(64) } },
      ending: { event: "run_end", ts: "2026-09-05T20:00:01.000Z", exit: 0, cause: "success" },
    }),
  });
  expect(exit).toBe(5);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(err).toString())).toMatchObject({
    kind: "error", error: { operation: "run.resume", message: "Run resume result exceeds its output bound." },
  });
});

test("a resume separator is rejected before donor or home work", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-separator-");
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  await expect(main(["run", "resume", "missing", "-j", "--", "tail"], held)).resolves.toBe(2);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(err).toString())).toMatchObject({
    kind: "error", error: { operation: "run.resume", cause: "option-invalid" },
  });
  await expect(runsIn(home).catch(() => [])).resolves.toEqual([]);
});

test("capabilities and help report run resume", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-help-");
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  await main(["capabilities", "-j"], held);
  const operations = (JSON.parse(Buffer.concat(out).toString()) as { data: { commands: Array<{ operation: string }> } })
    .data.commands.map(({ operation }) => operation);
  expect(operations).toContain("run.resume");
  out.length = 0;
  await main(["run", "resume", "--help"], held);
  expect(Buffer.concat(out).toString()).toContain("usage: bot run resume");
});

test("human resume preserves accepted output behavior", async () => {
    const { root, home } = await roots.scratch("bot-run-resume-human-");
    await assembly(home);
    const donorRun = await donor(home, root);
    const out: Buffer[] = [], err: Buffer[] = [];
    const { held, faux } = realBoundary(root, home, out, err);
    faux.setResponses([writes("$OUTPUT", "fixed"), fauxAssistantMessage("done")]);
    await expect(main(["run", "resume", donorRun], held)).resolves.toBe(0);
    expect(Buffer.concat(out)).toEqual(Buffer.from("fixed"));
    expect(Buffer.concat(err)).toEqual(Buffer.alloc(0));
});

const MODEL_OPTIONS = ["provider", "model", "reasoning", "intelligence"];

/** The four model option entries of a record's first `stage_start`, in ladder order. */
function modelLadder(record: Record<string, unknown>[]): { name: string; value: unknown; rung: string }[] {
  const first = record.find((event) => event["event"] === "stage_start");
  expect(first).toBeDefined();
  const options = (first as { options: { name: string; value: unknown; rung: string }[] }).options;
  return options.filter(({ name }) => MODEL_OPTIONS.includes(name));
}

async function resumedLadder(home: string, root: string, donorRun: string): Promise<{
  donor: { name: string; value: unknown; rung: string }[]; resumed: { name: string; value: unknown; rung: string }[];
}> {
  const held = await resumeJson(home, root, donorRun);
  expect(held.code).toBe(0);
  expect(held.err).toEqual(Buffer.alloc(0));
  const data = (JSON.parse(held.out.toString()) as { data: Record<string, unknown> }).data;
  return {
    donor: modelLadder(await events(join(home, "runs", donorRun, "record.jsonl"))),
    resumed: modelLadder(await events(join(home, "runs", String(data["run"]), "record.jsonl"))),
  };
}

test("resume inherits the donor's command-rung intelligence", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-intelligence-");
  await assembly(home);
  const donorRun = await donor(home, root, ["--intelligence", "fast"]);
  const ladders = await resumedLadder(home, root, donorRun);
  expect(ladders.donor).toEqual([
    { name: "provider", value: "faux", rung: "command" },
    { name: "model", value: "faux-1", rung: "command" },
    { name: "reasoning", value: "low", rung: "command" },
    { name: "intelligence", value: "fast", rung: "command" },
  ]);
  expect(ladders.resumed).toEqual(ladders.donor);
});

test("resume resolves as before when the donor named no intelligence", async () => {
  const { root, home } = await roots.scratch("bot-run-resume-no-intelligence-");
  await assembly(home);
  const donorRun = await donor(home, root);
  const ladders = await resumedLadder(home, root, donorRun);
  expect(ladders.donor).toEqual([
    { name: "provider", value: "faux", rung: "assembly" },
    { name: "model", value: "faux-1", rung: "assembly" },
    { name: "reasoning", value: "medium", rung: "assembly" },
    { name: "intelligence", value: "default", rung: "assembly" },
  ]);
  expect(ladders.resumed).toEqual(ladders.donor);
});
