---
flow: build
priority: 5
---
# One call-chain depth bounds all subflow nesting

`depth()` (`bot/src/subflow-runtime.ts:88`) resets to 1 whenever
the called flow's path differs from the current flow's, and the
only nesting bound (`max-depth`) gates self-recursion alone. Two
subflows whose agents call each other recurse without limit: every
hop records depth 1, and nothing else caps the chain — unbounded
child-run spawning until disk, scratch, or tokens run out, while
the record's depth field misreports every call.

The behavior: a subflow call's depth is its position in the whole
call chain from the root run, whatever mixture of flows the chain
passes through, and one bound holds for the chain. What the bound
defaults to, where it is configured, and how `max-depth`'s
existing self-recursion meaning maps onto it are the design
stage's to settle against the specification's descend and subflow
elements — the spec change lands with the code, per this repo's
changelog rule.

Done, observably: subflows A and B calling each other are refused
or blocked at the bound, with the record's depth field stating
each call's true chain position; today's legal nestings within the
bound run unchanged; a corpus or offline case pins whatever part
of the contract `check` can see.

This ticket exists because of
`sdlc/issues/0057-indirect-subflow-recursion-is-unbounded.md`.

Named for restatement in `design:`/`design-review:` commits: the
subflow tests pin depth-1 recording for cross-flow calls —
restatement is authorized in the subflow test files the design
names in its commit, bounded to the depth field's value and the
new bound's refusals; scope isolation and delegation guarantees
keep full strength.
