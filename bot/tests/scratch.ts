// Where a stage's scratch really is, for the tests that read it.
//
// Ticket 0067 made the layout below `<scratch>/<run>/` opaque, so nothing can
// spell a stage's scratch path out of the stage's name any more — which is the
// point, and this helper is the shape of the consequence: a reader asks the
// runtime for the directory instead of composing one. What those directories
// are CALLED is pinned in exactly one place, runtime-scratch-opacity.test.ts;
// every other test only needs to find them.
import { join } from "node:path";
import { scratchAttempt, scratchHome, scratchOfRun } from "../src/invocation.ts";

/** One home's whole level of the scratch tree: what its own `bot prune` may
 *  sweep, and what no other home's can reach (ticket 0140). */
export function homeScratch(cacheHome: string, home: string): string {
  return scratchHome(join(cacheHome, "bot", "tmp"), home);
}

/** `cacheHome` is the boundary's XDG_CACHE_HOME (slots.md: `$XDG_CACHE_HOME/bot/tmp`).
 *  Since ticket 0140 the entry is the HOME's as well as the run's, so the home
 *  is asked for here too — and the composition is the runtime's own, for the
 *  same reason the attempt level's is: two spellings that drift leave a test
 *  asserting about a directory no run ever worked in. */
export function scratchRun(cacheHome: string, home: string, run: string): string {
  return scratchOfRun(join(cacheHome, "bot", "tmp"), home, run);
}

/** One stage attempt's scratch, under a run's scratch root or a child's. */
export function attempt(root: string, stage: string, repeat = 1): string {
  return scratchAttempt(root, `${stage}:${String(repeat)}`);
}

/** The scratch root of the child run that `call` started from `stage`. */
export function childRun(root: string, stage: string, call: number, repeat = 1): string {
  return scratchAttempt(root, `${stage}:${String(repeat)}:${String(call)}`);
}
