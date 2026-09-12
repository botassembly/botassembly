import { expect, test } from "vitest";
import { logicalSessionEntries, settledSessionLineToolReader } from "../src/session-decoder.ts";
import {
  renderSession, renderSessionEntry, settledSessionToolReader, settledSessionTools,
} from "../src/session.ts";

const FIRST = 1_788_652_800_000;

function messageWrite(
  seq: number, timestamp: number, role: string, content: unknown, messageFields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "entry", seq, timestamp, id: `entry-${String(seq)}`, parentId: seq === 1 ? null : `entry-${String(seq - 1)}`,
    type: "message", message: { role, content, ...messageFields },
  };
}

test("a format-4 transaction decodes each valid entry in order", () => {
  const source = JSON.stringify([
    {
      kind: "entry", seq: 1, timestamp: FIRST, id: "assistant", parentId: null, type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "first" }] },
    },
    { kind: "usage", seq: 2 },
    {
      kind: "entry", seq: 3, timestamp: "not numeric", id: "malformed", parentId: "assistant", type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "omit me" }] },
    },
    {
      kind: "entry", seq: 4, timestamp: FIRST + 1_000, id: "user", parentId: "assistant", type: "message",
      message: { role: "user", content: [{ type: "text", text: "second" }] },
    },
  ]);

  expect(renderSession(source)).toEqual([
    "2026-09-06T00:00:00.000Z  assistant  first",
    "2026-09-06T00:00:01.000Z  user  second",
  ]);
});

test("the decoder normalizes direct format-3 and singleton format-4 entries", () => {
  const legacy = JSON.stringify({
    type: "message", timestamp: "2026-09-06T00:00:00.123Z", message: { role: "user", content: "legacy" },
  });
  const modern = JSON.stringify(messageWrite(1, FIRST, "assistant", "modern"));
  const parsedLegacy: unknown = JSON.parse(legacy);
  const parsedModern: unknown = JSON.parse(modern);

  expect(logicalSessionEntries(legacy)).toEqual([{
    entry: parsedLegacy, timestamp: FIRST + 123, displayTimestamp: "2026-09-06T00:00:00.123Z",
  }]);
  expect(logicalSessionEntries(modern)).toEqual([{
    entry: parsedModern, timestamp: FIRST, displayTimestamp: "2026-09-06T00:00:00.000Z",
  }]);
  expect(renderSessionEntry(legacy)).toBe("2026-09-06T00:00:00.123Z  user  legacy");
  expect(renderSessionEntry(modern)).toBe("2026-09-06T00:00:00.000Z  assistant  modern");
  expect(renderSessionEntry(JSON.stringify([messageWrite(1, FIRST, "user", "transaction")]))).toBeUndefined();
});

test("whole and incremental tool readers settle several calls in one transaction", () => {
  const transaction = JSON.stringify([
    messageWrite(1, FIRST, "assistant", [
      { type: "toolCall", id: "one", name: "read", arguments: { path: "one.txt" } },
      { type: "toolCall", id: "two", name: "bash", arguments: { command: "true" } },
    ]),
    { kind: "value", op: "set", seq: 2, namespace: "lane", key: "state", value: "idle" },
    messageWrite(3, FIRST + 250, "toolResult", [{ type: "text", text: "one" }], {
      toolCallId: "one", toolName: "read", isError: false,
    }),
    messageWrite(4, FIRST + 900, "toolResult", "two", {
      toolCallId: "two", toolName: "bash", isError: true,
    }),
  ]);
  const expected = [
    expect.objectContaining({ name: "read", duration: 250, settledAt: FIRST + 250, resultBytes: 3, failed: false }),
    expect.objectContaining({ name: "bash", duration: 900, settledAt: FIRST + 900, resultBytes: 3, failed: true }),
  ];

  expect(settledSessionTools(transaction, "work")).toEqual(expected);
  const read = settledSessionLineToolReader("work");
  expect(read(JSON.stringify({ v: 4, kind: "header" }))).toEqual([]);
  expect(read(transaction)).toEqual(expected);
});

test("direct tool readers retain one-entry state and do not unpack transactions", () => {
  const read = settledSessionToolReader("work");
  const assistant = JSON.stringify({
    type: "message", timestamp: "2026-09-06T00:00:00.000Z",
    message: { role: "assistant", content: [{ type: "toolCall", id: "call", name: "read", arguments: { path: "a" } }] },
  });
  const result = JSON.stringify({
    type: "message", timestamp: "2026-09-06T00:00:00.010Z",
    message: { role: "toolResult", toolCallId: "call", toolName: "read", isError: false, content: "done" },
  });
  expect(read(assistant)).toBeUndefined();
  expect(read(result)).toEqual(expect.objectContaining({ name: "read", duration: 10 }));
  expect(read(JSON.stringify([messageWrite(1, FIRST, "assistant", [])]))).toBeUndefined();
});
