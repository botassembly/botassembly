// The assembly's own programs — gates and hooks — run as child processes, and
// every one of them is rehashed before it runs, captured after, and read for
// the difference between "the work was rejected" and "the run cannot continue".
import { basename } from "node:path";
import { faultReason } from "./model.ts";
import { CHILD_OUTPUT_MAX, type Executable, type ProcessResult, runProcess } from "./process.ts";
import { gateStartEvent, hashDriftEvent, hookEvent } from "./record-events.ts";
import { rehashExecutable } from "./record.ts";
import type { Cause } from "./spine.ts";
import { absoluteCapture, capture, recordCheck, signalExit, signaled, type RuntimeInput, type WorkConfig } from "./attempt.ts";
import { gateFeedback } from "./gate-feedback.ts";

export type MachineryResult =
  | { status: "passed"; capture: string; exit: number }
  | { status: "rejected"; capture: string; exit: number; message: Buffer }
  | { status: "terminal"; capture?: string; exit: number; cause: Cause; reason: string };

type Kind = "gate" | "before" | "success" | "failure";

function gateCapture(executable: Executable): string {
  // Named for the ENTRY that produced it (record.md), extension and all, so
  // `10-lint.sh` and `10-lint.py` are two gates and two captures.
  const parts = executable.file.split("/");
  return parts.at(-2) === "gate" ? `gate/${basename(executable.file)}.txt` : "gate.txt";
}

function outsideExit(input: RuntimeInput): number | undefined {
  const exit = input.signal?.exit;
  return typeof exit === "function" ? exit() : exit;
}

async function executableReady(input: RuntimeInput, executable: Executable): Promise<boolean> {
  const hash = await rehashExecutable(executable.path, executable.file, executable.sha256);
  if (hash.status === "unchanged") return true;
  await input.writer.append(hashDriftEvent({ ts: input.clock.timestamp(), file: hash.file, expected: hash.expected, actual: hash.actual }));
  return false;
}

function abortedProcess(input: RuntimeInput, path?: string): MachineryResult {
  const local = input.signal?.fault?.();
  const external = outsideExit(input);
  if (local !== undefined && external === undefined) {
    return { status: "terminal", ...(path === undefined ? {} : { capture: path }), exit: 2, cause: "fault", reason: faultReason(local.reason) };
  }
  return { status: "terminal", ...(path === undefined ? {} : { capture: path }), exit: signalExit(input), cause: input.signal === undefined ? "fault" : "signal", reason: "Execution was aborted." };
}

function terminalProcess(input: RuntimeInput, executable: Executable, result: ProcessResult, path: string): MachineryResult | undefined {
  if (result.captureIncomplete) return { status: "terminal", capture: path, exit: 2, cause: "fault", reason: `${executable.file} did not close its captured output after exiting.` };
  // First: the overflow is what terminated the child, and a gate that prints
  // without end is the assembly being wrong, exactly as one that hangs is.
  if (result.overflowed) return { status: "terminal", capture: path, exit: 2, cause: "fault", reason: `${executable.file} wrote past the ${String(CHILD_OUTPUT_MAX / 1024 / 1024)} MiB output ceiling.` };
  if (result.timedOut) return { status: "terminal", capture: path, exit: 2, cause: "timeout", reason: `${executable.file} timed out.` };
  if (result.aborted) return abortedProcess(input, path);
  // A child that never started — the exec bit stripped after the assembly was
  // read — and one the shell refused are one fact to whoever reads the record,
  // so they are one sentence, in the assembly's own words and not in Node's.
  if (result.error !== undefined || result.exit === 126 || result.exit === 127 || result.exit === null) return { status: "terminal", capture: path, exit: 2, cause: "fault", reason: `${executable.file} could not execute.` };
  return undefined;
}

function processOutcome(
  input: RuntimeInput, executable: Executable, result: ProcessResult, path: string, kind: Kind,
): MachineryResult {
  const terminal = terminalProcess(input, executable, result, path);
  if (terminal !== undefined) return terminal;
  if (result.exit === null) throw new TypeError("A non-terminal child process has no exit code.");
  if (result.exit === 0 || kind === "failure") return { status: "passed", capture: path, exit: result.exit };
  if (kind === "gate" && result.exit === 75 && result.output.length > 0) return { status: "terminal", capture: path, exit: 1, cause: "blocked", reason: gateFeedback(result.output).terminal };
  return { status: "rejected", capture: path, exit: result.exit, message: result.output };
}

async function runExecutable(
  input: RuntimeInput, executable: Executable, args: string[], captureName: string, kind: Kind, env: NodeJS.ProcessEnv,
): Promise<MachineryResult> {
  if (signaled(input)) return abortedProcess(input);
  if (!await executableReady(input, executable)) return { status: "terminal", exit: 2, cause: "fault", reason: `Assembly executable changed: ${executable.file}` };
  if (kind === "gate") {
    await input.writer.append(gateStartEvent({
      ts: input.clock.timestamp(), identity: input.identity, file: executable.file, sha256: executable.sha256,
    }));
  }
  const result = await runProcess({
    executable, args, cwd: input.config.cwd, env, timeoutMs: input.config.timeoutMs, clock: input.clock,
    ...(input.signal === undefined ? {} : { signal: input.signal.abort, groups: input.signal.groups }),
  });
  const gate = kind === "gate";
  const record = gate
    ? await recordCheck(input, "gate", captureName, result.output, result.exit, executable)
    : await capture(input.writer, input.identity, `hooks/${captureName}`, result.output);
  const path = gate ? record : absoluteCapture(input, record);
  const outcome = processOutcome(input, executable, result, path, kind);
  if (!gate) {
    await input.writer.append(hookEvent({
      ts: input.clock.timestamp(), identity: input.identity, hook: kind, exit: result.exit, capture: record, sha256: executable.sha256,
    }));
  }
  return outcome;
}

export async function runGate(input: RuntimeInput, config: WorkConfig, gate: Executable): Promise<MachineryResult> {
  return runExecutable(input, gate, [config.outputPath], gateCapture(gate), "gate", config.env);
}

export async function runHook(
  input: RuntimeInput, config: WorkConfig, kind: "before" | "success" | "failure", extraEnv: NodeJS.ProcessEnv = {},
): Promise<MachineryResult | undefined> {
  const hook = config.hooks?.[kind];
  if (hook === undefined) return undefined;
  return runExecutable(input, hook, [], `${kind}.txt`, kind, { ...config.env, ...extraEnv });
}
