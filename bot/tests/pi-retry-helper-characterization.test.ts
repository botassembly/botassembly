import { retryAssistantCall, type AssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";

function providerFailure(inputTokens: number): AssistantMessage {
  return {
    role: "assistant", content: [], api: "test", provider: "test", model: "test",
    stopReason: "error", errorMessage: "provider overloaded", timestamp: 0,
    usage: {
      input: inputTokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: inputTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

afterEach(() => { vi.useRealTimers(); });

test("pinned Pi retries a transient token-spending response with exponential global timers", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const scheduled: Array<{ attempt: number; maximum: number; delay: number }> = [];
  let calls = 0;
  const result = retryAssistantCall(
    () => { calls += 1; return Promise.resolve(providerFailure(1)); },
    { enabled: true, maxRetries: 2, baseDelayMs: 2 },
    undefined,
    { onRetryScheduled: (attempt, maximum, delay) => { scheduled.push({ attempt, maximum, delay }); } },
  );

  await vi.runAllTimersAsync();
  expect((await result).errorMessage).toBe("provider overloaded");
  expect(calls).toBe(3);
  expect(scheduled).toEqual([
    { attempt: 1, maximum: 2, delay: 2 },
    { attempt: 2, maximum: 2, delay: 4 },
  ]);
});

test("pinned Pi turns a backoff abort into an aborted message", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await retryAssistantCall(
    () => { calls += 1; return Promise.resolve(providerFailure(0)); },
    { enabled: true, maxRetries: 2, baseDelayMs: 10_000 },
    controller.signal,
    { onRetryScheduled: () => { controller.abort(); } },
  );

  expect(calls).toBe(1);
  expect(result).toMatchObject({ stopReason: "aborted" });
  expect(result).not.toHaveProperty("errorMessage");
});
