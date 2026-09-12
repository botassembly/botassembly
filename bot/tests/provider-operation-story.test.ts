import { expect, test } from "vitest";
import { providerStartEvent, turnEvent } from "../src/record-events.ts";
import { providerOperationStoryShape } from "./support/record-event-shape.ts";

const TS = "2026-09-06T10:00:00.000Z";
const identity = { stage: "01-work", retry: 1 };

test("the writer oracle pairs each completed turn with one earlier logical provider operation", () => {
  const started = providerStartEvent({ ts: TS, identity, provider: "faux", model: "faux-1" });
  const turn = turnEvent({ ts: TS, identity, provider: "faux", model: "faux-1", input: 1, output: 1,
    cacheRead: 0, cacheWrite: 0, total: 2, stop: "stop" });
  expect(providerOperationStoryShape([started])).toBeUndefined();
  expect(providerOperationStoryShape([started, turn])).toBeUndefined();
  expect(providerOperationStoryShape([turn])).toContain("no preceding");
  expect(providerOperationStoryShape([turn, started])).toContain("no preceding");
  expect(providerOperationStoryShape([started, turn, turn])).toContain("no preceding");
  expect(providerOperationStoryShape([started, { ...turn, model: "other" }])).toContain("no preceding");
  expect(providerOperationStoryShape([started, { ...turn, retry: 2 }])).toContain("no preceding");
});
