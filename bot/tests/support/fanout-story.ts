import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { heldRecord } from "../../src/record-lines.ts";
import { compactJson, hashBytes } from "../../src/record.ts";
import { bytewise } from "../../src/model.ts";
import type { Started } from "../flow-harness.ts";

export const recordMutations = ["stage", "retry", "path", "extension", "outcome", "descriptor"] as const;
export type RecordMutation = (typeof recordMutations)[number];

export async function mutateChildRecord(path: string, mutation: RecordMutation): Promise<void> {
  const lines = (await readFile(path, "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const ending = [...lines].reverse().find((line) => line["event"] === "stage_end");
  if (ending === undefined) throw new Error("child record lost its final stage ending");
  const output = ending["output"] as Record<string, unknown>;
  const changes: Record<RecordMutation, () => void> = {
    stage: () => { ending["stage"] = "99-other"; },
    retry: () => { for (const line of lines) if (line["stage"] === "01-answer") line["retry"] = 2; },
    path: () => { output["path"] = "stages/01-answer/1/1/other.txt"; },
    extension: () => { output["path"] = "stages/01-answer/1/1/output.json"; },
    outcome: () => { Object.assign(ending, { exit: 1, cause: "rejected", sealed: false, judged: true }); },
    descriptor: () => { output["sha256"] = "b".repeat(64); },
  };
  changes[mutation]();
  await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}

interface PlanRow { item: string; call: number; request_bytes: number; request_sha256: string }
interface ItemRow {
  item: string; call: number; child: string;
  input: { path: string; sha256: string; bytes: number };
  output: { path: string; sha256: string };
}
interface Job { id: string; input: Record<string, unknown> }

export const storyMutations = ["manifest-bytes", "manifest-hash", "duplicate-plan", "missing-row", "extra-row", "wrong-row", "wrong-done"] as const;

export function mutateFanoutStory(record: Record<string, unknown>[], mutation: (typeof storyMutations)[number]) {
  const changed = structuredClone(record);
  const start = changed.find(({ event }) => event === "fanout_start");
  const rows = changed.filter(({ event }) => event === "subflow_call");
  const done = changed.find(({ event }) => event === "fanout_done");
  if (start === undefined || rows[0] === undefined || done === undefined) throw new Error("fixture lost its FANOUT story");
  const first = rows[0], last = rows.at(-1) ?? first;
  const mutate: Record<(typeof storyMutations)[number], () => void> = {
    "manifest-bytes": () => { start["manifest_bytes"] = Number(start["manifest_bytes"]) + 1; },
    "manifest-hash": () => { start["manifest_sha256"] = "b".repeat(64); },
    "duplicate-plan": () => { start["plan"] = [(start["plan"] as unknown[])[0], (start["plan"] as unknown[])[0]]; },
    "missing-row": () => { changed.splice(changed.indexOf(first), 1); },
    "extra-row": () => { changed.splice(changed.indexOf(last), 0, structuredClone(first)); },
    "wrong-row": () => { first["item"] = "other"; },
    "wrong-done": () => { Object.assign(done, { exit: 1, cause: "rejected", selected: "alpha" }); },
  };
  mutate[mutation]();
  return changed;
}

async function expectFanoutItem(runDirectory: string, jobs: Array<{ id: string }>, item: PlanRow, row: ItemRow): Promise<void> {
  expect(row).toMatchObject({ item: item.item, call: item.call, started: true, exit: 0, cause: "success" });
  const request = Buffer.from(compactJson(jobs.find(({ id }) => id === item.item)));
  expect(item).toMatchObject({ request_bytes: request.length, request_sha256: hashBytes(request) });
  expect(row.input).toMatchObject({ bytes: request.length, sha256: hashBytes(request) });
  expect(await readFile(join(runDirectory, ...row.input.path.split("/")))).toEqual(request);
  const child = await heldRecord(join(runDirectory, ...row.child.split("/")));
  expect(child).toMatchObject({ classification: "valid" });
  expect(child?.events[0]?.["request"]).toMatchObject({ sha256: item.request_sha256, bytes: item.request_bytes });
  const ending = [...(child?.events ?? [])].reverse().find((event) => event["event"] === "stage_end");
  const output = ending?.["output"] as { path: string; sha256: string } | undefined;
  expect(row.output).toEqual({ path: `${row.child}/${output?.path ?? ""}`, sha256: output?.sha256 });
  expect(hashBytes(await readFile(join(runDirectory, ...row.output.path.split("/"))))).toBe(row.output.sha256);
}

export async function expectFanoutStory(run: Started, record: Record<string, unknown>[]): Promise<void> {
  const starts = record.filter(({ event }) => event === "fanout_start");
  expect(starts).toHaveLength(1);
  const start = starts[0];
  if (start === undefined) throw new Error("record lost fanout_start");
  const received = start["received"] as { path: string; sha256: string };
  const manifest = await readFile(join(run.writer.writer.runDirectory, ...received.path.split("/")));
  expect(hashBytes(manifest)).toBe(received.sha256);
  expect(start).toMatchObject({ manifest_bytes: manifest.length, manifest_sha256: hashBytes(manifest) });
  const rows = record.filter(({ event, via, stage }) => event === "subflow_call" && via === "fanout" && stage === start["stage"]);
  const plan = start["plan"] as PlanRow[];
  const jobs = (JSON.parse(manifest.toString()) as { jobs: Job[] }).jobs.sort((left, right) => bytewise(left.id, right.id));
  expect(plan.map(({ item, call }) => ({ item, call }))).toEqual(jobs.map(({ id }, index) => ({ item: id, call: index + 1 })));
  expect(new Set(plan.map(({ item }) => item)).size).toBe(plan.length);
  expect(rows).toHaveLength(plan.length);
  for (const [index, item] of plan.entries()) {
    const row = rows[index];
    if (row === undefined) throw new Error(`record lost FANOUT item ${item.item}`);
    await expectFanoutItem(run.writer.writer.runDirectory, jobs, item, row as unknown as ItemRow);
  }
  const done = record.filter(({ event, stage }) => event === "fanout_done" && stage === start["stage"]);
  expect(done).toEqual([expect.objectContaining({ exit: 0, cause: "success" })]);
  expect(done[0]).not.toHaveProperty("selected");
  const successor = record.find(({ event, stage }) => event === "stage_start" && stage === "03-finish");
  expect(successor?.["received"]).toEqual(rows.map(({ item, output }) => ({ name: `${String(item)}.txt`, ...(output as object) })));
}
