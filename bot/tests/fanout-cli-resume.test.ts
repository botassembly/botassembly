import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function fanoutAssembly(home: string): Promise<void> {
  const root = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(root, "flows/main/01-plan"), { recursive: true }),
    mkdir(join(root, "flows/main/02-run"), { recursive: true }),
    mkdir(join(root, "subflows/worker"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-plan/STAGE.md"), "---\n---\nPlan.\n"),
    writeFile(join(root, "flows/main/01-plan/schema.json"), '{"type":"object"}\n'),
    writeFile(join(root, "flows/main/02-run/FANOUT.md"), "---\nitems: jobs\nsubflow: worker\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(root, "flows/main/03-finish.md"), "---\n---\nFinish.\n"),
    writeFile(join(root, "subflows/worker/FLOW.md"), "---\ndescription: worker\n---\n"),
    writeFile(join(root, "subflows/worker/01-answer.md"), "---\n---\nAnswer.\n"),
  ]);
}

async function invoke(home: string, root: string, argv: string[], responses: ReturnType<typeof fauxAssistantMessage>[]) {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const before = new Set(await runsIn(home).catch(() => []));
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(responses);
  const exit = await main(argv, held);
  const name = (await runsIn(home)).find((candidate) => !before.has(candidate));
  if (name === undefined) throw new Error("CLI did not create a run");
  return { exit, name, stderr };
}

test("CLI resume reruns every FANOUT item from the retained predecessor", async () => {
  const { root, home } = await roots.scratch("bot-fanout-resume-");
  await fanoutAssembly(home);
  const donor = await invoke(home, root, ["run", "start", "review/main", "--retries", "0", "request"], [
    writes("$OUTPUT", '{"jobs":[{"id":"only","input":{}}]}'), fauxAssistantMessage("done"),
    fauxAssistantMessage([fauxToolCall("fault", { reason: "retry the fan-out" })], { stopReason: "toolUse" }),
  ]);
  expect(donor.exit, Buffer.concat(donor.stderr).toString()).toBe(2);

  const resumed = await invoke(home, root, ["run", "resume", donor.name], [
    writes("$OUTPUT", "new child output"), fauxAssistantMessage("done"),
    writes("$OUTPUT", "complete"), fauxAssistantMessage("done"),
  ]);
  expect(resumed.exit).toBe(0);
  const record = await events(join(home, "runs", resumed.name, "record.jsonl"));
  expect(record[0]).toMatchObject({ event: "run_start", continued_from: donor.name });
  expect(record.filter(({ event }) => event === "stage_carried").map(({ stage }) => stage)).toEqual(["01-plan"]);
  expect(record.filter(({ event }) => event === "subflow_call")).toEqual([
    expect.objectContaining({ item: "only", started: true, exit: 0, cause: "success" }),
  ]);
  expect(record.find(({ event }) => event === "fanout_done")).toMatchObject({ exit: 0, cause: "success" });
  const finish = record.find(({ event, stage }) => event === "stage_start" && stage === "03-finish");
  const received = finish?.["received"] as Array<{ name: string; path: string; sha256: string }> | undefined;
  expect(received).toHaveLength(1);
  expect(received?.[0]?.name).toBe("only.txt");
  expect(typeof received?.[0]?.sha256).toBe("string");
  const output = received?.[0];
  if (output === undefined) throw new Error("successor received no FANOUT output");
  await expect(readFile(join(home, "runs", resumed.name, output.path), "utf8")).resolves.toBe("new child output");
});
