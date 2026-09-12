---
flow: build
priority: 6
---
# A run that dies still seals its record

Live case, 2026-08-16: run `2026-08-16T16-38-14-2a53` ended with
exit 2 and `Agent run failed and failure reporting failed` on
stderr — the agent harness inside the stage died — but the run's
`record.jsonl` simply stops at the last turn event. No terminal
event, no cause, no exit. The layer above read the unsealed record,
could only say `cause=unreadable`, and its own fault display had
nothing to show; the operator reconstructed what happened from
stderr scraps and the record's silence.

Every exit path bot can control writes a terminal record event
before the process ends: normal completion (as today), a stage
fault, a provider harness that throws or dies, and bot's own
unhandled errors. The terminal event names what is known at that
moment — the stage, the cause, the exit code it is about to use,
and the error's message when there is one. Only a death bot cannot
intercept (SIGKILL, power loss) may leave a record unsealed; a
process that lives long enough to print to stderr lives long
enough to seal. The record stays append-only JSONL; readers that
already understand the existing terminal event learn nothing new
unless the design finds the existing shape cannot carry a fault,
and the sealed-assembly and output semantics are unchanged.

Done means a stage whose agent harness is made to fail leaves a
record whose last line is a terminal event carrying the fault, and
`bot show` on that run reports the ending instead of trailing off
mid-turn.

Named for restatement in `design:`/`design-review:` commits: none
expected — existing record assertions keep full strength; new
failure-path cases land beside the existing record tests.

## Refusal addendum, 2026-08-16 (architect)

The review refused rightly: sealing every controlled exit changes
what existing ending-shape assertions may observe. Restatement is
authorized by name in `bot/tests/honest-endings.test.ts` and
`bot/tests/typed-library-faults.test.ts` — assertions about how a
failing run's record ends may restate to the sealed form; the
principles they protect (endings are honest, faults are typed)
keep full strength.
