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

### Acceptance evidence

**Deviation from the acceptance condition:** another session's database rebuild held the one-minute load average well above 1.0 throughout. Polled `uptime` every 60 s for 10 minutes starting 11:13:25 — load never dropped below 1.72 (readings: 2.62, 2.22, 1.72, 2.36, 2.54, 2.68, 2.58, 2.33, 2.50, 2.52) — then, per instruction, took both runs anyway, back to back, never concurrently, recording the observed load.

**Before** (`sh sdlc/scripts/test`, `/home/ian/workspace/repos/botassembly` at main `44d8dbf`, read-only): started 11:41:44, one-minute load average 6.18. Wall 2:26.81 (146.81 s), user CPU 726.68 s, system 129.78 s, exit 0, 214 test files / 1744 tests passed, 160/160 node --test cases passed.

**After** (`sh sdlc/scripts/test`, this worktree, `ticket/0287` rebased onto `44d8dbf`): started 11:44:15, one-minute load average 11.73. Wall 1:24.44 (84.44 s), user CPU 429.03 s, system 101.21 s, exit 0, 214 test files / 1742 tests passed, 160/160 node --test cases passed.

Wall time fell 42% (146.81 s → 84.44 s) and user CPU fell 41% (726.68 s → 429.03 s) despite the after run starting at nearly double the before run's load average — both runs ran under the same abnormal, shared-machine contention this ticket exists to reduce, so the true idle-machine saving is understated here, not overstated.

**Not re-measured after code review.** The final, amended commit reverts D4's parallel form to sequential (see Review) and restores four dropped fragments, both of which run more `node` children serially than the measured "after" run did. The wall/CPU numbers above were taken against the parallel form and were not retaken; they overstate this ticket's actual wall-time saving by roughly the D4 test's parallel-vs-sequential difference (recorded separately in Review: 4-6 s parallel vs ~17-20 s sequential for that one test, under load), while the coverage-summary, gate-count, and correctness evidence below were all taken against the final, reverted, currently-committed form.

Test count: 1744 → 1742 (two tests removed, D1 and D2; D3 converts five tests without changing the count; D4 changes assertions inside one existing test without changing the count). Removed tests and where their proof now lives:
- "run request returns a large retained request" (`run-request.test.ts`) — proof survives in "run request retrieves a large request retained by a real run" in the same file.
- "the compiled output command preserves the exact retained byte boundary" (`run-output.test.ts`) — its 1,048,576-byte assertion now runs inside "the compiled output command returns a large accepted output" in the same file.

Full local gate, run in the foreground one rung after another in this worktree (rebased onto main `44d8dbf`), against the final, code-reviewed commit: `sh sdlc/scripts/spec` — exit 0. `sh sdlc/scripts/lint` — exit 0, including `ratchet: bot/src 18874/18874` and `check-lint-rules: all 35 cases passed`. `sh sdlc/scripts/test` — exit 0, 214 test files / 1742 tests, `conformance: 143/143 passing`. `make -C bot coverage` — exit 0, `coverage-summary: 124 production modules across four dimensions.`, matching the `124` the instrumented run printed on main before this ticket. `make check` (via `lint` + `test`) ran no coverage instrumentation; only `make -C bot coverage` did. All four rungs were rerun after the code-review fixes (restored fragments, two more Buffer conversions, the D4 revert to sequential) and pass unchanged.

## Dependencies

Ticket 0286 changes `credentials.test.ts`, `pi-tap.test.ts`, and the credential environment. Rebase onto main after it lands.

## Risk facts

The inventory proof stops running locally. A dead or excluded production module is caught by the hosted check and by the primary agent, so a completion record's `make check` means less than before.

The worker cap adds about twenty seconds to an unloaded run. A dropped D4 fragment whose owner is misidentified leaves that contract unwitnessed.

## Size decision

- Starting production size: 18874 nonblank lines (rebased onto ticket 0286, landed at `44d8dbf`; 18817 was the count at this ticket's `257aa71` base before 0286 landed)
- Ending production size: 18874 nonblank lines (`npm run ratchet` inside `bot`: `ratchet: bot/src 18874/18874`)
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
- D1: "run request returns a large retained request" deleted; "run request retrieves a large request retained by a real run" (`bot/tests/run-request.test.ts`) proves the same retrieval through a real run.
- D2: "the compiled output command preserves the exact retained byte boundary" deleted; its 1,048,576-byte assertion now runs inside "the compiled output command returns a large accepted output" (`bot/tests/run-output.test.ts`).
- D3: the five named `cli-worktree-lock.test.ts` tests now call `main()` through `realBoundary` (the boundary the file already imports for its real-run tests), `env.BOT_HOME` overridden per call as `home-busy.test.ts` does. The two real-lock tests ("a compromised run lock ends the record cleanly", "an event-loop stall records which run lock was compromised and for how long") stayed subprocess.
- D4 dropped-fragment owners: assembly.check/install/link/list/update/remove — `cli-assembly-management.test.ts`; capabilities — `capabilities.test.ts`; home.busy — `home-busy.test.ts`; home.show — `home-installation.test.ts:50`; run.events — `run-events.test.ts:150`; run.list — `run-list.test.ts:90`; run.show — `run-show.test.ts:242`; help — `cli-help.test.ts:81`.
- run.check fragment ownership, reconfirmed: `grep -rn '"operation":"run.check","cause":"run-missing"' bot/tests` after the rebase onto `44d8dbf` finds only `cli-lazy-model-runtime.test.ts` itself. No other file asserts a genuinely absent run's JSON `run-missing` cause for `run.check` (as distinct from `run-check.test.ts`'s missing-`record.jsonl` exit-1 cases, a different fixture shape). Keeping the fragment, alongside run.checklist and `--version`, is correct.
- Code review of the first commit (`30e1ac8`) rejected on three findings, fixed in the amended commit:
  1. The "No run's name starts with absent." stderr fragment was dropped for run.output, run.record, run.request, and run.session on the mistaken belief another file already owned it. It does not: `run-output.test.ts:54` checks only exit 1 and empty stdout, `run-record.test.ts` checks a malformed-arg exit 2 and a missing record (not an absent run), `run-request.test.ts` checks only `err.length > 0`, and `run-session.test.ts` has no absent-run case at all. Restored in `cli-lazy-model-runtime.test.ts`.
  2. Two more megabyte-scale Buffer comparisons had survived item 1's scan: `run-output.test.ts` (a 70,000-byte descriptor-resolution assertion) and `verified-output.test.ts` (several 70,000–130,000-byte delivery assertions built on the same `source()` fixture, only one of which the review named). All converted to `Buffer.equals` plus a length assertion; a fifth `verified-output.test.ts` assertion on a 3-byte fixture was left as `toEqual` since it is nowhere near the 64 KiB threshold.
  3. The D4 parallelization reverted to fully sequential. `assembly.list` reads `home/assemblies` while the mutation chain writes it, so any concurrent form — the two-chain version this ticket first tried, and the bounded-pool version that replaced it after the first race — narrows that race rather than closing it, and a burst of cold `node` children raises this shared machine's peak load, against the ticket's own goal. Only the fragment trim (D4's original, undisputed savings) stands; the twenty invocations run one at a time, as before this ticket.
