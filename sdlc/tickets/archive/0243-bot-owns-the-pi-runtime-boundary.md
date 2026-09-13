---
flow: build
priority: 1
deps: [0242]
---
# Bot owns the Pi runtime boundary

## Outcome

Bot runtime consumers depend on stable Bot-owned harness, tool, execution, and event types. A local adapter contains Pi 0.83.0. The pinned Pi packages and current behavior stay unchanged.

## Current facts

A disposable current-main install of the three Pi 0.85.1 packages reports 98 TypeScript errors across 7 production and 16 test files. Pi changes harness construction, operation context, results, events, tool execution, retry defaults, sessions, and cleanup together. Bot currently lets these types cross attempt, turn, gating, flow, tooling, event, reader, and test boundaries.

The package graph permits a safe split. Bot can establish its own runtime interface on 0.83.0 before ticket 0249 changes the Pi implementation. Ticket 0250 separately prepares retained-session reading. This keeps every commit buildable and gives each proof one owner.

## Scope

Add one Bot-owned Pi adapter in `bot/src/harness.ts`. Bot consumers depend on stable Bot-owned types for prompt settlement into one `AssistantMessage`, abort, active-tool reads and writes, event and hook subscriptions, tool definition and invocation, filesystem and command execution results, and idempotent logical closure. Normalize turn-start, turn-end, tool-start, and tool-end events at this boundary. Keep direct production imports from `@earendil-works/pi-agent-core` inside the adapter. Any exception requires an explicit ticket correction and review before implementation continues.

The Bot tool interface preserves name, label, description, parameter schema, sequential execution mode, tool-call ID, parsed parameters, the invocation-scoped `AbortSignal`, supplied progress callbacks, typed control or file context, result content, result details, error state, and terminate behavior. The Bot execution interface preserves every filesystem and command operation that current Bot tools use. It preserves slot-path rewriting, the scrubbed shell environment, stage-owned temporary paths, abort, and typed result or error conversion. Ticket 0249 may adapt Chord contexts and Pi's six-argument execution call beneath this interface. It may not change these Bot facts.

Give `GatingSession` an explicit `close()` operation. On Pi 0.83.0 this is Bot's logical lifecycle boundary because the Pi harness and session have no native close operation. It removes subscriptions, waits for in-flight record appends, and aborts a live prompt. `endStage()` closes after tap detachment and before it appends `stage_end`. `flow.ts` has an idempotent `finally` backstop for thrown paths. An adapter creation failure after Pi object construction cleans its local objects before it rejects because `flow.ts` never receives that session.

A close failure before `stage_end` follows the current thrown-machinery path. An unsignaled close rejection appends no `stage_end`. The final `run_end` names the open stage with `exit: 2`, `cause: "fault"`, and the bounded close-error reason. An active signal also appends no `stage_end`. Its `run_end` retains the signal exit and cause and carries `Stage cleanup failed: <bounded reason>` as its reason. Exactly one terminal owner remains. No close failure can disappear or appear after a contradictory successful `stage_end`. Ticket 0249 adds native harness and session closure beneath this logical boundary.

Do not change retry ownership in this ticket. `retryModel` remains the only Bot retry owner. Preserve zero-token-only retries, no replay after a completed tool effect, exact `provider_retry` numbering and delay, one `provider_start` per logical provider operation, only the selected attempt's stream in the session and record, current error-cause reporting, abort during response or backoff, and removal of abort listeners and retry timers.

Keep the exact recorded session path and session behavior. Stay on exact-pinned Pi 0.83.0. Do not change session readers, package metadata, the lockfile, catalog ownership, credential ownership, model resolution, public command output, normative specification behavior, or the source ratchet without a recorded size decision. Do not add `ModelRuntime`, coding-agent imports, extension loading, or private Pi imports.

Allowed production files are `bot/src/harness.ts`, `bot/src/access.ts`, `bot/src/attempt.ts`, `bot/src/execution.ts`, `bot/src/flow.ts`, `bot/src/gating.ts`, `bot/src/machinery.ts`, `bot/src/pi-tap.ts`, `bot/src/tools.ts`, and `bot/src/turns.ts`.

