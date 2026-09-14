# Test suite audit — botassembly @ 008f41a, 2026-09-14

## Verdict

The suite is not too big: 1,730 tests across 214 files run in 52 seconds of wall time with no instrumentation, and the most valuable part of it — 143 conformance corpus cases — costs 0.8 seconds. The load comes from three things that have nothing to do with test count: V8 coverage instrumentation on every local gate (it adds 69 s of wall and 278 s of CPU to a 52 s run), vitest deep-equality on multi-megabyte Buffers (`expect(buf).toEqual(buf)` costs 2.2 s per MiB and 4.4 s per MiB inside an object, which alone accounts for about 80 s of the 430 s of summed test time), and an uncapped 15 workers on a shared 16-core box. Cut instrumentation out of `make check`, replace megabyte `toEqual` with `Buffer.equals`, and cap workers at 8 — that is roughly half the wall time and 60 % of the core time, with no proof lost and no test deleted.

## Measurements

All taken on the Linux box, 16 cores, load average 0.33 at start. One run each.

| Measurement | Value |
| --- | --- |
| Runtime suite, uninstrumented, wall | **52.36 s** |
| Runtime suite, uninstrumented, CPU (user+sys) | **586.70 s** (1120 % of one core) |
| Runtime suite, instrumented (issue file, 74e7598) | 121.67 s wall, 707.52 s summed test time, 229.37 s import |
| Coverage instrumentation cost | **+69.3 s wall (+132 %), +277.7 s summed test time (+65 %)** |
| Test files reported | 214 (235 `.ts` in `bot/tests`, 21 are helpers) |
| Tests | 1,730 |
| Summed per-file time | 429.8 s |
| Longest single file (the wall floor) | `run-output.test.ts` 49.8 s |
| Peak RSS | 2.93 GiB |
| Default vitest 4 workers | `availableParallelism() - 1` = **15** |
| Files spawning child processes | **36** (146 `spawn`/`spawnSync`/`execFile`/`execFileSync`/`fork` sites) |
| Summed time of those 36 files | 140.0 s (33 % of summed time) |
| Conformance corpus | 143 cases, **0.798 s**, 4 tests, one file, all in-process |
| Fuzz corpus in the ordinary suite | 120 cases, 1.60 s |
| Project tests (`node --test docs/scripts/*.test.mjs scripts/*.test.mjs`) | **19.77 s wall, 100.73 s CPU** |
| Slowest project test | `tutorial-walkthrough.test.mjs` 12.86 s |
| Summed project top-level test time | 49.5 s (the ~50 s gap is the Astro builds, which run in top-level `await` outside any test) |
| Astro builds per gate | **2** (`docs/scripts/sidebar.test.mjs`, `docs/scripts/redirects.test.mjs`; `sdlc/scripts/spec` builds nothing) |
| `generate-specification.mjs` runs per gate | 3 (once in `sdlc/scripts/lint`, once inside each Astro build) |

### Twenty slowest files (uninstrumented)

| s | tests | file |
| --- | --- | --- |
| 49.8 | 6 | run-output.test.ts |
| 47.3 | 11 | request-limit.test.ts |
| 33.7 | 7 | cli-worktree-lock.test.ts |
| 18.8 | 15 | session-pagination.test.ts |
| 17.0 | 4 | cli-lazy-model-runtime.test.ts |
| 13.1 | 8 | run-request.test.ts |
| 11.4 | 16 | cli-auth-logout-contract.test.ts |
| 10.6 | 6 | ordinary-cli-output.test.ts |
| 10.2 | 6 | spec-record-vocabulary.test.ts |
| 10.0 | 27 | fanout-runtime.test.ts |
| 8.9 | 11 | run-continuation.test.ts |
| 8.0 | 12 | process.test.ts |
| 7.7 | 4 | cli-signal-boundary.test.ts |
| 7.1 | 12 | run-record.test.ts |
| 6.9 | 22 | hostile-gating.test.ts |
| 6.3 | 15 | cli-exit.test.ts |
| 5.9 | 15 | project-script-adoption.test.ts |
| 5.8 | 37 | cli-auth-import-contract.test.ts |
| 4.1 | 13 | verified-output.test.ts |
| 4.1 | 8 | cli-stage-workdir.test.ts |

