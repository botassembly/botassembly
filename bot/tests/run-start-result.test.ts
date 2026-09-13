import { expect, test } from "vitest";
import type { StartedRunResult } from "../src/run.ts";
import { renderRunStart } from "../src/run-start.ts";

const HASH = "a".repeat(64);

function result(bytes: Buffer, overrides: Partial<StartedRunResult> = {}): StartedRunResult {
  return {
    exitCode: 0, cause: "success", run: "2026-09-05T20-00-00-a023", startedAt: "2026-09-05T20:00:00.000Z",
    installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8",
    ending: { ts: "2026-09-05T20:00:01.000Z", event: "run_end", exit: 0, cause: "success" },
    output: bytes,
    outputSource: { name: "answer", extension: "txt", diskPath: "/never/read",
      record: { path: "stages/01-work/1/1/output.txt", sha256: HASH } },
    ...overrides,
  };
}

function data(held: ReturnType<typeof renderRunStart>): Record<string, unknown> {
  expect(held.stdout.length).toBeLessThanOrEqual(65_536);
  return (JSON.parse(held.stdout.toString()) as { data: Record<string, unknown> }).data;
}

test("small UTF-8 and binary answers remain lossless", () => {
  const text = data(renderRunStart(result(Buffer.from("hello"))));
  expect(text["installationId"]).toBe("018f2f4a-52f8-4c81-9b35-6ad2acdb70d8");
  expect(text["output"]).toMatchObject({ contentIncluded: true, encoding: "utf8", content: "hello" });
  const binary = data(renderRunStart(result(Buffer.from([0xff, 0x00, 0xfe]))));
  expect(binary["output"]).toMatchObject({ contentIncluded: true, encoding: "base64", content: "/wD+" });
});

test.each([
  ["large", Buffer.alloc(70_000, "x")],
  ["JSON-expanding", Buffer.from('"\\\n'.repeat(20_000))],
])("%s output keeps only its exact descriptor when the complete content cannot fit", (_name, bytes) => {
  const held = data(renderRunStart(result(bytes)));
  expect(held["output"]).toEqual({ path: "stages/01-work/1/1/output.txt", extension: "txt", bytes: bytes.length,
    sha256: HASH, contentIncluded: false });
});

test("reason truncation is explicit and an incomplete record invents no ending", () => {
  const reason = "é".repeat(2_000);
  const incomplete = result(Buffer.alloc(0), { exitCode: 2, cause: "fault", reason });
  delete incomplete.ending; delete incomplete.output; delete incomplete.outputSource;
  const held = data(renderRunStart(incomplete));
  expect(held).toMatchObject({ complete: false, exit: 2, cause: "fault",
    reason: { bytes: Buffer.byteLength(reason), truncated: true } });
  expect(Buffer.byteLength((held["reason"] as { text: string }).text)).toBeLessThanOrEqual(2_048);
  expect(held["endedAt"]).toBeUndefined();
  expect(held["output"]).toBeUndefined();
});

test("a started nonzero run remains a result and preserves its exit", () => {
  const rejected = result(Buffer.alloc(0), {
    exitCode: 1, cause: "rejected", reason: "review rejected it",
    ending: { ts: "2026-09-05T20:00:01.000Z", event: "run_end", stage: "01-work", retry: 2,
      exit: 1, cause: "rejected", reason: "review rejected it" },
    terminalStage: { stage: "01-work", retry: 2 },
  });
  delete rejected.output; delete rejected.outputSource;
  const held = renderRunStart(rejected);
  expect(held.exit).toBe(1);
  expect(held.stderr).toEqual(Buffer.alloc(0));
  expect(data(held)).toMatchObject({ complete: true, exit: 1, cause: "rejected",
    terminalStage: { stage: "01-work", retry: 2 } });
});

test.each([
  ["refused", 1], ["exhausted", 1], ["rejected", 1], ["blocked", 1], ["timeout", 1],
  ["fault", 2], ["signal", 143],
] as const)("a started %s ending stays a result with its recorded exit", (cause, exit) => {
  const ending = { ts: "2026-09-05T20:00:01.000Z", event: "run_end" as const, stage: "01-work", retry: 1,
    exit, cause, reason: `${cause} reason` };
  const held = renderRunStart(result(Buffer.alloc(0), {
    exitCode: exit, cause, reason: ending.reason, ending, terminalStage: { stage: "01-work", retry: 1 },
  }));
  expect(held).toMatchObject({ exit, stderr: Buffer.alloc(0) });
  expect(data(held)).toMatchObject({ complete: true, exit, cause, endedAt: ending.ts,
    reason: { text: ending.reason, truncated: false }, terminalStage: { stage: "01-work", retry: 1 } });
});