Allowed test files are `bot/tests/abandoned-prompt.test.ts`, `bot/tests/ceiling-fanout.test.ts`, `bot/tests/cli.test.ts`, `bot/tests/extract-tools.test.ts`, `bot/tests/failure-hook-ending.test.ts`, `bot/tests/file-tools.test.ts`, `bot/tests/flow-harness.ts`, `bot/tests/gating.test.ts`, `bot/tests/harness-boundary.test.ts`, `bot/tests/hook-prompt-ordering.test.ts`, `bot/tests/hostile-flow.test.ts`, `bot/tests/hostile-gating.test.ts`, `bot/tests/pi-tap.test.ts`, `bot/tests/provider-retry.test.ts`, `bot/tests/skills-materialize.test.ts`, `bot/tests/typed-library-faults.test.ts`, and `bot/tests/warning-rerun.test.ts`.

Allowed documentation and planning files are this ticket, ADR 0010, ADR 0030, the plan, and `specification/CHANGELOG.md`. `sdlc/ratchet.json` is allowed only when measured net production growth requires a ceiling increase and the size decision records that cost. Keep changes local. Do not rewrite unrelated test helpers.

## Acceptance

Red proof starts with a mechanical test that rejects any direct production import from `@earendil-works/pi-agent-core` outside `bot/src/harness.ts`. Add interface-level compile and behavior tests that pin prompt settlement, active tools, tool execution normalization, event and hook detachment, abort propagation, and logical close-once behavior against the 0.83.0 adapter.

Focused tests cover ordinary runs, several stage attempts in one session, provider retry and selected-stream behavior, timeout and signal aborts, run resume, subflow children, parallel children, listener cleanup, setup failure after construction, and close failure precedence before `stage_end`. Existing assertions remain at least as strong.

Documentation generation, strict type checking, focused tests, and the complete repository check pass. Production growth requires a size decision that records starting and ending nonblank lines, the simpler approach tried, rejected alternatives, deleted production code, and accepted cost.

## Dependencies

0242 defines the target public boundary and accepted costs.

## Risk facts

This moves shared asynchronous ownership across every model invocation and tool path. A wrong result can leak listeners, replay model or tool work, hide evidence, or contradict a terminal record.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for shared asynchronous state and a runtime-wide compatibility boundary
- Final level: 4
- Reasons: The public command contract stays stable. Internal harness, tool, execution, event, and cleanup ownership changes across the runtime. Errors can replay model or tool work, hide evidence, or contradict terminal records.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if design introduces a new public contract, coordinated migration, security exposure, or different state boundary.

## Review

- Design review: accepted after the runtime boundary, tool and execution contracts, close timing, terminal-record precedence, exact allowlist, size gate, and level-4 routing became exact
- Code review: accepted after late-signal reason handling stayed narrow and the real post-construction path proved cleanup-once and cleanup-error identity without a production test seam; completed at `0af904c`

## Implementation evidence

The red boundary test scanned every direct `bot/src/*.ts` file except `harness.ts` and found direct Pi imports in `access.ts`, `attempt.ts`, `execution.ts`, `machinery.ts`, `pi-tap.ts`, and `tools.ts`. The green boundary leaves the Pi imports only in `harness.ts`. Interface tests cover prompt settlement, active tools, normalized events, detached hooks, tool-call identity and context, progress and termination results, abort propagation, idempotent logical close, both terminal close-failure paths, and rejection of an unrelated provider reason under a late signal. The real `defaultGating` path constructs Pi storage, session, and harness before its required work-mode output check fails. A prototype spy proves that path cleans the actual execution owner exactly once and preserves cleanup-failure identity.

The implementation found one Pi 0.83.0 lifecycle limit. Awaiting `AgentHarness.abort()` can wait forever when a provider ignores its abort signal. Logical close therefore detaches Bot listeners, requests abort with an observed rejection handler, waits for Bot's in-flight listener work, and closes Bot-owned execution resources. A later native close from ticket 0249 remains responsible for Pi-owned resources.

## Size decision

- Starting production size: 16582 nonblank lines
- Ending production size: 16852 nonblank lines
- Simpler approach tried: The first implementation exported aliases of Pi's execution types.
- Why insufficient alternatives were rejected: Pi type aliases left Bot consumers tied to Pi's type surface and failed this ticket's ownership outcome. Keeping direct imports in the six consumers preserved the coordinated migration that this ticket removes. Splitting lifecycle and tool adapters into separate files spread one dependency boundary and added ownership seams.
- Production code deleted: Moving and consolidating existing Pi calls deleted a net two nonblank lines from the prior production files.
- Accepted cost: The source ratchet rises by 270 nonblank lines. The new 272-line adapter provides one mechanically enforced dependency boundary, explicit cleanup ownership, and deterministic terminal evidence.
