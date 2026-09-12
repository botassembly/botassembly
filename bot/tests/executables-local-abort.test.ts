import { expect, test } from "vitest";
import type { GatingInput, WorkConfig } from "../src/attempt.ts";
import { runGate, runHook } from "../src/executables.ts";
import type { Executable } from "../src/process.ts";

const command: Executable = { path: "/must/not/start", file: "flows/main/01-work/gate.sh", sha256: "a".repeat(64) };
const config: WorkConfig = {
  timeoutMs: 1, retries: 0, cwd: "/must/not/read", env: {}, session: "session.jsonl", received: [], options: [],
  outputPath: "/must/not/read/output.txt", outputExtension: "txt", hooks: { failure: command },
};

function aborted(exit: number | undefined): GatingInput {
  const controller = new AbortController();
  controller.abort();
  return {
    signal: {
      abort: controller.signal, exit: () => exit,
      fault: () => ({ reason: new Error("child run lock was compromised") }),
    },
  } as GatingInput;
}

test("an already locally aborted gate and hook report the child machinery fault", async () => {
  const input = aborted(undefined);
  const expected = { status: "terminal", exit: 2, cause: "fault", reason: "child run lock was compromised" };
  await expect(runGate(input, config, command)).resolves.toMatchObject(expected);
  await expect(runHook(input, config, "failure")).resolves.toMatchObject(expected);
});

test("an already externally aborted command keeps the root signal result", async () => {
  await expect(runHook(aborted(143), config, "failure")).resolves.toMatchObject({
    status: "terminal", exit: 143, cause: "signal", reason: "Execution was aborted.",
  });
});
