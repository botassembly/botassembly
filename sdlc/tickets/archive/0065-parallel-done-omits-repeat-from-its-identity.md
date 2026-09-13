---
flow: build
priority: 3
---
# parallel_done omits repeat from its identity

Promoted 2026-08-21 from
`sdlc/issues/0065-parallel-done-omits-repeat-from-its-identity.md`
(filed by the 2026-08-19 code review, adversarially verified;
re-verified against today's code at triage — still live. Priority
low because the reader-side harm is already closed; what remains is
the record's own consistency).

`runParallel` writes `parallel_done` with the identity
`{ stage, retry: 1 }` and no `repeat`
(`bot/src/containers.ts:98-101`), while every stage event inside a
loop carries its repeat. A `PARALLEL` inside a `LOOP` therefore
records events whose identity cannot say which repeat they ended,
which breaks the record's field discipline in `invariants.md`:
identical event kinds carry the same fields.

Ticket 0052 ruled containers out of resume, so no reader is misled
today. The inconsistency stays in the record, and the next reader
to match on full identity inherits it.

Done, observably: a container event records the same identity
fields a stage event in the same position records, so a
`parallel_done` written inside a loop names its repeat. Whether
`loop_done` needs the same treatment is part of this ticket; say
which way it went and why.
