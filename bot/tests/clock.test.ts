// Ticket 0063 item 13 — `src/clock.ts` was imported by no test at all (0061's
// walk, re-derived by the driver: `grep -rl` over `bot/tests/` returned
// nothing), which left invariant 22's core mechanism unexercised in both
// directions. `createAgentClock` is what makes "a stage's `timeout` covers the
// agent's work across every send-back" true — the spend accumulates instead of
// resetting — and its `pause()`/`resume()` is what makes "time spent in one
// never counts against another" true across a subflow batch
// (`src/subflow-runtime.ts` pauses the parent's clock around the child).
//
// A manual base clock, in the `hostile.ts` idiom: nothing here sleeps, so a
// sixty-second child costs the test nothing and the assertions are exact
// rather than approximate. It moved to `tests/manual-clock.ts` under item 15,
// when `flow.test.ts` needed the same fixture — one extractor, imported.
//
// The assertion source: specification/elements/invariants.md 22 — "Everything
// that runs gets its own clock. A stage's `timeout` covers the agent's work
// across every send-back; every gate and hook starts a fresh budget of the same
// size, and time spent in one never counts against another."
import { expect, test } from "vitest";
import { createAgentClock } from "../src/clock.ts";
import { manualClock as baseClock } from "./manual-clock.ts";

const BUDGET = 5_000;

test("the agent's spend accumulates across send-backs: the second turn gets only what the first left", () => {
  const base = baseClock();
  const agent = createAgentClock(base);
  let expired = 0;

  // Turn one asks for the whole stage budget and gives back most of it.
  const first = agent.setTimeout(() => { expired += 1; }, BUDGET);
  base.advance(3_000);
  expect(agent.milliseconds()).toBe(3_000);
  agent.clearTimeout(first);
  expect(agent.milliseconds()).toBe(3_000);
  expect(base.due()).toEqual([]);

  // Turn two asks for what is left — the subtraction `prompt()` performs. If
  // the spend had reset, this would arm 5,000ms and the stage would get 8.
  agent.setTimeout(() => { expired += 1; }, BUDGET - agent.milliseconds());
  expect(base.due()).toEqual([BUDGET]);
  base.advance(1_999);
  expect(expired).toBe(0);
  base.advance(1);
  expect(expired).toBe(1);
  expect(agent.milliseconds()).toBe(BUDGET);
});

test("a paused clock spends nothing: a long subflow child never lands on its parent's budget", () => {
  const base = baseClock();
  const agent = createAgentClock(base);
  let expired = 0;
  agent.setTimeout(() => { expired += 1; }, 1_000);
  base.advance(400);

  // The subflow batch takes the clock (subflow-runtime.ts), and the child runs
  // for a minute — sixty times the parent's whole remaining budget.
  agent.pause();
  base.advance(60_000);
  expect(agent.milliseconds()).toBe(400);
  expect(expired).toBe(0);
  expect(base.due()).toEqual([]);

  // The parent resumes with exactly the 600ms it had, not a millisecond less.
  agent.resume();
  expect(base.due()).toEqual([61_000]);
  base.advance(599);
  expect(expired).toBe(0);
  base.advance(1);
  expect(expired).toBe(1);
  expect(agent.milliseconds()).toBe(1_000);
});

// clock.ts states this one about itself (C6): pause/resume is single-depth, no
// counter, and that is safe only because every tool is sequential. A repeated
// pause that consumed twice, or a resume that re-armed an unpaused timer, would
// corrupt the budget in opposite directions; neither had a witness.
test("pause and resume are single-depth: repeating either changes nothing", () => {
  const base = baseClock();
  const agent = createAgentClock(base);
  let expired = 0;
  agent.setTimeout(() => { expired += 1; }, 1_000);
  base.advance(100);

  agent.pause();
  agent.pause();
  base.advance(500);
  agent.resume();
  agent.resume();
  expect(agent.milliseconds()).toBe(100);
  expect(base.due()).toEqual([1_500]);

  base.advance(900);
  expect(expired).toBe(1);
  expect(agent.milliseconds()).toBe(1_000);
});

test("a cleared clock keeps its spend and ignores pause and resume afterwards", () => {
  const base = baseClock();
  const agent = createAgentClock(base);
  const handle = agent.setTimeout(() => undefined, 1_000);
  base.advance(250);
  agent.clearTimeout(handle);

  agent.pause();
  base.advance(10_000);
  agent.resume();
  expect(agent.milliseconds()).toBe(250);
  expect(base.due()).toEqual([]);
});
