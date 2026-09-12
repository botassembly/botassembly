import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorCode, OWNER_ONLY } from "./model.ts";

export interface DriverClock {
  milliseconds(): number;
  timestamp(): string;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface Executable {
  path: string;
  file: string;
  sha256: string;
}

export interface ProcessResult {
  exit: number | null;
  output: Buffer;
  timedOut: boolean;
  aborted: boolean;
  overflowed: boolean;
  captureIncomplete: boolean;
  error?: Error;
}

/** Ian's ruling, 2026-08-05: 16 MiB of stdout and stderr together, per child.
 *  runtime.md captures a child's output as bytes; this bounds that capture. No
 *  configuration, like the 250 ms grace period below it (CHECKLIST 2). */
export const CHILD_OUTPUT_MAX = 16 * 1024 * 1024;

interface ProcessGroupReservation {
  file?: string;
  pid?: number;
  published?: Promise<void>;
  settlement?: Promise<void>;
}

export interface ProcessGroups {
  reserve(): Promise<ProcessGroupReservation>;
  track(pid: number, reservation?: ProcessGroupReservation): void;
  publish(reservation: ProcessGroupReservation, pid?: number): Promise<void>;
  settle(reservation: ProcessGroupReservation, terminate?: boolean): Promise<void>;
  terminate(): Promise<void>;
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error: unknown) {
    if (errorCode(error) !== "ESRCH") throw error;
  }
}

export function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === "ESRCH") return false;
    throw error;
  }
}

function removeEvidence(file: string): Promise<void> {
  return unlink(file).then(
    () => undefined,
    (reason: unknown) => errorCode(reason) === "ENOENT" ? undefined : Promise.reject(reason instanceof Error ? reason : new Error("Process-group evidence could not be removed.", { cause: reason })),
  );
}

export function createProcessGroups(clock: DriverClock, runDirectory?: string): ProcessGroups {
  const groups = new Map<number, ProcessGroupReservation>();
  const evidence = runDirectory === undefined ? undefined : join(runDirectory, "process-groups");
  let pending: Promise<void> | undefined;

  const reserve = async (): Promise<ProcessGroupReservation> => {
    if (evidence === undefined) return {};
    await mkdir(evidence, { recursive: true, mode: OWNER_ONLY });
    const file = join(evidence, `group-${randomUUID()}`);
    // This reservation reaches disk before spawn. A SIGKILL during publication
    // leaves it unreadable as a PID, which busy deliberately treats as owned.
    await writeFile(file, "pending\n", { encoding: "utf8", flag: "wx", mode: OWNER_ONLY });
    return { file };
  };
  const track = (pid: number, reservation: ProcessGroupReservation = {}): void => {
    reservation.pid = pid;
    groups.set(pid, reservation);
  };
  const publish = (reservation: ProcessGroupReservation, pid?: number): Promise<void> => {
    if (reservation.file === undefined || pid === undefined) return Promise.resolve();
    const published = writeFile(reservation.file, `${String(pid)}\n`, "utf8");
    reservation.published = published;
    return published;
  };
  const finish = async (reservation: ProcessGroupReservation): Promise<void> => {
    await reservation.published;
    if (reservation.file !== undefined) await removeEvidence(reservation.file);
    if (reservation.pid !== undefined) groups.delete(reservation.pid);
  };
  const sweep = (reservation: ProcessGroupReservation): Promise<void> => new Promise((resolve, reject) => {
    if (reservation.pid !== undefined) killGroup(reservation.pid, "SIGTERM");
    clock.setTimeout(() => {
      try {
        if (reservation.pid !== undefined) killGroup(reservation.pid, "SIGKILL");
        void finish(reservation).then(resolve, (reason: unknown) => {
          reject(reason instanceof Error ? reason : new Error("Process-group evidence could not be removed.", { cause: reason }));
        });
      } catch (reason: unknown) {
        reject(reason instanceof Error ? reason : new Error("Process group could not be killed.", { cause: reason }));
      }
    }, 250);
  });
  const settle = (reservation: ProcessGroupReservation, terminate = false): Promise<void> => {
    if (reservation.settlement !== undefined) return reservation.settlement;
    let settlement: Promise<void>;
    try {
      const mustTerminate = reservation.pid !== undefined && (terminate || processGroupExists(reservation.pid));
      settlement = mustTerminate ? sweep(reservation) : finish(reservation);
    } catch (reason: unknown) {
      settlement = Promise.reject(reason instanceof Error ? reason : new Error("Process group could not be inspected.", { cause: reason }));
    }
    reservation.settlement = settlement;
    void settlement.catch(() => {
      if (reservation.settlement === settlement) delete reservation.settlement;
    });
    return settlement;
  };

  return {
    reserve,
    track,
    publish,
    settle,
    terminate() {
      // Memoized only while a sweep is in flight (A8): once it resolves, a
      // later call sweeps groups tracked after the first activation.
      if (pending !== undefined) return pending;
      if (groups.size === 0) return Promise.resolve();
      pending = Promise.all([...groups.values()].map((reservation) => settle(reservation, true)))
        .then(() => undefined)
        .finally(() => { pending = undefined; });
      return pending;
    },
  };
}

