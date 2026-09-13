import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { OrdinaryOutput, deliveryExitCode, stdoutDeliveryDiagnostic } from "../src/process-output.ts";

test("ordinary output preserves order and waits for delayed callbacks", async () => {
  const delivered: string[] = [];
  let release: (() => void) | undefined;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      delivered.push(chunk.toString());
      if (delivered.length === 1) release = done;
      else done();
    },
  });
  const output = new OrdinaryOutput(sink);
  output.write("first");
  output.write("second");
  let settled = false;
  const result = output.settle().then((failure) => { settled = true; return failure; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(delivered).toEqual(["first"]);
  expect(settled).toBe(false);
  release?.();
  await expect(result).resolves.toBeUndefined();
  expect(delivered).toEqual(["first", "second"]);
});

test("callback and error-event failure settles once and skips later writes", async () => {
  let attempts = 0;
  let release: ((reason?: Error | null) => void) | undefined;
  const failure = Object.assign(new Error("full"), { code: "ENOSPC" });
  const sink = new Writable({
    write(_chunk, _encoding, done) {
      attempts += 1;
      release = done;
    },
  });
  const output = new OrdinaryOutput(sink);
  output.write("first");
  output.write("second");
  output.write("third");
  const settlements = [output.settle(), output.settle()];
  expect(attempts).toBe(1);
  release?.(failure);
  await expect(Promise.all(settlements)).resolves.toEqual([failure, failure]);
  expect(attempts).toBe(1);
});

test("ordinary output keeps ownership through a delayed destroy error after the write callback", async () => {
  const failure = Object.assign(new Error("late full"), { code: "ENOSPC" });
  const sink = new Writable({
    write(_chunk, _encoding, done) { done(failure); },
    destroy(error, done) { setTimeout(() => { done(error); }, 10); },
  });
  const before = sink.listenerCount("error");
  const output = new OrdinaryOutput(sink);
  output.write("bytes");
  await expect(output.settle()).resolves.toBe(failure);
  expect(sink.listenerCount("error")).toBe(before + 1);
  await new Promise<void>((resolve) => { sink.once("close", resolve); });
});

test("delivery outcomes preserve command status and publish only inert non-pipe detail", () => {
  const pipe = Object.assign(new Error("closed"), { code: "EPIPE" });
  const full = Object.assign(new Error("full"), { code: "ENOSPC" });
  const hostile = Object.assign(new Error("hostile"), { code: "EIO\npaint" });
  expect([deliveryExitCode(0, undefined), deliveryExitCode(0, pipe), deliveryExitCode(0, full)]).toEqual([0, 0, 1]);
  expect([deliveryExitCode(1, pipe), deliveryExitCode(2, full), deliveryExitCode(143, full)]).toEqual([1, 2, 143]);
  expect(stdoutDeliveryDiagnostic(full)).toBe("Bot failed during stdout delivery (ENOSPC).\n");
  expect(stdoutDeliveryDiagnostic(hostile)).toBe("Bot failed during stdout delivery.\n");
});
