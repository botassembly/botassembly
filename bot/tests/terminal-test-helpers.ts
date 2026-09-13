import { expect } from "vitest";
import type { ProcessGroups } from "../src/process.ts";
import type { RecordWriter } from "../src/record.ts";

export function latch(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export function controlledGroups(cleanups: Array<() => Promise<void>>): ProcessGroups & { calls: number } {
  return {
    calls: 0,
    reserve: () => Promise.resolve({}),
    track: () => undefined,
    publish: () => Promise.resolve(),
    settle: () => Promise.resolve(),
    terminate() {
      const cleanup = cleanups[this.calls] ?? cleanups.at(-1) ?? (() => Promise.resolve());
      this.calls += 1;
      return cleanup();
    },
  };
}

export function delegates(writer: RecordWriter, append: RecordWriter["append"]): RecordWriter {
  return { ...writer, append };
}

export function machinery() {
  let reject = (_reason: unknown): void => undefined;
  const compromised = new Promise<never>((_resolve, failed) => { reject = failed; });
  let open = true;
  let held: { reason: unknown } | undefined;
  return {
    compromised,
    stop: {
      failure: () => held,
      close() { open = false; return held; },
    },
    fail(reason: unknown) { if (open) held ??= { reason }; reject(reason); },
  };
}

export function expectLockFault(result: Promise<unknown>): Promise<void> {
  return expect(result).resolves.toMatchObject({ exit: 2, cause: "fault", reason: "root lock compromised" });
}
