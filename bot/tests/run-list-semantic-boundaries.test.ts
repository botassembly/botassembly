import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapping } from "../src/model.ts";
import { runStartEvent } from "../src/record-events.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
const HASH = "a".repeat(64);
const REQUEST = { path: "request.txt", sha256: HASH, bytes: 0, via: "argument" };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected a JSON object.");
  return value;
}

function child(value: Record<string, unknown>, name: string): Record<string, unknown> {
  const held = value[name];
  if (!mapping(held)) throw new Error(`Expected ${name} object.`);
  return held;
}

function changedCursor(raw: string, change: (value: Record<string, unknown>) => void): string {
  const value = object(Buffer.from(raw, "base64url").toString("utf8"));
  change(value);
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-list-boundaries-"));
  roots.push(root);
  const held = join(root, "home");
  await mkdir(join(held, "runs"), { recursive: true });
  return held;
}

async function started(where: string, run: string, assembly = "review", flow = "main"): Promise<void> {
  const directory = join(where, "runs", run);
  await mkdir(directory);
  await writeFile(join(directory, "record.jsonl"), currentRecord([runStartEvent({
    ts: "2026-09-05T12:10:00.000Z", run, assembly, assemblyHash: HASH, flow, request: REQUEST,
  })]));
}

test("cursor semantic faults win over a simultaneous membership conflict", async () => {
  const where = await home();
  await started(where, "run-b");
  await started(where, "run-a");
  const page = object((await invokeCli(["run", "list", "--limit", "1", "-j"], { home: where })).out);
  const original = String(child(page, "page")["next"]);
  await mkdir(join(where, "runs", "run-0"));
  const invalid = [
    changedCursor(original, (value) => { value["homeHash"] = "A".repeat(64); }),
    changedCursor(original, (value) => { value["membership"] = "A".repeat(64); }),
    changedCursor(original, (value) => { child(value, "filters")["causes"] = ["not-a-cause"]; }),
    changedCursor(original, (value) => { child(value, "filters")["states"] = ["not-a-state"]; }),
    changedCursor(original, (value) => { child(value, "filters")["assemblies"] = ["b", "a"]; }),
    changedCursor(original, (value) => { child(value, "filters")["flows"] = ["same", "same"]; }),
    changedCursor(original, (value) => { child(value, "filters")["assemblies"] = ["has\ncontrol"]; }),
    changedCursor(original, (value) => {
      child(value, "filters")["assemblies"] = Array.from({ length: 65 }, (_, index) => `a${String(index).padStart(2, "0")}`);
    }),
    changedCursor(original, (value) => { child(value, "filters")["assemblies"] = ["x".repeat(2_049)]; }),
    changedCursor(original, (value) => { child(value, "filters")["since"] = 0.5; }),
    changedCursor(original, (value) => { child(value, "filters")["since"] = Number.MAX_SAFE_INTEGER + 1; }),
    changedCursor(original, (value) => { child(value, "filters")["since"] = Date.parse("0100-01-01T00:00:00.000Z") - 1; }),
    changedCursor(original, (value) => { child(value, "filters")["since"] = Date.parse("9999-12-31T23:59:59.999Z") + 1; }),
    changedCursor(original, (value) => {
      child(value, "filters")["since"] = Date.parse("2026-09-06T00:00:00.000Z");
      child(value, "filters")["until"] = Date.parse("2026-09-05T00:00:00.000Z");
    }),
  ];
  for (const held of invalid) {
    const result = await invokeCli(["run", "list", "--after", held, "-j"], { home: where });
    expect(result.code).toBe(2);
    expect(child(object(result.err), "error")).toMatchObject({ code: "cursor-invalid", cause: "cursor-malformed" });
  }
});

test("one row accumulates record and presentation warnings", async () => {
  const where = await home();
  await started(where, "run-torn", "x".repeat(1_100), "<".repeat(600));
  await writeFile(join(where, "runs", "run-torn", "record.jsonl"), `${currentRecord([runStartEvent({
    ts: "2026-09-05T12:10:00.000Z", run: "run-torn", assembly: "x".repeat(1_100), assemblyHash: HASH,
    flow: "<".repeat(600), request: REQUEST,
  })])}{"torn"`);
  const held = object((await invokeCli(["run", "list", "-j"], { home: where })).out);
  expect(child(held, "summary")).toMatchObject({ warningCount: 3, warningsOmitted: 0 });
  expect(held["warnings"]).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "run-torn", code: "crashed" }),
    expect.objectContaining({ id: "run-torn", code: "summary-field-too-large" }),
    expect.objectContaining({ id: "run-torn", code: "cell-truncated" }),
  ]));
});
