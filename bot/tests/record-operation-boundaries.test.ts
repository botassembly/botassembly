import { expect, test } from "vitest";
import { judgedRejection, refusedDraft, sealedOutput } from "../src/record-operation.ts";

const HASH = "a".repeat(64);
const output = { path: "stages/01-work/1/1/output.txt", sha256: HASH };

function changed(event: Record<string, unknown>, field: string, value: unknown): Record<string, unknown> {
  return { ...event, [field]: value };
}

test("sealed output requires the exact successful judged disposition", () => {
  const event = { event: "stage_end", stage: "01-work", retry: 1, exit: 0, cause: "success", output, sealed: true, judged: true };
  expect(sealedOutput([event], "01-work")).toEqual(output);
  for (const [field, value] of [["exit", 1], ["cause", "refused"], ["sealed", false], ["judged", false]] as const) {
    expect(sealedOutput([changed(event, field, value)], "01-work"), field).toBeUndefined();
  }
});

test("judged rejection requires an exact rejected or exhausted disposition", () => {
  for (const cause of ["rejected", "exhausted"]) {
    const event = { event: "stage_end", stage: "01-work", retry: 1, exit: 1, cause, output, sealed: false, judged: true };
    expect(judgedRejection([event], "01-work"), cause).toEqual(output);
    for (const [field, value] of [["exit", 0], ["sealed", true], ["judged", false]] as const) {
      expect(judgedRejection([changed(event, field, value)], "01-work"), `${cause}.${field}`).toBeUndefined();
    }
  }
  for (const cause of ["success", "refused", "blocked", "timeout", "fault", "signal"]) {
    const event = { event: "stage_end", stage: "01-work", retry: 1, exit: 1, cause, output, sealed: false, judged: true };
    expect(judgedRejection([event], "01-work"), cause).toBeUndefined();
  }
});

test("draft output requires the exact refused unjudged disposition", () => {
  const event = { event: "stage_end", stage: "01-work", retry: 1, exit: 1, cause: "refused", output, sealed: false, judged: false };
  expect(refusedDraft([event], "01-work")).toEqual(output);
  for (const [field, value] of [["exit", 0], ["cause", "exhausted"], ["sealed", true], ["judged", true]] as const) {
    expect(refusedDraft([changed(event, field, value)], "01-work"), field).toBeUndefined();
  }
});

test("a malformed newest disposition never falls back to an older artifact", () => {
  const sealed = { event: "stage_end", stage: "01-work", retry: 1, exit: 0, cause: "success", output, judged: true };
  expect(sealedOutput([{ ...sealed, sealed: true }, { ...sealed, sealed: false }], "01-work")).toBeUndefined();
  const draft = { event: "stage_end", stage: "01-work", retry: 1, exit: 1, cause: "refused", output, sealed: false };
  expect(refusedDraft([{ ...draft, judged: false }, { ...draft, judged: true }], "01-work")).toBeUndefined();
  const rejected = { event: "stage_end", stage: "01-work", retry: 1, exit: 1, cause: "exhausted", output, sealed: false };
  expect(judgedRejection([{ ...rejected, judged: true }, { ...rejected, judged: false }], "01-work")).toBeUndefined();
});
