---
flow: build
priority: 8
---
# A warning turn does not re-run a gate ladder that already passed

When a stage's gate ladder passes and `$TMP` still holds files, the runtime sends the agent one warning turn. The gating loop re-runs the whole ladder after that turn, so every check in the stage executes and records a second time.

`work()` in `bot/src/gating.ts` re-runs `runChecks` after every agent message. `warnForTmp` sends its warning once per run, guarded by `state.sent`, after the ladder has already gone green. The warning asks the agent to move evidence out of `$TMP`; it does not ask for any change that a gate could newly fail on.

Two costs follow.

The stage runs its entire test suite twice. Measured in run `2026-09-01T16-04-39-5c0a`, each pass of the `05-verify` ladder took roughly 110 seconds, and the run recorded 24 distinct checks with every one of them recorded twice. Every warned stage in every repository has been paying that.

The run record then holds two events for each check. They carry the same stage, file, exit, capture path and `sha256`, and differ only in `ts`. Readers of the record that expect one event per check see two. The record specification says one check event per execution, so the record is truthful and the second execution is the thing worth removing.

The behavior is deterministic rather than intermittent. Run `2026-09-01T15-24-32-a3e2` shows an agent that emptied `$TMP` before finishing, took no warning turn, and recorded each `05-verify` check once. Run `5c0a` shows a `clean-temp` tool call sitting between two identical `05-verify` ladders.

## The re-run rule

A gate ladder runs again when the agent may have changed something a gate reads. A warning turn about `$TMP` contents is not that. The agent's response to it can move files, so the ladder cannot simply be skipped on the assumption that nothing changed.

Re-run the ladder after a warning turn only when the agent's response to that turn could have changed what a gate reads. When the response changes nothing a gate reads, keep the passing verdict already established and record no second set of check events.

Decide "could have changed" from what the turn actually did rather than from the fact that a turn happened. An agent that answers the warning without touching the working tree or the gates' inputs has changed nothing. An agent that moves files has.

Do not implement this by deduplicating check events after the fact. The second execution is the cost; suppressing its record would hide the cost while still paying it.

Do not remove the warning. It exists because `$TMP` is destroyed when the work ends, and an agent that leaves evidence there loses it.

## Done when

- A stage whose ladder passes and whose agent takes a `$TMP` warning turn that changes nothing a gate reads records each check exactly once, and the stage still ends green. A test pins the check count.
- The same stage runs its gate ladder once rather than twice. A test proves the second execution does not happen, by counting executions rather than by counting recorded events.
- A stage whose agent responds to the warning by changing something a gate reads still re-runs the ladder, and a gate that would now fail still fails. A test pins that the guard against a stale verdict survives.
- The `$TMP` warning is still sent once per run under the same condition, with the same listing and the same guidance. A test pins that behavior unchanged.
- A stage whose agent takes an ordinary turn, not a warning turn, keeps its current re-run behavior exactly. A test pins it.
- A run that takes no warning turn produces the same record it produces today. A test pins it.
- The existing suite stays green.

## Boundary

`work()` and `warnForTmp` in `bot/src/gating.ts`, the re-run decision between them, and the tests covering the gating loop.

Do not change the check-event record format, its fields, or the record specification. Do not change `runChecks` itself, what a gate script is, or how a gate's exit code is read. Do not change the budget or turn accounting. Do not change `clean-temp` or any other tool. Do not change stage retry behavior. Do not change any consumer that reads a run record, and in particular do not adjust any reader to tolerate duplicate check events as a substitute for this fix.