Distribution: 3 files hold 131 s (30 %), 5 files hold 167 s (39 %), and the 143 files under one second hold 49 s in total.

### The buffer-assertion measurement

Measured directly, one vitest file, 1 MiB Buffers:

| assertion | duration |
| --- | --- |
| `expect(a).toEqual(b)` | **2.239 s** |
| `expect(a).toStrictEqual(b)` | 2.589 s |
| `expect({code:0,out:a}).toMatchObject({code:0,out:b})` | **4.425 s** |
| `expect(a.equals(b)).toBe(true)` | **0.000 s** |

Vitest walks a Buffer as an object with one property per byte. This is the single largest waste in the suite and it is mechanical to fix.

## Duplicates

The suite is disciplined. I checked for the classic overlaps and mostly did not find them: refusal-code stderr assertions repeat across files only where the *path* and *command* differ (11 codes appear in more than one file, each in a different context); no vitest file re-runs a conformance corpus case; the process-boundary tests (`cli-signal-boundary`, `cli-exit`, `raw-record-races`, `ordinary-cli-output`, `cli-invocation-guard`) prove signal delivery, pipe closure and exit codes, which an in-process call cannot prove. Four real groups:

### D1 — `run-request.test.ts:31` vs `run-request.test.ts:39`

- **Files**: `bot/tests/run-request.test.ts`, tests "run request returns a large retained request" (6.6 s) and "run request retrieves a large request retained by a real run" (6.4 s).
- **Overlap**: both build a 1,048,577-byte request, invoke `run request <run> --raw`, and assert `{ code: 0, out: <the exact bytes>, err: Buffer.alloc(0) }`. The only difference is that the first hand-writes the record and the second produces it with a real `run start`.
- **Cut**: delete the first. The second is a superset — it proves retention *and* retrieval.
- **Proof remaining**: exact-byte retrieval above 1 MiB, from a request a real run actually recorded.
- **Risk**: none. The synthetic fixture proves strictly less.
- **Saving**: ~6.6 s summed, ~1.5 s after D-ALL below.

### D2 — `run-output.test.ts:57` vs `run-output.test.ts:69`

- **Files**: `bot/tests/run-output.test.ts`, tests "the compiled output command returns a large accepted output" (13.0 s, 1,048,577 + 1,048,578 bytes) and "the compiled output command preserves the exact retained byte boundary" (10.9 s, 1,048,576 bytes).
- **Overlap**: the same `run output --raw` path at *n* and *n+1* of a bound the file's own last test calls "the retired reader bound". There is no bound any more, so two cases straddling 1 MiB prove one thing between them.
- **Cut**: merge into one test at 1,048,577 bytes (root and named stage), delete the 1,048,576 case.
- **Proof remaining**: output above 1 MiB is returned byte-exact for both root and named stage, with no temporary-directory dependency (that test already sets an absent `TMPDIR`).
- **Risk**: low. If Ian wants the exact-power-of-two case kept as a regression witness, keep it and rely on D-ALL for the saving.
- **Saving**: ~10.9 s summed, ~1 s after D-ALL.

### D3 — `cli-worktree-lock.test.ts` (subprocess) vs `home-busy.test.ts` (in-process)

