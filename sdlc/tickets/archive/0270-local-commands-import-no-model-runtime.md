---
flow: build
priority: 2
deps: []
---
# Local commands import no model runtime

## Outcome

Every explicitly Pi-free Bot operation loads no `@earendil-works` module in its process. Authentication, model, and run-mutation operations load the Pi boundary only after dispatch selects them. Local commands stop paying the Pi SDK's module-load cost.

## Current facts

Measured 2026-09-12 on the Linux box, fresh Node 22.22.3 processes, 2,011-run Bot home:

- `bot --help` completes in 2.7 seconds, `bot assembly check ./triage/triage` in 2.6, `bot run list --home <home>` in 2.4, and `bot home show` with a missing argument in 1.4.
- Importing `@earendil-works/pi-coding-agent` from its package root costs 1.5 to 1.7 seconds by itself. The barrel re-exports the whole agent: `dist/core/agent-session.js` costs about 0.78 seconds, `dist/core/model-runtime.js` about 0.29, `dist/core/model-registry.js` about 0.25, and `dist/config.js` about 0.03. The `pi-ai` package root costs about 0.17 and `pi-agent-core` about 0.23.
- `src/cli.ts` imports `src/model-runtime.ts` statically, and that module imports the package root. `processBoundary` also calls `piAgentDirectory()` eagerly for every command. No command can start without the complete barrel, including `--help`.
- Bot uses `ModelRuntime`, `getAgentDir`, and `CredentialSynchronizationError` from that root (ADR 0030) and nothing else.

## Scope

- Keep one closed internal operation table. Pi-capable operations are exactly `auth.import`, `auth.list`, `auth.login`, `auth.logout`, `model.list`, `run.start`, and `run.resume`. Help, version, capabilities, every home and assembly operation, and every run-inspection operation are Pi-free.
- Split command dispatch at that table. Pi-free handlers remain statically reachable. Authentication, model, and run-mutation handlers load through dynamic imports only after their operation is selected. Do not refactor the handlers themselves merely to move the import seam.
- Resolve the Pi package-root import inside `model-runtime.ts` on demand with one cached dynamic `import()`. The import specifier remains the package root; no deep import is admitted. Runtime factories keep their asynchronous signatures.
- Resolve `getAgentDir()` through that cached module only for Pi-capable operations, at most once per process invocation. Production `auth.import` receives its destination through an asynchronous path accessor; existing tests may continue to inject an exact path without loading Pi.
- Make credential-synchronization classification await the same cached module before applying `instanceof CredentialSynchronizationError`. Login and logout must retain their current rule: a credential mutation that succeeded before synchronization failed reports the mutation honestly instead of reporting an ordinary failure.
- Keep the static command inventory, help generation, capability output, and public command signatures unchanged. Type-only Pi imports remain allowed because Node erases them.
- Amend the mechanical import-boundary checks so the allowlist still covers the dynamic import. ADR 0030 gains one sentence admitting lazy loading of the same package-root boundary.
- Keep ADR 0004: no build step and no bundler; plain dynamic `import()` only.
- Record before-and-after startup measurements in the completion record. The contract is the module graph, not a wall-clock bound; the gate enforces no timing.

## Acceptance

A focused child-process test derives every operation from the closed command inventory, invokes a safe request for each Pi-free operation, and asserts that its loaded-module list contains no `@earendil-works` specifier. Separate cases cover `--help` and `--version`. The test must fail if `cli.ts`, command dispatch, or any carrier regains an eager Pi import.

Network-free production child-process cases prove the two distinct lazy seams: `model.list` reaches real Pi runtime construction against a private temporary agent directory, and `auth.import` resolves the real Pi agent directory before its ordinary missing-source refusal. Existing authentication mutation tests prove awaited synchronization-error classification for login and logout. Existing model and run suites prove injected and native runtime construction still works.

The closed Pi-capable table and complete command inventory must be exact complements. The import-boundary checks, focused CLI and authentication suites, lint, typecheck, and the complete local and hosted gates pass.

## Dependencies

None. Ian promoted this ticket to the first implementation outcome on 2026-09-13. Pi source is reference material only; this ticket changes no Pi package or repository.

## Risk facts

A lazy import hides a module cycle or a construction failure until first use. A no-model command can silently regain an eager import. The load-recorder test catches both structurally, and construction failures already flow through the paths that handle `ModelRuntime.create` rejection.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 2
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none.
- Final level: 3
- Reasons: One import seam at the composition root reaches every command path. The proof must observe real process loads and preserve delayed construction failures.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Origin: performance survey requested by Ian on 2026-09-12. The startup measurements and the package bisect above are the observed facts.
- Design review: accepted after two rounds. The first review required a closed Pi-capable operation set, one cached package-root import, delayed authentication-path resolution, preserved synchronization-error classification, and process-level proof across the full command inventory.
- Code review: accepted after two rounds. The first review moved authentication-path rejection under the command error contract and replaced malformed probes with valid requests and asserted results for every Pi-free operation.

## Size decision

- Starting production size: 18679 nonblank lines
- Ending production size: 18728 nonblank lines
- Simpler approach tried: Make only the package-root import dynamic inside `model-runtime.ts`.
- Why insufficient alternatives were rejected: Static authentication and run-mutation handlers still reached the model boundary through their imported carriers. The command dispatcher needs an explicit closed split, and inspection needs the pure slot-path helper without the Pi-backed tool module.
- Production code deleted: The run-mutation implementation leaves `cli.ts`; eager Pi imports and eager agent-directory resolution are removed.
- Accepted cost: The 49-line increase buys the closed lazy dispatcher, cached Pi module resolution, asynchronous authentication-path resolution, and pure slot-path carrier. The implementation review found no duplicated dispatch, runtime construction, run mutation, or path expansion.
