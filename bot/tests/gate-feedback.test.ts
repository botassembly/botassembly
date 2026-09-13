import { Buffer } from "node:buffer";
import { expect, test } from "vitest";
import { gateFeedback, GATE_MODEL_FEEDBACK_MAX, GATE_TERMINAL_FEEDBACK_MAX } from "../src/gate-feedback.ts";

test("short valid UTF-8 gate feedback remains unchanged in both views", () => {
  const raw = Buffer.from("Fix the heading.\n");

  expect(gateFeedback(raw)).toEqual({ model: "Fix the heading.\n", terminal: "Fix the heading.\n" });
});

test("short valid UTF-8 keeps an authored byte-order mark", () => {
  const raw = Buffer.from([0xef, 0xbb, 0xbf, 0x41]);

  expect(Buffer.from(gateFeedback(raw).model)).toEqual(raw);
  expect(Buffer.from(gateFeedback(raw).terminal)).toEqual(raw);
});

test("each view keeps valid UTF-8 unchanged through its exact byte ceiling", () => {
  const model = Buffer.alloc(GATE_MODEL_FEEDBACK_MAX, "m");
  const terminal = Buffer.alloc(GATE_TERMINAL_FEEDBACK_MAX, "t");

  expect(Buffer.from(gateFeedback(model).model)).toEqual(model);
  expect(Buffer.from(gateFeedback(terminal).terminal)).toEqual(terminal);
});

test("oversized gate feedback has deterministic bounded head and tail views", () => {
  const raw = Buffer.from(`${"h".repeat(8_000)}${"t".repeat(8_000)}`);
  const first = gateFeedback(raw);
  const second = gateFeedback(raw);

  expect(second).toEqual(first);
  expect(Buffer.byteLength(first.model)).toBeLessThanOrEqual(GATE_MODEL_FEEDBACK_MAX);
  expect(Buffer.byteLength(first.terminal)).toBeLessThanOrEqual(GATE_TERMINAL_FEEDBACK_MAX);
  for (const view of [first.model, first.terminal]) {
    expect(view).toMatch(/^h+/u);
    expect(view).toMatch(/t+$/u);
    expect(view).toContain("16000 bytes total");
    expect(view).toMatch(/[1-9][0-9]* bytes omitted/u);
    expect(view).toContain("check.capture");
  }
});

test("multibyte gate feedback is cut only between UTF-8 code points", () => {
  const raw = Buffer.from(`${"🙂".repeat(3_000)}center${"界".repeat(3_000)}`);
  const views = gateFeedback(raw);

  expect(Buffer.byteLength(views.model)).toBeLessThanOrEqual(GATE_MODEL_FEEDBACK_MAX);
  expect(Buffer.byteLength(views.terminal)).toBeLessThanOrEqual(GATE_TERMINAL_FEEDBACK_MAX);
  expect(views.model).not.toContain("�");
  expect(views.terminal).not.toContain("�");
  expect(views.model).toMatch(/^🙂/u);
  expect(views.model).toMatch(/界$/u);
  expect(views.terminal).toMatch(/^🙂/u);
  expect(views.terminal).toMatch(/界$/u);
});

test("invalid UTF-8 exposes none of the decoded bytes in either view", () => {
  const raw = Buffer.concat([Buffer.from("SECRET-HEAD"), Buffer.from([0xff]), Buffer.from("SECRET-TAIL")]);
  const views = gateFeedback(raw);

  expect(views.model).toBe(views.terminal);
  expect(views.model).toContain("not valid UTF-8");
  expect(views.model).toContain("check.capture");
  expect(views.model).not.toContain("SECRET");
  expect(views.model).not.toContain("�");
});