- **Files**: `bot/tests/cli-worktree-lock.test.ts` (33.7 s, 14 `busy()`/`answers()` calls, each a cold `node src/cli.ts` through `boundary.ts#piped`) and `bot/tests/home-busy.test.ts` (in-process through `invoke`, sub-second).
- **Overlap**: `home-busy.test.ts` already asserts `home busy --quiet` returning exit 0 with empty stdout/stderr for a live locked run and exit 1 for an unrelated directory, plus the human and JSON readings. `cli-worktree-lock`'s `answers()` helper asserts exactly `{ code, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }` for the same command, through a child process.
- **Cut**: convert the four record-and-heartbeat tests ("busy uses the named home…", "busy derives live directories…", "busy fails closed…", "busy treats every malformed live workdir…", 1.4 + 4.3 + 4.7 + 1.2 = 11.6 s) to `main()` with the injected boundary. The file already imports `main`.
- **Proof remaining**: everything. None of those four observes process identity, a signal, or a pipe; they read records and heartbeats and assert an exit code.
- **Keep as subprocess**: "a compromised run lock ends the record cleanly" (6.2 s) and "an event-loop stall records which run lock was compromised" (15.2 s). Lock ownership is per-process; these cannot be faked.
- **Risk**: low. The in-process path is the same `main` the child runs; `home-busy.test.ts` is the precedent.
- **Saving**: ~9 s summed, and it removes 12 cold CLI starts.

### D4 — `cli-lazy-model-runtime.test.ts:82` re-asserts twenty commands' contracts

