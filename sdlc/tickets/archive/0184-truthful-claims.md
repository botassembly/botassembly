---
flow: build
priority: 5
---
# The specification claims only what the runtime enforces

An external review of the platform on 2026-08-30 found the
stable specification promising two guarantees the runtime does
not deliver. Both were checked against this repository.

**Access.** Invariant 35 in
`specification/elements/invariants.md` states that tools are
never restricted and an agent gets whatever the runtime has.
Work is under way to let a stage declare an access policy, and a
policy reads as a restriction to anyone who writes one. The
review demonstrated that such a policy does not hold: with a
Git-only policy in force, `git -c alias.leak=!cat ...` read a
file outside the allowed set. Git is one example rather than a
special case. Any permitted executable that can run a
subprocess, expand a template, or follow its own configuration
defeats a policy expressed as a list of allowed commands.

**Durability.** The review reports that a run's terminal record
becomes visible before the final synchronisation completes, so a
consumer can observe a completed run whose tree is incomplete
after a power loss, and that explicit synchronisation covers the
record file rather than the whole run directory.

Required behavior: every guarantee the stable specification
states is one the runtime enforces. Where the runtime enforces
something weaker, the specification says the weaker thing
plainly.

Done, observably:

- Each access and durability claim in the specification is
  checked against the code that implements it, and the claims are
  rewritten to match. An access policy is described as an
  instruction to the agent, not as a boundary that contains it,
  and the specification says plainly that a permitted executable
  can reach outside the policy.
- The durability claim states what survives a process crash and
  what does not, and the specification says which observable
  states can accompany an incomplete run tree.
- Invariant 35 and the reworded access text do not contradict
  each other. Its witness in
  `specification/elements/invariants-witnesses.md` still names a
  test that fails when tools are removed.
- A test or conformance case fails if the reworded claims drift
  from the code again, for at least the bypass family above.
- The change is documentation of existing behavior. No runtime
  behavior changes and the existing suite stays green.

Boundary: the specification's access and durability claims and
their witnesses. Do not change the runtime, the tools, the record
format, or the stage access work in progress. Do not add
enforcement — an enforced policy needs an operating-system
boundary and belongs in its own ticket.
