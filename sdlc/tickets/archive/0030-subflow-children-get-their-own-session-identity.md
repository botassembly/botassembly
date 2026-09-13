---
flow: build
priority: 4
---
# Subflow children get their own session identity

Ticket 0028 keyed provider session identity on `BOT_RUN_ID`, which
`flow.ts` sets to `basename(writer.runDirectory)`. A subflow
child's writer directory ends in `subflows/<call>`, so every
concurrent run's first child gets the same `BOT_RUN_ID` ("1") —
reproducing, one level down, the exact collision 0028 exists to
fix. Found by the 2026-08-12 post-landing review; neither of
0028's tests covers children.

Also close 0028's soft spot: an absent `BOT_RUN_ID` currently
falls back silently (`?? ""`) to the old colliding key. Decide the
behavior — a loud fault is acceptable, silence is not.

## What done looks like

Two concurrent runs each spawning a subflow child with the same
call name produce distinct provider session identities for those
children, pinned by a test alongside
`bot/tests/provider-session-identity.test.ts`. Retry stability
within one child stage attempt still holds. 0028's existing
assertions keep exact strength. The named test file may gain
assertions; `bot/tests/provider-retry.test.ts` may be restated
only where session identity appears. Test content lands in
`design:` commits.
