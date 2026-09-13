---
base: bc920886a06de4c8e7c886458b0489e8c7d34f52
head: 0af904c40681eebedda9017b028f9e97c406a9f3
---

# Bot owns the Pi runtime boundary

Bot now owns stable harness, tool, execution, event, and cleanup types. Production code imports `@earendil-works/pi-agent-core` only through `bot/src/harness.ts`. A mechanical test scans every direct production source file and enforces that boundary.

Pi remains pinned at 0.83.0. The adapter preserves prompt settlement, active tools, tool identity and context, progress, abort, event and hook removal, file and shell execution, result details, error state, and termination. This ticket changes no package, session reader, model, credential, public command, or normative specification behavior.

Gating owns an idempotent logical close. A terminal stage detaches record listeners, closes the session, and then appends `stage_end`. The flow owns a final backstop for thrown paths. A close failure cannot follow a successful stage ending. An unsignaled failure leaves the stage open and produces a faulting `run_end`. A concurrent signal keeps its signal exit and cause and names the cleanup failure.

Pi 0.83 can wait forever for `abort()` when a provider ignores cancellation. Logical close therefore requests abort and observes rejection without waiting for Pi to settle. It still waits for Bot-owned event appends and cleans Bot-owned execution resources. Ticket 0249 will add Pi's native close beneath this boundary after the package upgrade.

Independent design review rejected two earlier drafts. The first combined the package upgrade with 98 type errors across runtime and reader code. The second combined runtime ownership with durable-session pagination and required a native close that Pi 0.83 does not provide. The accepted design split reader work into ticket 0250, moved the package upgrade to 0249, defined exact terminal behavior, and scored this work at level 4. Sol Medium implemented it.

Independent code review rejected three implementation details across two rounds. It removed a broad late-signal reason change, replaced a pre-construction cleanup test with a real post-construction failure, and removed a callback added only for tests. The final review accepted the runtime behavior, test isolation, allowlist, size accounting, and migration boundary.

Production source grew from 16,582 to 16,852 nonblank lines. The archived ticket records the alternatives and accepted 270-line cost. The primary `make check` passed with 81 repository tests, 1,573 runtime tests across 219 files, 143 conformance cases, all static checks, and the 16,852-line ratchet. GitHub Actions runtime run `34557053972` and documentation run `34557053980` passed on commit `0af904c`. The design-only runtime run `34553266190` also passed.

Ian can replace or narrow this boundary through a later reviewed ticket. Reversal before ticket 0249 costs one internal migration. Reversal after the Pi upgrade requires another coordinated adapter change.