export async function runProcess(input: {
  // Only the path is spawned; a caller that hashes what it runs passes the
  // whole Executable, and the installer's `git` — resolved on the injected
  // PATH by the spawn itself — passes just the name (management.ts).
  executable: Executable | { path: string };
  args?: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  clock: DriverClock;
  signal?: AbortSignal;
  groups?: ProcessGroups;
}): Promise<ProcessResult> {
  const groups = input.groups ?? createProcessGroups(input.clock);
  // The durable reservation closes spawn-to-publication: do not start a child
  // until a later reader has a fail-closed entry for its possible group.
  const reservation = await groups.reserve();
  return new Promise((resolve) => {
    const child = spawn(input.executable.path, input.args ?? [], {
      cwd: input.cwd,
      env: input.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let held = 0;
    let timedOut = false;
    let aborted = false;
    let overflowed = false;
    let processError: Error | undefined;
    let directExit: number | null = null;
    let directEnded = false;
    let settled = false;
    let captureIncomplete = false;
    let quietTimer: unknown;
    let absoluteDrainTimer: unknown;
    let groupSettlement: Promise<void> | undefined;
    if (child.pid !== undefined) groups.track(child.pid, reservation);
    const published = groups.publish(reservation, child.pid);
    void published.then(undefined, (reason: unknown) => {
      processError = reason instanceof Error ? reason : new Error("Child process-group evidence could not be published.", { cause: reason });
      terminate();
    });
    const terminate = (): void => {
      groupSettlement ??= groups.settle(reservation, true);
      void groupSettlement.then(undefined, (reason: unknown) => {
        processError ??= reason instanceof Error ? reason : new Error("Child process group could not be terminated.", { cause: reason });
        directEnd(null);
      });
    };
    const timeout = input.clock.setTimeout(() => { timedOut = true; terminate(); }, input.timeoutMs);
    const onAbort = (): void => { aborted = true; terminate(); };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted === true) onAbort();
    // One count over both streams — the ceiling is on what the child said, not
    // on which pipe — and the crossing chunk is cut at it, so the capture holds
    // the first CHILD_OUTPUT_MAX bytes exactly and nothing after the kill.
    const receive = (chunk: Buffer): void => {
      if (settled || overflowed) return;
      held += chunk.length;
      overflowed = held > CHILD_OUTPUT_MAX;
      chunks.push(overflowed ? chunk.subarray(0, chunk.length - (held - CHILD_OUTPUT_MAX)) : chunk);
      if (overflowed) terminate();
      if (directEnded) {
        if (quietTimer !== undefined) input.clock.clearTimeout(quietTimer);
        quietTimer = input.clock.setTimeout(() => { finishCapture(true); }, 1_000);
      }
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    const settle = (): void => {
      input.clock.clearTimeout(timeout);
      if (quietTimer !== undefined) input.clock.clearTimeout(quietTimer);
      if (absoluteDrainTimer !== undefined) input.clock.clearTimeout(absoluteDrainTimer);
      input.signal?.removeEventListener("abort", onAbort);
      const released = groupSettlement ?? groups.settle(reservation);
      void Promise.allSettled([published, released]).then((barriers) => {
        const failed = barriers.find((barrier) => barrier.status === "rejected");
        const error = processError ?? (failed?.status === "rejected"
          ? failed.reason instanceof Error ? failed.reason : new Error("Child process-group evidence could not be released.", { cause: failed.reason })
          : undefined);
        resolve({
          exit: directExit,
          output: Buffer.concat(chunks),
          timedOut,
          aborted,
          overflowed,
          captureIncomplete,
          ...(error === undefined ? {} : { error }),
        });
      });
    };
    function finishCapture(incomplete: boolean): void {
      if (settled) return;
      settled = true;
      captureIncomplete = incomplete;
      if (incomplete) {
        child.stdout.destroy();
        child.stderr.destroy();
      }
      settle();
    }
    function directEnd(exit: number | null): void {
      if (directEnded) return;
      directEnded = true;
      directExit = exit;
      input.clock.clearTimeout(timeout);
      quietTimer = input.clock.setTimeout(() => { finishCapture(true); }, 1_000);
      absoluteDrainTimer = input.clock.setTimeout(() => { finishCapture(true); }, 5_000);
    }
    child.on("error", (error) => { processError = error; directEnd(null); });
    child.on("exit", directEnd);
    // A natural close proves that every inherited output descriptor closed.
    child.on("close", (exit) => { directEnd(exit); finishCapture(false); });
  });
}
