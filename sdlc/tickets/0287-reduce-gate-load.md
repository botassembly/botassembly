---
flow: build
priority: 1
deps: [0286]
---
# Reduce the machine load of the local gate

## Outcome

One local `make check` halves today's wall time and core time, caps vitest workers at half the cores, and proves everything today's gate proves except coverage instrumentation, which moves to `make coverage`. Duplicates merge or go, losing no assertion.

## Current facts

Measured in the test suite audit, confirmed against the files at `257aa71`.

- `bot/Makefile` `test:` runs `npm run test:coverage`, so every local gate instruments and `bot/package.json`'s uninstrumented `test` goes unused. Instrumentation adds 69.3 s of wall and 277.7 s of test time to a 52.4 s suite.
- **Decision, taken by the primary agent, reversible by Ian:** coverage leaves `make check` and becomes its own Make target, run by the hosted check job and by the primary agent before a completion record. `bot/scripts/verify-coverage-summary.mjs` fails only on a malformed summary, an inventory mismatch against `src/**/*.ts` on disk, and a missing or non-finite dimension. It sets no threshold and no ratchet, proving one commit's inventory.
- `bot/vitest.config.ts` sets no `maxWorkers`, so vitest takes 15 of 16 cores.
- Buffer deep-equality costs 2.239 s per MiB: `request-limit.test.ts:81,134`, `run-output.test.ts:64,66,74,105`, `run-request.test.ts:36,54`, `run-record.test.ts:37`.
- Origin: `sdlc/issues/2026-09-14-gate-cost-on-shared-machine.md`, deleted in this commit. Review chains ran in parallel worktrees, the gate ran twenty times, the load average sat near 6.5, and `hostile-gating` and `cli-auth-import-contract` timed out only then.

## Scope

1. Replace Buffer deep-equality with `Buffer.equals` plus a length assertion at the sites above and anywhere a scan of Buffers over 64 KiB finds. While 0286 is open, exclude `credentials.test.ts`, `pi-tap.test.ts`, and `credential-environment*`.
2. Give `bot/Makefile` a `coverage` target running `npm run test:coverage`, point `test:` at `npm run test`, and add `make -C bot coverage` after `make check` in the check job of `.github/workflows/runtime.yml`. State in `CONTRIBUTING.md` that the primary agent runs `make -C bot coverage` before writing a completion record and the record cites it, and that one broad gate runs per repository at a time while reviewers run focused suites.
3. Cap workers in `bot/vitest.config.ts` at `Math.max(2, Math.floor(availableParallelism() / 2))`, overridden by `BOT_TEST_WORKERS`, and set `BOT_TEST_WORKERS: 4` in the check job's `env` in `runtime.yml` so the hosted four-core runner stays uncapped.
4. Merge four duplicate groups.
   - D1, `run-request.test.ts:31` against `:39`: delete "run request returns a large retained request". "run request retrieves a large request retained by a real run" proves the same retrieval.
   - D2, `run-output.test.ts:57` against `:69`: delete "preserves the exact retained byte boundary". Its 1,048,576-byte assertion moves into "returns a large accepted output".
   - D3, `cli-worktree-lock.test.ts` against `home-busy.test.ts`: convert five tests to `main()` with the boundary the file already imports, every assertion unchanged. Override `env.BOT_HOME` per test as `home-busy.test.ts` does, so the proof that `--home` beats the ambient home survives: "busy uses the named home", "busy derives live directories", "busy fails closed", "busy treats every malformed live workdir", "a live root stage owns the run root".
   - D4, `cli-lazy-model-runtime.test.ts:82`: twenty cases run sequentially, each asserting an exit code, a content fragment, and an empty module list. Keep the inventory, exit code, and module list, and run with `Promise.all`. Before dropping a fragment, locate its assertion in another test file. Keep any fragment with no other owner, at least `--version`'s `request-invalid` line and `run.checklist`'s `run-missing` cause. Record the owning file per dropped fragment in the ticket record.
5. `node --test` runs each file in its own process, so sharing one Astro build means merging `sidebar.test.mjs` into `redirects.test.mjs`.

Exclude `bot/src` and anything reducing what the conformance corpus or `sdlc/scripts/platformcheck` proves. The real-subprocess boundary tests, the two lock tests in `cli-worktree-lock`, the deliberate waits, and the `spec-record-vocabulary` tests stay unchanged.

## Acceptance

Record a timed before-and-after of `sh sdlc/scripts/test`, one run each: wall time, user CPU, load average. Take both runs with no other gate running and the one-minute load average under 1.0 at each start; record it. Record the test count after the merges, each removed test, and where its assertion now lives.

`make -C bot coverage` prints today's `coverage-summary: N production modules across four dimensions.` line, `make check` runs no instrumentation, and the hosted check job runs coverage. Run the complete local gate.

## Dependencies

Ticket 0286 changes `credentials.test.ts`, `pi-tap.test.ts`, and the credential environment. Rebase onto main after it lands.

## Risk facts

The inventory proof stops running locally. A dead or excluded production module is caught by the hosted check and by the primary agent, so a completion record's `make check` means less than before.

The worker cap adds about twenty seconds to an unloaded run. A dropped D4 fragment whose owner is misidentified leaves that contract unwitnessed.

## Size decision

- Starting production size: 18817 nonblank lines
- Ending production size: 18817 nonblank lines
- Simpler approach tried: the process lever alone.
- Why insufficient alternatives were rejected: it divides the cost by gate count, never one gate.
- Production code added: none.
- Production code deleted: none.
- Accepted cost: none; production size should not change.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 4
- Minimum level floor: none
- Final level: 2
- Reasons: the gate contract changes across a Makefile, a workflow, and a contributor document, and proof is a timed measurement plus a located owner per dropped assertion.
- Selected model: `claude-sonnet-5` high implements, `claude-opus-5` medium reviews

## Review

- Origin: `sdlc/planning/notes/2026-09-14-test-suite-audit.md`.
- Design review: rejected once over dropped D4 proofs, the completion step, the hosted runner, the Astro build, and 0286.
