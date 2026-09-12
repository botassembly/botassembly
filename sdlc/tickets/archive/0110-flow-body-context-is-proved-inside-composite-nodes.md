---
flow: build
priority: 5
deps: ["0093"]
---
# Flow-body context is proved inside composite nodes

Ticket 0093 makes a `FLOW.md` body part of every stage's prompt,
with the stage's position alongside it, and proves that behavior
where the flow is a flat sequence of stages. It deliberately defers
proving the same promise where a stage sits inside a composite
node — this ticket carries four of those deferred proofs, as
0093's `## Deferred proofs` section names.

Done, observably: the promise 0093 lands — the flow's body text
reaches the stage's prompt, together with a truthful statement of
which stage of how many is running — is witnessed for a stage
positioned inside each of the four composite node kinds: a
container, a parallel node, a choice, and a loop. A flow whose body
is empty stays valid and adds nothing to the prompt in every one of
those positions, exactly as in the flat case.

The hard question this ticket settles in advance: "which stage of
how many" must stay truthful when the position is not a flat index
— inside a parallel or a loop the statement describes the stage's
place in its flow's declared structure, never a fabricated linear
count. The design decides the wording; the requirement is that it
never lies about repetition or concurrency.