- **File**: `bot/tests/cli-lazy-model-runtime.test.ts`, test "every Pi-free command plus help and version loads no Earendil module" (13.0 s of the file's 17.0 s).
- **Overlap**: it spawns twenty cold children in a **sequential** `for … await` loop and, for each, asserts the exit code *and* a stdout/stderr content fragment. Every one of those twenty contracts is already owned by a dedicated file: `capabilities.test.ts`, `home-busy.test.ts`, `run-show.test.ts`, `run-list.test.ts`, `run-checklist.test.ts`, `run-events.test.ts`, `run-output.test.ts`, `run-record.test.ts`, `run-request.test.ts`, `run-session.test.ts`, `run-check.test.ts`, `cli-assembly-management.test.ts`. The unique proof here is one assertion: `result.loaded.filter(s => s.includes(PI_PACKAGE))` is empty.
- **Cut**: keep the module-load assertion and the exit code (cheap, and it proves the child did not crash before loading anything); drop the `contains` content re-assertions; run the twenty invocations with `Promise.all` instead of sequentially.
- **Proof remaining**: the complete Pi-free inventory is still enumerated and each command still runs as a real child that loads no Earendil module.
- **Risk**: low. The parallel change alone is risk-free; the content-assertion removal shifts those proofs to files that already carry them.
- **Saving**: ~10 s of the 13 s, mostly from parallelism.

### Not duplicates, checked and cleared

- `ordinary-cli-output.test.ts` (subprocess, real runs through real pipes) vs `ordinary-output.test.ts` (in-process `OrdinaryOutput` unit) — different layers, no overlapping assertion.
- `examples-gate.test.ts`, `spec-record-vocabulary.test.ts`, `project-script-adoption.test.ts`, `project-settlement-adoption.test.ts` — these test the gate scripts against synthetic fixture repos. They do not re-run the gate over this repo.
- `conformance.test.ts` vs everything else — no vitest file re-asserts a corpus case.

## Subprocess tests convertible in-process

36 files use child processes. Most are justified: a real child is the only way to prove signal handling, process-group cleanup, closed pipes, exit codes after a lingering handle, lock ownership across processes, and module-graph laziness. The convertible ones, ten most expensive:

| s | file / test | why it converts |
| --- | --- | --- |
| 4.7 | `cli-worktree-lock` "busy treats every malformed live workdir as unknown ownership" | reads records, asserts exit code |
| 4.3 | `cli-worktree-lock` "busy derives live directories from run records and heartbeats" | same |
| 1.4 | `cli-worktree-lock` "busy uses the named home for a live run and creates no holder registry" | same |
| 1.2 | `cli-worktree-lock` "a live root stage owns the run root and no unrelated directory" | same |
| ~1.0 | `cli-worktree-lock` "busy fails closed when a live run's child tree cannot be traversed" | injected traversal fault, no process identity |
| 3.3 | `spec-record-vocabulary` "the spec gate rejects a documented constructor field removed from the spec" | the gate's node block could be imported, but it is authored as a heredoc inside `sdlc/scripts/spec`; converting means extracting it to a module — worth a separate ticket, not this one |
| 3.6 | `spec-record-vocabulary` "the spec gate rejects a constructor field added without documentation" | same |
| 2.8 | `spec-record-vocabulary` "the root check rejects a documented record field absent from RecordEvent" | same |
| 2.1 | `cli-lazy-model-runtime` "authentication import resolves Pi's agent directory before refusing a missing source" | the refusal is already proved in `cli-auth-import-contract.test.ts`; only the resolution order needs the child |
| 1.9 | `cli-lazy-model-runtime` "model listing constructs the real Pi runtime after dispatch" | needs the child (module-load observation) — keep |

Convertible without argument: **5 tests, ~12.6 s**. Convertible with a small refactor of `sdlc/scripts/spec`: 3 more, ~9.7 s. Everything else that spawns should keep spawning.

## Repetition and fixture waste

- **Repetition loops in the ordinary suite: none worth moving.** The ten-times repetition hunt already lives where it belongs — `sdlc/scripts/platformcheck` repeats `install-refuses-a-non-assembly` and `subflow-local-signal` ten times each, outside `make check`. `fuzz-reader.test.ts` runs 120 deterministic seeds in 1.60 s; `fuzz-regressions.test.ts` 12 cases in 2.26 s. Both are cheap and both earn their place. Leave them.
- **Deliberate waits, 26.3 s of the suite, one parked core each.** `cli-auth-logout-contract` "waits through an eleven-second Pi file lock" sleeps 11,000 ms to prove Pi's lock blocks (11.1 s). `cli-worktree-lock` "an event-loop stall" sets `BOT_SIGNAL_STALL_MS=13000` and then waits for a lock to go stale (15.2 s). These cost almost no core time and are not today's wall floor (`run-output` at 49.8 s is). After the buffer fix they become the two longest tests and set a ~15 s floor, which is fine. Do not cut them; they prove things nothing else does.
- **Fixtures: 178 files use `afterEach` cleanup, 0 use `beforeAll`.** Every test builds its own `mkdtemp` home from scratch. The per-test cost is small (143 files finish inside one second) and the isolation is worth it. The measurable cases are files with many tests over one shape: `cli-auth-import-contract` (37 tests, 5.8 s), `fanout-runtime` (27 tests, 10.0 s), `raw-record-races` (26 tests, 3.8 s), `hostile-gating` (22 tests, 6.9 s) — roughly 0.15–0.37 s per test. A `beforeAll`-built read-only template copied per test would recover maybe 5–8 s across the suite and would trade isolation for it. **Low priority; I would not spend the risk.**
- **`generate-specification.mjs` runs three times per gate** (once in `sdlc/scripts/lint`, once inside each of the two Astro builds) and **Astro builds twice** (`sidebar.test.mjs` and `redirects.test.mjs` each call `buildSite()` at module top level, in separate `node --test` processes so nothing can be shared). Merging those two files into one gives one build. Cost is ~25 s of CPU; wall saving is near zero today because the two builds overlap, but it frees a core and a half for ten seconds.

## Coverage and workers

### What the summary gate actually enforces

`bot/scripts/verify-coverage-summary.mjs` is the script that prints `coverage-summary: 124 production modules across four dimensions.` It fails on exactly three things:

1. the summary is unreadable JSON, or has no `total` object;
2. **inventory mismatch** — every `src/**/*.ts` file on disk must appear as a key in `coverage-summary.json`, and no key may name a file that is not on disk;
3. every entry, `total` included, must carry `lines`, `branches`, `functions`, `statements`, each with finite numeric `total`, `covered`, `skipped`, `pct`.

**It enforces no threshold and no ratchet.** It never compares a percentage to anything. A module with 0 % coverage passes. The ratchet in this repo is `sdlc/ratchet.json` (18,817 non-blank lines of `bot/src`), which is a *size* ceiling checked at lint time and has nothing to do with coverage.

So what the gate buys is: "every production module is reachable by the instrumented run and reported." That is a real property — it catches a module that is dead, unreferenced, or excluded — but it is a property of the *inventory*, not of the tests, and it does not change between two runs of the same commit. It does not need to run on every local gate. It needs to run once per commit that lands.

Instrumentation costs **69.3 s of wall (132 %) and 277.7 s of summed test time (65 %)** per run, paid roughly twenty times today.

### Workers

Vitest 4.1.11 defaults to `Math.max(availableParallelism() - 1, 1)` for a non-watch run — **15 workers on this box** — and each worker may spawn its own CLI children on top. Measured average was 11.2 cores for 52 s.

Wall time is `max(longest_file, total_cpu / workers)`. With 586.7 s of CPU and a 49.8 s longest file:

| workers | predicted wall | check |
| --- | --- | --- |
| 15 (default) | max(49.8, 39.1) = ~52 s | observed 52.36 s ✓ |
| 8 | max(49.8, 73.3) = **~73–78 s** | +21 s, frees 7 cores |
| 4 | max(49.8, 146.7) = **~147–155 s** | +95 s, too much |

After the buffer fix (CPU ~490 s, longest file ~27 s): 8 workers lands at ~61 s, 4 workers at ~123 s.

**A cap of 8 is nearly free. A cap of 4 is not.** Recommend 8, overridable by environment so the hosted runner stays uncapped.

### The concrete config change

`bot/vitest.config.ts`:

```ts
import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// A shared machine: half the cores by default, the whole box when a hosted
// runner sets BOT_TEST_WORKERS. The suite's wall floor is its longest file,
// so halving the workers costs about twenty seconds and frees seven cores.
const workers = Number(process.env["BOT_TEST_WORKERS"] ?? "")
  || Math.max(2, Math.floor(availableParallelism() / 2));

export default defineConfig({
  test: {
    globalSetup: "tests/test-temp-directory-setup.ts",
    testTimeout: 180_000,
    hookTimeout: 180_000,
    maxWorkers: workers,
    coverage: { /* unchanged */ },
  },
});
```

`bot/Makefile`:

```make
.PHONY: check lint catch-budget typecheck test coverage knip cycles ratchet pinned-deps install fuzz

check: lint catch-budget typecheck test knip cycles ratchet pinned-deps

test:
	npm run test

# The inventory proof: every production module is reported across four
# dimensions. It does not change between two runs of one commit, and it costs
# 132% of the suite's wall time, so it is the completion gate's, not every
# local gate's.
coverage:
	npm run test:coverage
```

`sdlc/scripts/test` keeps `exec make -C "$REPO/bot" test`; the completion gate and the hosted check gain `make -C bot coverage`. **This changes the gate contract that completion records cite, so it is Ian's to approve.**

## Proposed ticket scope

Prioritized, with expected savings measured against today's instrumented 121.67 s wall / ~1,170 s CPU per gate.

1. **Replace megabyte `toEqual`/`toMatchObject` on Buffers with `Buffer.equals` plus a length check.** ~20 assertion sites across `request-limit`, `run-output`, `run-request`, `session-pagination`, `cli-exit`, `run-record`. Files: 0 deleted. Tests: 0 deleted. **Saving: ~80 s of summed test time and ~22 s of wall, uninstrumented; roughly double that instrumented.** Zero quality risk — byte identity is still asserted, and the failure message improves (a 1 MiB vitest diff is unreadable anyway). Mechanically enforceable afterwards with an eslint rule banning `toEqual` on a `Buffer`.
2. **Make coverage its own Make target and drop it from `make check`.** Files: 0. Tests: 0. **Saving: ~69 s wall and ~278 s of test CPU per gate, times however many gates run.** Risk: the inventory proof stops running locally. Mitigation: it runs on the completion gate and the hosted check, where it belongs. **Needs Ian's ruling — it changes what a completion record's `make check` means.**
3. **Cap `maxWorkers` at half the cores, overridable by `BOT_TEST_WORKERS`.** **Cost: ~+21 s wall. Benefit: peak 15 cores → 8, so two gates can run side by side without either timing out.** This is what actually fixes the reported `hostile-gating` and `cli-auth-import-contract` timeouts under cross-worktree load. Risk: none to correctness.
4. **D1 + D2 + D3 + D4.** Files: 0 deleted, 2 tests deleted (D1, D2), 5 tests converted in-process (D3), 1 test parallelised and trimmed (D4). **Saving: ~36 s summed before item 1, ~15 s after it, and 32 fewer cold CLI starts.** Risk: low, argued per group above.
5. **Merge `docs/scripts/sidebar.test.mjs` into `docs/scripts/redirects.test.mjs`** so one Astro build serves both. **Saving: ~25 s of CPU, near-zero wall.** Risk: none; both read the same `dist`.
6. **Process, not code: one broad gate per repository at a time, run by the primary agent after code review accepts; reviewers run focused files only.** This is lever 1 of the issue file and needs no change here. It is worth more than items 1–5 combined, because it divides everything above by twenty.

Combined effect of 1–5 on one gate: **121.7 s wall → ~60 s, ~1,170 s CPU → ~490 s, peak 15 cores → 8.**

### The one thing that must not be cut

**`bot/tests/conformance.test.ts` and the 143-case corpus under `specification/conformance/`, together with `tests/conformance-passing.txt`.** It is the executable form of the product, it proves every refusal code the reader can reach, its ledger makes "143/143" mean "every discovered case passes" rather than "143 cases pass", and it costs 0.798 seconds. Nothing in this audit touches it. The same protection extends to the real-subprocess boundary tests (`cli-signal-boundary`, `cli-exit`, `raw-record-races`, `ordinary-cli-output`, `cli-invocation-guard`, and the two lock tests in `cli-worktree-lock`): they prove signal delivery, pipe closure and cross-process lock ownership, which no in-process call can prove, and converting any of them would be a real loss.

## What I ran

Read-only for the tree; nothing was edited or committed. `git status --porcelain` shows only the pre-existing untracked `sdlc/tickets/0286-scrub-provider-reports.md`.

1. Read `sdlc/issues/2026-09-14-gate-cost-on-shared-machine.md`, `sdlc/scripts/{spec,lint,test,platformcheck,ratchet.mjs}`, `sdlc/ratchet.json`, `bot/{Makefile,package.json,vitest.config.ts}`, `bot/scripts/{run-coverage.mjs,verify-coverage-summary.mjs}`, `specification/conformance.md`, `bot/tests/{conformance.test.ts,boundary.ts,invoke.ts,cli-boundary.ts}`, `docs/scripts/build-site.mjs`, and the hot test files named above.
2. `uptime` before starting — load average 0.33, the box was idle.
3. **One** run: `npx vitest run --reporter=json --outputFile=…/vitest-timing.json --coverage.enabled=false` under `/usr/bin/time -v`, from `bot/`. 52.36 s wall, 494.37 s user + 92.33 s sys, exit 0, 143/143 conformance. JSON kept at `…/scratchpad/vitest-timing.json`.
4. **One** run: `node --test docs/scripts/*.test.mjs scripts/*.test.mjs` under `/usr/bin/time -v`. 19.77 s wall, 71.30 s user + 29.43 s sys, exit 0. Log at `…/scratchpad/nodetest.log`.
5. Computed from the JSON: per-file and per-test durations, the twenty slowest files, the summed file time, and the time held by files that spawn children.
6. `grep -cE '\b(spawn|spawnSync|execFile|execFileSync|fork)\b'` across `bot/tests/*.ts` — 146 sites in 35 files, 36 files once `boundary.ts` importers are folded in.
7. One four-test throwaway vitest file in the scratchpad to measure `toEqual` / `toStrictEqual` / `toMatchObject` / `Buffer.equals` on 1 MiB Buffers. Deleted afterwards.
8. Read `node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js` to confirm the default worker count formula.

I did not run `make check`, did not run the suite twice, and did not run `platformcheck`.
