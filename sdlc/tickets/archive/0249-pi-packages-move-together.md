---
flow: build
priority: 1
deps: [0243, 0250, 0251, 0252]
---
# Pi packages move together to 0.85.1

## Outcome

Bot exact-pins and bundles the three Pi packages at 0.85.1. The Bot-owned harness adapter moves to the new Pi API while run, retry, stream, session, resume, child, cleanup, catalog, and credential behavior stays unchanged.

## Current facts

Ticket 0243 creates the Bot-owned runtime boundary while Pi remains at 0.83.0. Tickets 0250 through 0252 add dual-format session decoding, pagination, and search indexing. A disposable exact-pin install against `77d59d0` succeeds and produces 64 TypeScript errors across four production files and seven test files. npm retains bundled state for the existing lower packages but does not add the coding-agent package to `bundleDependencies`.

Pi 0.85.1 replaces direct harness construction with asynchronous `AgentHarness.create`. Operations take a Chord `Context`. `prompt()` returns an expected-failure result. Events use `HarnessEvent`, `events.on`, `hooks.on("before_request", ...)`, `tool_start`, and `tool_end`. Tools use a six-argument `execute`. Sessions use public format-4 storage and repository APIs. The harness also enables its own three-retry policy by default.

## Scope

Add direct exact `0.85.1` pins and `bundleDependencies` entries for `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent`. Update the lockfile and package-integrity evidence. Reject duplicate lower Pi versions.

Replace only the Pi-facing side of the harness adapter from ticket 0243. The production allowlist is `bot/src/harness.ts`, `bot/src/machinery.ts`, `bot/src/tools.ts`, and `bot/src/turns.ts`. Use composition when the new Pi shape makes the old subclass invalid.

Use public `AgentHarness.create` and its open result, Chord `Context`, `HarnessEvent`, `events.on`, hooks, tool events, the six-argument tool `execute`, and expected-failure result handling. Use public `JsonlSessionRepo` and `StorageBackedSession` through `@earendil-works/pi-agent-core/harness/session`.

Pi's public create operation cannot select Bot's exact session filename. Bot therefore creates one exclusive format-4 header at the record-named `session.jsonl` path, constructs matching public `JsonlSessionMetadata`, and opens that exact path through `JsonlSessionRepo.open`. The header contains `v: 4`, `kind: "header"`, the session id, public `JSONL_STORAGE_VERSION`, creation time, and cwd. Pi owns every later transaction and native close. Setup failure keeps or removes the header according to the existing honest-start boundary and never overwrites an existing session file. Do not import `JsonlStorage`.

Set Pi harness retry to `{ enabled: false, maxRetries: 0, baseDelayMs: 0 }` and its stream option `maxRetries` to zero. Bot's `retryModel` remains the only retry owner. Preserve zero-token-only retries, no replay after a completed tool effect, exact `provider_retry` numbering and delay, one `provider_start` per logical provider operation, only the selected attempt's stream in the session and record, current error causes, response and backoff aborts, listener and timer removal, and close-once cleanup.

Add a public package-root module-shape test for `ModelRuntime` and `getAgentDir`. The test verifies exports without constructing or adopting `ModelRuntime`. This gives the coding-agent dependency a current audited use before ticket 0244.

Do not use deep imports, `setDefaultStreamFn`, extension discovery, `ExtensionRunner`, `registerProvider`, or `registerNativeProvider`. Do not construct `ModelRuntime`. Do not change provider catalogs, model availability, credential ownership, command contracts, or normative specification behavior. Ticket 0244 owns the model-runtime adoption.

The changelog states that newly written Pi sessions use format 4 while retained format-3 sessions remain readable. Review all three lockfile versions, resolved artifacts, integrity hashes, bundled state, and duplicate-version absence.

## Acceptance

Before changing the pins, add one public 0.85.1 compatibility fixture that fails against 0.83.0. It exercises `AgentHarness.create`, Chord `Context`, `HarnessEvent`, the selected public session types, and tool execution. Add a focused proof that exposes Pi's default extra retry until the adapter disables it.

After migration, focused tests cover ordinary runs, several attempts in one session, provider retries, selected streams, timeout and signal aborts, session rendering and paging, run resume, subflow and parallel children, listener cleanup, setup failures, and close failures. A real writer creates the exact record-named path with a format-4 header and transaction that tickets 0250 through 0252 can read. Existing assertions stay at least as strong. Strict type checking, pinned-dependency checks, dependency audit, packing inspection, documentation generation, and the complete offline repository check pass.

Production growth requires a size decision that records starting and ending nonblank lines, the simpler approach tried, rejected alternatives, deleted production code, and accepted cost.

## Size decision

- Pre-migration production size: 16959 nonblank lines
- Starting production size: 17001 nonblank lines
- Ending production size: 17046 nonblank lines
- Simpler approach tried: Adapt the existing wrapper in place and capture the latest public turn event. Pi resolves an operation before queued event delivery finishes, and its public create path cannot select Bot's exact session filename.
- Why insufficient alternatives were rejected: Letting Pi choose a filename breaks the record contract. Importing `JsonlStorage` breaks the public-package boundary. Adopting `ModelRuntime` expands this ticket into work owned by 0244.
- Production code deleted: 114 lines across the four allowed production files.
- Accepted cost: 87 additional nonblank lines retain Bot's exact-path record ownership, stable five-argument tool surface and write disclosure, one retry owner, ordered turn delivery, complete fault causes, bounded close behavior, and public Pi session lifecycle.

## Dependencies

0243 supplies the stable Bot-owned runtime boundary. Tickets 0250 through 0252 supply dual-format session decoding, paging, tool reading, and search indexing.

## Risk facts

This changes shared asynchronous runtime machinery and the packaged dependency set across every invocation path. A retry or cleanup mistake can repeat provider work, lose evidence, or leave a run unsettled.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 because a retry or cleanup error can repeat external tool effects or lose retained evidence
- Final level: 4
- Reasons: Tickets 0243 and 0250 through 0252 isolate Bot consumers and readers first. This ticket still changes the Pi implementation beneath every invocation, disables a second retry owner, changes session writing, and adds a large bundled package. Wrong retry or cleanup behavior can repeat an external effect or lose evidence.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation changes provider, model, credential, public command, or durable record ownership.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after generated lock metadata marked every bundled coding-agent dependency correctly
