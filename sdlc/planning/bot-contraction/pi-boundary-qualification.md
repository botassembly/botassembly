# Pi boundary qualification — 2026-09-06

## Decision

Bot keeps `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` pinned at 0.83.0. Pi 0.83.0 already exports the retry policy and helper that the first review attributed only to 0.85.1. The current 68-nonblank-line retry adapter in `bot/src/credentials.ts` remains a documented exception to ADRs 0001 and 0009 until a focused replacement design proves net deletion while preserving the required observable behavior. The separate disposable 0.85.1 qualification proves that adopting that release requires a boundary migration. This decision accepts temporary duplicate behavior and avoids an unproved retry change or SDK migration.

## Audited input and registry identity

The spike started from Bot commit `eb8a59cc8858fc9ab23b50c168bcbed77a24bc0f`, committed at 2026-09-06T13:43:26-04:00. It targeted these exact registry objects:

| Package | Current pin | Spike target | Registry integrity |
| --- | ---: | ---: | --- |
| `@earendil-works/pi-ai` | 0.83.0 | 0.85.1 | `sha512-+VgVIJDkDO2efYJKEEqvPTH4zmnIaXdAppGbO+vKFA9qy5PdhFiAenuFAkU+oiCSfOC4dMHDyrjdQeL4ZoC5CQ==` |
| `@earendil-works/pi-agent-core` | 0.83.0 | 0.85.1 | `sha512-hIXIP3eAWueAYiAl8aMvWCvvZ8Q5gT3Dip5bE5uJyIGh4+YlWRjtMLI4BaeoXoSs93zndjue61u1B/vhefLnuA==` |

The registry reported both values on 2026-09-06. Both the pinned 0.83.0 release and 0.85.1 publicly export `RetryPolicy`, `retryAssistantCall`, and `RetryCallbacks`. The pinned release also exports the transient-error classifier Bot already uses. The first qualification incorrectly attributed this surface only to 0.85.1.

## Pinned helper comparison

A focused characterization in `bot/tests/pi-retry-helper-characterization.test.ts` makes this comparison repeatable against the pinned package. It confirms that `retryAssistantCall` classifies a transient provider error, makes two retries, schedules delays of 2 and 4 milliseconds from a 2-millisecond base, and calls the scheduling callback before each delay. Bot can attach `provider_retry` timing and stage identity through that callback. This characterization supports this decision. It does not make Pi's internal implementation part of Bot's public contract.

The comparison separates behavior from mechanism. Two observable behaviors are required. A transient response with one reported input token still runs three provider calls through the helper, while Bot's zero-usage fence permits one call. Bot also publishes only the selected attempt's stream events. The helper's `AssistantMessage` input and output create an adaptation cost at Bot's `AssistantMessageEventStream` boundary. A wrapper would still need to buffer and select streaming events.

The comparison also records two implementation differences. The helper uses the global `setTimeout` instead of Bot's `DriverClock`. An abort during backoff returns `stopReason: "aborted"` without the provider error, while the current adapter finishes the retained provider-error response. No current integration evidence shows that either difference changes user-visible behavior. A replacement does not need to preserve the injected clock or current abort-message shape unless later evidence makes one observable.

The helper can own classification, retry count, exponential-delay calculation, and scheduling callbacks. Replacing only the overlapping loop would still require event-stream adaptation and the zero-usage fence. Production stays unchanged until a focused replacement design proves net deletion while preserving those two observable behaviors.

## Reproduce the disposable spike

Run these commands in a disposable directory. They leave the working repository and its lockfile unchanged.

```sh
scratch=$(mktemp -d)
git archive eb8a59cc8858fc9ab23b50c168bcbed77a24bc0f | tar -x -C "$scratch"
cd "$scratch/bot"
npm install --ignore-scripts --save-exact @earendil-works/pi-ai@0.85.1 @earendil-works/pi-agent-core@0.85.1
npm run typecheck
```

Verify the two downloaded registry identities independently:

```sh
npm view @earendil-works/pi-ai@0.85.1 version dist.integrity --json
npm view @earendil-works/pi-agent-core@0.85.1 version dist.integrity --json
```

