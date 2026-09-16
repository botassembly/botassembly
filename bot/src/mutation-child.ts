import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { constants as osConstants } from "node:os";
import { fileURLToPath } from "node:url";
import { errorCode } from "./model.ts";
import type { CommandResult } from "./new-command-result.ts";

export const MUTATION_TERM_GRACE_MS = 1_000;
export const MUTATION_FINAL_SETTLEMENT_MS = 1_000;

type Spawn = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio & { stdio: ["pipe", "pipe", "pipe"] }) => ChildProcessWithoutNullStreams;
type TimerHandle = number | NodeJS.Timeout;
interface MutationChildClock {
  setTimeout(callback: () => void, milliseconds: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
export interface MutationChildSeam { spawn?: Spawn; clock?: MutationChildClock; platform?: NodeJS.Platform }

interface Ending { code: number | null; signal: NodeJS.Signals | null }

function abortError(): DOMException { return new DOMException("The operation was aborted.", "AbortError"); }
function transportError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("The child transport failed with a non-Error value.", { cause: reason });
}

function numericExit(ending: Ending): number {
  if (ending.code !== null) return ending.code;
  const number = ending.signal === null ? undefined : osConstants.signals[ending.signal];
  return 128 + (number ?? 0);
}

/** Run one mutating Bot command in one direct child and return its unrendered streams. */
export function runMutationChild(
  args: readonly string[], cwd: string, suppliedEnv: NodeJS.ProcessEnv,
  options: { stdin?: Uint8Array; signal?: AbortSignal }, seam: MutationChildSeam = {},
): Promise<CommandResult<number>> {
  if (options.signal?.aborted === true) return Promise.reject(abortError());
  const spawn = seam.spawn ?? nodeSpawn;
  const clock = seam.clock ?? { setTimeout, clearTimeout };
  const killSupported = (seam.platform ?? process.platform) === "linux" || (seam.platform ?? process.platform) === "darwin";
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL("./cli.ts", import.meta.url)), ...args], {
      cwd, env: { ...suppliedEnv }, shell: false, stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (reason: unknown) { return Promise.reject(transportError(reason)); }

  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let exit: Ending | undefined, close: Ending | undefined;
    let stdoutEof = false, stdoutClosed = false, stderrEof = false, stderrClosed = false;
    let stdinFinished = false, stdinClosed = false, settled = false, stopping = false, unsignalable = false;
    let failure: Error | undefined, escalated = false;
    let grace: TimerHandle | undefined, final: TimerHandle | undefined;

    const clear = (): void => {
      if (grace !== undefined) clock.clearTimeout(grace);
      if (final !== undefined) clock.clearTimeout(final);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const finishFailure = (): void => {
      if (settled) return;
      settled = true; clear(); reject(failure ?? abortError());
    };
    const complete = (): boolean => exit !== undefined && close !== undefined
      && exit.code === close.code && exit.signal === close.signal
      && stdoutEof && stdoutClosed && stderrEof && stderrClosed && stdinFinished && stdinClosed;
    const inspect = (): void => {
      if (settled || !complete()) return;
      if (stopping && (failure !== undefined || escalated)) { finishFailure(); return; }
      const ending = exit;
      if (ending === undefined) return;
      settled = true; clear(); resolve({ exit: numericExit(ending), stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    };
    const destroyEndpoints = (): void => {
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    };
    const signal = (name: NodeJS.Signals): void => {
      if (exit !== undefined || unsignalable) return;
      try {
        const sent = child.kill(name);
        if (!sent) unsignalable = true;
      } catch (reason: unknown) {
        if (errorCode(reason) === "ESRCH") { unsignalable = true; return; }
        failure ??= transportError(reason);
      }
    };
    const stop = (reason?: Error): void => {
      if (settled || stopping) { failure ??= reason; return; }
      stopping = true; failure = reason;
      signal("SIGTERM");
      grace = clock.setTimeout(() => {
        escalated = killSupported && exit === undefined && !unsignalable;
        if (killSupported) signal("SIGKILL");
        destroyEndpoints();
        final = clock.setTimeout(finishFailure, MUTATION_FINAL_SETTLEMENT_MS);
        inspect();
      }, MUTATION_TERM_GRACE_MS);
      inspect();
    };
    const onAbort = (): void => {
      stop(undefined);
    };

    child.once("error", (reason) => {
      if (exit === undefined && close === undefined) { settled = true; clear(); reject(reason); }
      else stop(reason);
    });
    child.once("exit", (code, signalName) => {
      exit = { code, signal: signalName };
      if (close !== undefined && (close.code !== code || close.signal !== signalName)) stop(new Error("The child exit and close status disagree."));
      inspect();
    });
    child.once("close", (code, signalName) => {
      close = { code, signal: signalName };
      if (exit !== undefined && (exit.code !== code || exit.signal !== signalName)) stop(new Error("The child exit and close status disagree."));
      inspect();
    });
    child.stdout.on("data", (bytes: Buffer) => { stdout.push(Buffer.from(bytes)); });
    child.stderr.on("data", (bytes: Buffer) => { stderr.push(Buffer.from(bytes)); });
    child.stdout.once("end", () => { stdoutEof = true; inspect(); });
    child.stderr.once("end", () => { stderrEof = true; inspect(); });
    child.stdout.once("close", () => { stdoutClosed = true; inspect(); });
    child.stderr.once("close", () => { stderrClosed = true; inspect(); });
    child.stdout.once("error", stop); child.stderr.once("error", stop); child.stdin.once("error", stop);
    child.stdin.once("finish", () => { stdinFinished = true; inspect(); });
    child.stdin.once("close", () => { stdinClosed = true; inspect(); });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdin.end(options.stdin === undefined ? undefined : Buffer.from(options.stdin));
  });
}
