import { signalEvent } from "./record-events.ts";
import type { RecordWriter } from "./record.ts";
import { createProcessGroups, type DriverClock, type ProcessGroups } from "./process.ts";

type HandledSignal = "SIGHUP" | "SIGINT" | "SIGTERM";

const SIGNALS: Record<HandledSignal, { number: number; exit: number }> = {
  SIGHUP: { number: 1, exit: 129 },
  SIGINT: { number: 2, exit: 130 },
  SIGTERM: { number: 15, exit: 143 },
};

export interface RunSignal {
  abort: AbortSignal;
  groups: ProcessGroups;
  activate(name: HandledSignal): void;
  cancel(): void;
  exitCode(): number | undefined;
  register(writer: RecordWriter): () => void;
  release(writer: RecordWriter, closeAdmission?: () => void): Promise<RunSignalSnapshot>;
  drain(): Promise<RunSignalSnapshot>;
  cleanup(): Promise<RunSignalSnapshot>;
  close(closeAdmission?: () => void): Promise<RunSignalSnapshot>;
  install(): () => void;
}

type Failure = { reason: unknown };
type RunSignalSnapshot = { exit?: number; cleanupFailure?: Failure; recordFailure?: Failure };

export function createRunSignal(clock: DriverClock, runDirectory?: string, ownedGroups?: ProcessGroups): RunSignal {
  const controller = new AbortController();
  const groups = ownedGroups ?? createProcessGroups(clock, runDirectory);
  const writers = new Set<RecordWriter>();
  let held: { name: HandledSignal; ts: string } | undefined;
  let barrier = Promise.resolve();
  let cleanupFailure: Failure | undefined;
  const recordFailures = new Map<RecordWriter, Failure>();
  let open = true;

  const join = (operation: Promise<void>, failed: (reason: unknown) => void): void => {
    const observed = operation.then(undefined, failed);
    barrier = Promise.all([barrier, observed]).then(() => undefined);
  };
  const append = (writer: RecordWriter, fact: { name: HandledSignal; ts: string }): void => {
    const signal = SIGNALS[fact.name];
    const prior = barrier;
    join(prior.then(() => writer.append(signalEvent({ ts: fact.ts, signal: signal.number, name: fact.name }))),
      (reason: unknown) => { if (!recordFailures.has(writer)) recordFailures.set(writer, { reason }); });
  };
  const scheduleCleanup = (): void => {
    join(Promise.resolve().then(() => groups.terminate()),
      (reason: unknown) => { cleanupFailure ??= { reason }; });
  };
  const settle = async (close = false, writer?: RecordWriter, closeAdmission?: () => void): Promise<RunSignalSnapshot> => {
    let observed: Promise<void>;
    do {
      observed = barrier;
      await observed;
    } while (observed !== barrier);
    if (close) open = false;
    closeAdmission?.();
    const settled = snapshot(writer);
    if (writer !== undefined) {
      writers.delete(writer);
      recordFailures.delete(writer);
    }
    return settled;
  };
  const snapshot = (writer?: RecordWriter): RunSignalSnapshot => {
    const recordFailure: Failure | undefined = writer === undefined ? recordFailures.values().next().value : recordFailures.get(writer);
    return {
      ...(held === undefined ? {} : { exit: SIGNALS[held.name].exit }),
      ...(cleanupFailure === undefined ? {} : { cleanupFailure }),
      ...(recordFailure === undefined ? {} : { recordFailure }),
    };
  };
  const cleanup = async (): Promise<RunSignalSnapshot> => {
    scheduleCleanup();
    return settle();
  };
  const cancel = (): void => {
    if (!open) return;
    scheduleCleanup();
    controller.abort();
  };
  const activate = (name: HandledSignal): void => {
    if (!open || held !== undefined) return;
    held = { name, ts: clock.timestamp() };
    for (const writer of writers) append(writer, held);
    cancel();
  };

  return {
    abort: controller.signal,
    groups,
    activate,
    cancel,
    exitCode: () => held === undefined ? undefined : SIGNALS[held.name].exit,
    register(writer) {
      if (!open) return () => undefined;
      writers.add(writer);
      if (held !== undefined) append(writer, held);
      return () => { writers.delete(writer); recordFailures.delete(writer); };
    },
    release: (writer, closeAdmission) => settle(false, writer, closeAdmission),
    drain: () => settle(),
    cleanup,
    close: (closeAdmission) => settle(true, undefined, closeAdmission),
    install() {
      const onHup = (): void => { activate("SIGHUP"); };
      const onInt = (): void => { activate("SIGINT"); };
      const onTerm = (): void => { activate("SIGTERM"); };
      process.on("SIGHUP", onHup);
      process.on("SIGINT", onInt);
      process.on("SIGTERM", onTerm);
      return () => {
        process.removeListener("SIGHUP", onHup);
        process.removeListener("SIGINT", onInt);
        process.removeListener("SIGTERM", onTerm);
      };
    },
  };
}