## Compiler result

The typecheck exited 2 with exactly 94 TypeScript errors across 7 production files and 16 test files. The complete error log remains disposable because the commands above reproduce it. This compact file count preserves the measured result:

| Production file | Errors |
| --- | ---: |
| `src/access.ts` | 2 |
| `src/attempt.ts` | 1 |
| `src/gating.ts` | 1 |
| `src/machinery.ts` | 6 |
| `src/pi-tap.ts` | 4 |
| `src/tools.ts` | 16 |
| `src/turns.ts` | 4 |

| Test file | Errors |
| --- | ---: |
| `tests/abandoned-prompt.test.ts` | 4 |
| `tests/ceiling-fanout.test.ts` | 2 |
| `tests/cli.test.ts` | 8 |
| `tests/extract-tools.test.ts` | 2 |
| `tests/failure-hook-ending.test.ts` | 4 |
| `tests/file-tools.test.ts` | 2 |
| `tests/flow-harness.ts` | 4 |
| `tests/gating.test.ts` | 4 |
| `tests/hook-prompt-ordering.test.ts` | 4 |
| `tests/hostile-flow.test.ts` | 4 |
| `tests/hostile-gating.test.ts` | 5 |
| `tests/pi-tap.test.ts` | 1 |
| `tests/provider-retry.test.ts` | 4 |
| `tests/skills-materialize.test.ts` | 4 |
| `tests/typed-library-faults.test.ts` | 4 |
| `tests/warning-rerun.test.ts` | 4 |

The errors expose six coupled boundaries. Harness construction changed its generic and construction surface. Session storage moved from `Session`, `InMemorySessionStorage`, and `JsonlSessionStorage` to repository-based APIs. Tool invocation changed its invocation fields and callback arguments. Execution-context parameters entered file and tool operations. Harness event names and types changed. Assistant and typed fault result unions changed. These categories overlap at several files, so the file tables provide the exact non-overlapping count.

## Evidence required for a future migration

ADR 0003 requires an exact pin and integrity update, public exports only, a reviewed source and lockfile diff, strict Bot typechecking, the complete offline check, and focused runtime qualification of every changed Pi boundary. A replacement must delete the retry adapter from `const PROVIDER_RETRIES` through `retrying` in `bot/src/credentials.ts`. It must preserve the zero-usage fence and publish only the selected attempt's stream events. It must keep the `provider_retry` and `provider_start` record facts honest. It may change the internal clock and backoff-abort message shape unless integration evidence first establishes either one as observable behavior.

ADR 0021 requires a separate authentication compatibility review. The migration must preserve Bot's owner-only credential store and environment snapshot. Pi must continue to own provider credential shapes, login, refresh, and authentication precedence. Tests must prove that stage processes receive no provider credentials, stored credentials retain precedence, refresh failures do not leak provider text, and any new provider inputs enter the explicit snapshot-and-scrub boundary before the pin changes.

Operational qualification must exercise every provider Bot claims to support and each selected transport that applies. Provider-neutral controlled tests remain required. They cannot substitute for operational evidence because the retained-home snapshot below contains only one provider.

## Observed operation evidence and stall detection

Ticket 0052's retained-home snapshot was taken at 2026-09-06T13:16:37-04:00 before `provider_start` existed. It contained 140,916 completed turns, all from `openai-codex`, and 121,406 requested WebSocket transport facts. Those events cannot measure silent provider intervals because they appear only after a response. They provide single-provider operational evidence and do not prove provider-neutral operation. Four older suspected stalls required inference from surrounding stage facts, so they do not qualify as measured provider-operation durations.

New shape-1 records now append `provider_start` before Pi invokes a logical provider operation. A stall-detector ticket requires a retained sample of normal completed durations from matching `provider_start` and `turn` facts. It also requires independently identified interrupted or stalled operations whose starts remain unmatched. The sample must support a proposed threshold, show how many normal operations that threshold would stop, and state the measured false-positive cost. Until that evidence exists, a detector would encode a guess and does not become work.
