---
flow: build
priority: 3
---
# Container and retry events carry their true numbers

Two record events state numbers that are not the facts:

- `parallel_done` is written with identity `{ stage, retry: 1 }`
  and no `repeat` (`bot/src/containers.ts:98`), while every stage
  event inside a loop carries its repeat — a PARALLEL inside a
  LOOP records endings that cannot say which repeat they ended.
  The invariant is that identical event kinds carry the same
  fields.
- `provider_retry` events always carry `retry: 1` whatever the
  attempt (`bot/src/credentials.ts:201`).

Done, observably: a `parallel_done` inside a loop's second repeat
carries `repeat: 2`; the third provider retry in one stage carries
its true attempt number; a reader matching on full identity finds
container endings the way it finds stage endings.

This ticket exists because of
`sdlc/issues/0065-parallel-done-omits-repeat-from-its-identity.md`.

Named for restatement in `design:`/`design-review:` commits: any
shipped assertion pinning the current event shapes may restate by
adding exactly these fields; the record tests are the likely home —
name the file in an addendum if one refuses.

## What the 2026-08-22 quickfix attempt found

Filed as a quickfix and refused at `01-repair` because main was
green — there is no failing assertion to reproduce, so the proof has
to be authored. Reflowed to `build` on 2026-08-22.

That attempt also reported two things worth not rediscovering:
`provider_retry` already records its true attempt number, and it
judged the remaining `PARALLEL`-inside-`LOOP` case invalid under the
current graph rules (loop-nested). Treat both as observations to
verify, not as settled: whether the graph rule should change is a
design question, and the build flow is where it gets decided.
