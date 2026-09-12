---
flow: build
priority: 6
---
# A stage can report a fault instead of refusing

An agent has one way to stop: `refuse`. The run ends with cause
`refused` and exit 1, and every consumer treats that as a judgment —
the work was examined and rejected, so a person must look at it. The
control tools are `mark`, `refuse`, `continue`, and `select`; none of
them says "nothing is wrong with the work, my environment failed."

So an agent that meets a broken environment has two bad options. It
can refuse, and a transient outage becomes a blocked ticket waiting
on a human. Or it can carry on and certify something it could not
verify, which is worse.

On 2026-08-21 GitHub SSH was unreachable from this machine for about
an hour. factory ticket 0050 was at its verify stage and refused,
correctly and for the honest reason: `git fetch origin` failed, so it
could not certify a freshly rebased candidate. Nothing was wrong with
the ticket, the design, or the code. The outage ended on its own, and
the ticket sat blocked until an operator returned it to ready by hand.

The distinction already exists everywhere else. A run whose cause is
`fault` with exit 2 is retried with a backoff; a run whose cause is
`refused` with exit 1 blocks the ticket. Container branches already
report `cause: "fault"`. Only the agent cannot reach that outcome.

Done, observably: an agent can end its stage by reporting a fault
with a reason, and the run ends with the cause and exit that mean a
transient failure rather than a judgment. The reason travels the same
way a refusal's reason does, so a reader sees what failed. Refusing
still means what it means today, and a stage that faults spends no
more of its own retries than a stage that refuses.

The hard choice to settle: whether this is a new control tool or an
argument to the existing one. A separate tool keeps each word
meaning one thing and cannot be given by accident; an argument keeps
one stopping verb for an agent to remember. Say which and why.
Either way the prompt-side guidance — when a stage should fault
rather than refuse — is not this ticket's to write.

Consumers: the sdlc assembly consumes this, because a stage's
instructions must tell an agent when to use it, and the factory
already handles both outcomes and needs no change. The sdlc-side
adoption is a separate ticket filed after this one is deployed, not
alongside it: its proof cannot pass against the bot that is deployed
today, and the suite it would change is what gates the deploy.

## Deferred proofs

- The assembly-side proof that a stage's instructions tell an agent when to fault rather than refuse. It cannot pass against the bot deployed today, because the control does not exist there, and the suite it changes is what gates that deploy. Carried by **sdlc 0142**, "A stage is told when to fault rather than refuse", which is filed and held until this ticket lands and the bot on PATH is redeployed.

Design leaves that proof unauthored and design review may not refuse for its absence. Nothing else is deferred.

## The behavior this replaces (2026-08-22)

If the design settles the hard choice above as a new control tool, then the
set of control tools an agent is offered is changing, and that is deliberate.
The shipped suite enumerates that set exactly — this ticket's own opening
paragraph recites the four current names as fact, and assertions elsewhere
assert the whole list rather than membership. Those enumerations are the
behavior this ticket replaces. A reviewer meeting a restated list that now
carries a fifth name should read it as intended, not as a weakened guarantee,
provided the four existing tools keep the meanings they have today.

Nothing about the four existing tools changes: same names, same arguments,
same effects, same exit codes. Only the set they belong to grows.

The second attempt (2026-08-22) refused at the code stage on exactly this:
the design required the new tool to be exposed while unfiltered exact-list
assertions required it to be absent, and code may not change an assertion.
The design was not wrong to add the tool; the ticket had not said the list
was growing. It says so now.

If instead the design settles the choice as an argument to the existing
`refuse` tool, no list changes and this section does not apply.
