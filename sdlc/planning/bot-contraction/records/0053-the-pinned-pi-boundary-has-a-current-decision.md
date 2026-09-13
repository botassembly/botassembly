---
flow: build
priority: 6
completed: 2026-09-06
---
# The pinned Pi boundary has a current decision

## Result

Bot keeps `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` pinned at 0.83.0. ADRs 0001 and 0009 now name the current bounded retry adapter as an explicit temporary exception. Production source and dependency pins did not change.

Pinned Pi 0.83 already exports a retry helper. A repeatable characterization proves that it retries transient responses which report token use. Bot requires a zero-usage fence. Bot also publishes stream events only from the selected attempt. Pi's message-level helper therefore needs event-stream adaptation. A future replacement becomes work only after a focused design proves net deletion while preserving those two observable behaviors.

The injected clock and backoff-abort message differ from Pi's helper. Current evidence does not establish either detail as observable product behavior. A replacement may change them unless later integration evidence proves otherwise.

The direct 0.85.1 upgrade remains a boundary migration. A repeatable spike against audited commit `eb8a59cc8858fc9ab23b50c168bcbed77a24bc0f` exits type checking with 94 errors. The errors comprise 34 across seven production files and 60 across sixteen test files. The qualification record preserves exact versions, registry integrity, commands, file counts, affected boundaries, authentication review requirements, and the adapter deletion boundary.

The retained operation evidence covers only `openai-codex`. Ticket 0052 now records future provider-operation starts. A stall detector does not become work until retained data supplies normal completed durations and independently identified stalls, plus a proposed threshold and measured false-positive cost.

## Review and corrections

Design review first rejected temporary-only upgrade evidence and an underspecified stall trigger. The exact archive/install/typecheck recipe and the stronger measurement boundary resolved those findings.

The first spike count said 93 errors. That checkout was at `0f816f31`. A fresh reproduction against the documented `eb8a59cc` input includes ticket 0052's provider hook and reports one additional `pi-tap.ts` error. The durable result now says 94.

A later source check disproved the claim that the retry helper arrived after Pi 0.83. The ticket reopened. The focused characterization then separated required behavior, adaptation cost, and implementation differences. Renewed design and code reviews accepted the corrected decision.

The final roadmap review found a separate open gap. Current runtime provenance binds checkout HEAD, lockfile bytes, Node, and provider adapter. It does not bind dirty TypeScript bytes that Node can execute. The roadmap leaves the contract-quality checkpoint open and names exact executed-source provenance as the next manual work.

## Checks

The focused Pi decision, helper characterization, and retry tests passed eight tests. The complete root `make check` passed with 19 project tests, 207 Bot test files, 1,362 Bot tests, 143 of 143 conformance cases, all 101 production modules in the coverage summary, and the unchanged 15,120-line production ratchet. Coverage reported 91.45 percent statements, 85.23 percent branches, 93.12 percent functions, and 96.35 percent lines.

## Size decision

- Starting production size: 15120 nonblank lines
- Ending production size: 15120 nonblank lines
- Simpler approach tried: Record the measured decision and leave the qualified working pin unchanged.
- Why insufficient alternatives were rejected: Pi's current helper does not preserve the zero-usage fence or selected-attempt stream events without local adaptation. A direct 0.85.1 update fails across the harness boundary. A stall detector lacks measured provider-start history.
- Production code deleted: None. A future replacement must delete the retry adapter after it proves net deletion and equivalent required behavior.
- Accepted cost: Bot retains the bounded retry adapter and the current Pi pin.
