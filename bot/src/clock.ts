import type { DriverClock } from "./process.ts";

export interface PausableClock extends DriverClock {
  pause(): void;
  resume(): void;
}

// UNSTATED LOAD-BEARING INVARIANT, now stated (C6): pause/resume is
// single-depth — no counter, no nesting — and that is safe only because every
// tool is `executionMode: "sequential"`, so at most one subflow batch can hold
// the clock paused at a time. A concurrent tool mode would need a depth count.

export function createAgentClock(base: DriverClock): PausableClock {
  let elapsed = 0;
  let started = 0;
  let remaining = 0;
  let callback: (() => void) | undefined;
  let timer: unknown;
  let running = false;
  let paused = false;

  const consume = (): void => {
    const delta = Math.max(0, base.milliseconds() - started);
    elapsed += delta;
    remaining = Math.max(0, remaining - delta);
  };
  const schedule = (): void => {
    started = base.milliseconds();
    timer = base.setTimeout(() => { callback?.(); }, remaining);
  };

  return {
    milliseconds: () => elapsed + (running && !paused ? Math.max(0, base.milliseconds() - started) : 0),
    timestamp: () => base.timestamp(),
    setTimeout(next, milliseconds) {
      callback = next;
      remaining = milliseconds;
      running = true;
      paused = false;
      schedule();
      return next;
    },
    clearTimeout() {
      if (!running) return;
      if (!paused) {
        consume();
        base.clearTimeout(timer);
      }
      running = false;
      paused = false;
      callback = undefined;
    },
    pause() {
      if (!running || paused) return;
      consume();
      base.clearTimeout(timer);
      paused = true;
    },
    resume() {
      if (!running || !paused) return;
      paused = false;
      schedule();
    },
  };
}
