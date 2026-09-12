// A `DriverClock` the test drives by hand: time moves only when the test says
// so, and a timer fires only when time reaches it. Nothing here sleeps, so a
// sixty-second budget costs the suite nothing and every assertion is exact
// rather than approximate.
//
// Ticket 0063 item 15. There were TWO of these before this file: one in
// `hostile.ts` (`fire`/`pending`) and one inside `clock.test.ts`
// (`advance`/`due`), with the same twenty lines of timer bookkeeping under
// both. Item 15 needed a third caller, and a third copy of a fixture is how a
// fixture starts disagreeing with itself — the concern CHECKLIST 9 names and
// item 14 of this same ticket was written about. One implementation, both
// control surfaces, imported everywhere.
//
// The two surfaces are genuinely different and both are load-bearing:
//
// - `fire()` runs every pending timer and jumps the clock to the latest due
//   time. The hostile suite wants that: it does not care when a budget expires,
//   only what happens when one does.
// - `advance(ms)` moves time by an exact amount and fires only what that
//   reaches. `flow.test.ts` needs that: advancing a subflow child's 120ms of
//   work must NOT reach the child's own 500ms budget, and MUST reach the
//   parent's 60ms budget if the parent's clock was wrongly left running.
//   `fire()` cannot express either half.
import type { DriverClock } from "../src/process.ts";

export interface ManualClock extends DriverClock {
  /** Move time forward by exactly this much, firing every timer that becomes due. */
  advance(milliseconds: number): void;
  /** Run every pending timer callback, advancing the clock to the latest due time. */
  fire(): void;
  /** The deadlines still armed — what the runtime is waiting on. */
  due(): number[];
  pending(): number;
  /** Time elapsed since this clock started at zero. */
  elapsed(): number;
}

export function manualClock(): ManualClock {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { callback: () => void; due: number }>();
  return {
    milliseconds: () => now,
    timestamp: () => new Date(1_753_000_000_000 + now).toISOString(),
    setTimeout(callback, milliseconds) {
      id += 1;
      timers.set(id, { callback, due: now + milliseconds });
      return id;
    },
    clearTimeout(handle) {
      if (typeof handle === "number") timers.delete(handle);
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const [key, timer] of [...timers]) {
        if (timer.due <= now) { timers.delete(key); timer.callback(); }
      }
    },
    fire() {
      const due = [...timers.values()];
      timers.clear();
      now = due.reduce((latest, timer) => Math.max(latest, timer.due), now);
      for (const timer of due) timer.callback();
    },
    due: () => [...timers.values()].map((timer) => timer.due),
    pending: () => timers.size,
    elapsed: () => now,
  };
}
