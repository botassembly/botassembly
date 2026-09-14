# Adversarial review — botassembly tickets 0270, 0272–0280

Repository `/home/ian/workspace/repos/botassembly` at HEAD `084c956`. Read-only review.

## Verdict

This batch is unusually well executed: on every load-bearing behavioural claim I could test, the shipped code does what its record says, and the tests are overwhelmingly real red-green behaviour proofs with live tripwires and hostile-mutation tables rather than ceremony. I confirmed no high-severity defect; the eight medium findings are an undisclosed 1 MiB/4 MiB mismatch between tickets 0276 and 0278, a row that `bot assembly check` emits and would itself refuse, a private-file boundary in 0277 that is weaker than its record implies, a process-global raw-output latch, a superlinear cost in the new reachability report, and lint exemptions left behind for modules ticket 0272 deleted. The one thing that cannot be reviewed at all is history: ticket 0272 rewrote the repository root, so the `base` SHAs in the records for 0270 and 0272 name objects that no longer exist here.

## Confirmed defects

### M1 — A child request over 1 MiB can never be verified, so its ancestor is permanently `partial` (medium)

Ticket 0276 admits requests up to 4,194,304 bytes (`bot/src/request-limit.ts:1`). Ticket 0278's child-agreement check reads the child's retained request through `heldRunFile` (`bot/src/child-record.ts:43`), which caps at `INSPECTION_MAX_BYTES = 1024 * 1024` (`bot/src/run-files.ts:14`, enforced at `:246` and `:253`). Resume was deliberately moved off that cap onto `boundedHeldRunFile(…, REQUEST_MAX_BYTES)` (`bot/src/continuation.ts:228`); the consumption reader was not.

Failure scenario: a subflow child is born with a legal 2 MiB request. `heldRunFile` returns `{kind:"too-large"}`, so `requestAgrees` returns false (`child-record.ts:44`), `childRecordAgrees` returns false, `acceptedChild` returns undefined (`bot/src/run-consumption.ts:105-106`), and `descendant` returns `partial` (`:122`). The child's tokens are silently dropped and the parent's `tokensStatus` is `partial` forever, for a tree in which nothing is wrong. Record 0278 attributes `partial` to "duplicate, conflicting, malformed, false-start, hostile, missing, unreadable, invalid, unsupported, or disagreeing child evidence" — a perfectly valid large request is none of those, and the interaction is nowhere disclosed.

### M2 — `bot assembly check` emits an `input` row that `bot assembly check` would refuse (medium)

`bot/src/check.ts:321-326` (`inputs`) unions differing inputs across traversal states into the plain `input` array with no marker, while `bot/src/check.ts:313-319` (`values`) gives differing outputs a distinct `possible_outputs` field (`:336`). The asymmetry ships in the conformance corpus. `specification/conformance/accept/descend-depth/expected.jsonl:5`:

```json
{"stage":"03-compose","flow":"flows/artifacts","type":"STAGE","input":["<item>.txt","<item>.json"], …}
```

That stage receives exactly one input — `<item>.txt` or `<item>.json` depending on which fan-out definition resolved. The immediately preceding `02-spread` row reports the same ambiguity honestly as `"output":"<item>.txt","possible_outputs":[…]`.

Worse, the union is a shape `check` rejects when authored: `bot/src/check.ts:80-90` (`checkCollision`) strips the extension, so `<item>.txt` and `<item>.json` both reduce to source `<item>` and raise `input-collision`. The collision check runs per render, never on the merged row. A machine reader — including the docs `AssemblyExplorer` — will read two concurrent inputs where there is one. Record 0279's sentence about preserving differing artifacts covers outputs only.

Lever: add `possible_inputs` symmetric with `possible_outputs`, or keep `input` at the first variant.

### M3 — Ticket 0277's read-only open buys no safety (medium)

`/home/ian/workspace/repos/botassembly/bot/src/model-runtime.ts:92`:

```ts
const handle = await open(path, constants.O_RDONLY).catch(() => { … });
await handle.close().catch(() => { … });
```

No `O_NOFOLLOW`, no post-open `fstat` dev/ino comparison against the `lstat` at `:86`, and the handle is discarded — Pi then re-opens the same path by name. The correct pattern is 70 lines away: `bot/src/run-files.ts:240-246` opens `O_RDONLY|O_NOFOLLOW|O_NONBLOCK` and rechecks dev/ino; `bot/src/auth-import-command.ts:439` re-verifies a snapshot.

Failure scenario: anything winning the window between the `lstat` and Pi's own open swaps `models.json` for a symlink to an attacker-controlled file carrying a `!command` provider value, which then runs with the operator's full filesystem and network authority. The behaviour is disclosed ("pathname races remain accepted limits"), but the record's "the accepted implementation uses a read-only open and awaited close" reads as a mitigation. It is a readability probe.

### M4 — No ancestor of the Pi agent directory is validated (medium, non-default paths)

`bot/src/model-runtime.ts:73-79` validates `agentDir` and stops. Probed and confirmed accepted: a 0700 agent directory inside a world-writable parent; one reached through a symlinked parent component; one with mode `02700`.

Failure scenario: `PI_CODING_AGENT_DIR=/srv/shared/agent` on a multi-user host where `/srv/shared` is group- or world-writable. Bot validates `agent` and passes; another account `rename()`s it aside and drops in its own 0700 directory holding a `!command` `models.json`. That is a **cross-account** race, outside the "same-account replacement and pathname races" caveat the record and ADR 0030 claim as the accepted limit. Default `~/.pi/agent` is unaffected.

### M5 — `rawProcessOutput` is a process-global latch set by commands that are not raw (medium, latent)

`bot/src/process-output.ts:84` sets `rawProcessOutput = true`, and `:112-115` makes `exitFlushed` take a branch that never drains the `OrdinaryOutput` queue and never confirms a stdout flush at all. Pre-0276 `exitFlushed` always did `process.stdout.write("", flushed)`.

`--raw` is optional on `bot run output` / `bot run request` (it is merely filtered out of the argument list at `bot/src/run-output-command.ts:43,82,95`), and `copyVerifiedOutput` always invokes the destination factory (`bot/src/verified-output.ts:57` → `source.copy(destination)`), so a plain `bot run output RUN` flips the latch too.

Failure scenario: any command that calls `boundary.rawStdout()` and afterwards writes ordinary bytes through `boundary.stdout` loses them at `process.exit`. I traced every current call site and none does — `run-check-command.ts:246` writes stdout only on the non-raw branch, and failures always route to stderr — so nothing is broken today. The invariant protecting it is expressed nowhere and tested nowhere. The latch is also never reset, so inside one vitest worker a single raw test puts every later `exitFlushed` on the raw branch.

### M6 — Dead eslint overrides for the modules ticket 0272 deleted (medium)

`/home/ian/workspace/repos/botassembly/bot/eslint.config.js:266-271` and `:272-277`:

```js
{ files: ["src/stored-git-secrets.ts"],        rules: { "complexity": ["error", 43] } },
{ files: ["tests/stored-git-secrets.test.ts"], rules: { "complexity": ["error", 18] } },
```

Neither file exists. Ticket 0272's own scope says "Remove their lint exceptions" (`sdlc/tickets/archive/0272-established-secret-scanner-gates-publication.md:27`); it was not done, and the record does not mention it. Any future file at either path silently inherits a 43-branch complexity allowance.

The second-order finding is the process gap: the repo validates catch-budget keys against the resolved config (`bot/scripts/check-catch-budget.mjs:73,83`) but nothing validates that an eslint `files:` pattern resolves to a real path, which is why a full gate passed. `bot/eslint.config.js:229-233` is the same shape for `tests/probe.test.ts`, which also does not exist — only `src/probe.ts` is a virtual lint target (`bot/scripts/check-lint-rules.mjs:33-54`). That one predates this batch.

### M7 — `bot assembly check` is superlinear and slow on modest recursive assemblies (medium)

`bot/src/check.ts:231-248` (`reachableFlows`) and `:359-377` (`procedureRows`). `agentScopes` (`:219-229`) calls `scopedSubflows` once per node per traversal state, and each call allocates `new Map(assembly)` (`bot/src/subflow-scope.ts:13`); `procedureRows` then renders **every** traversal state through the full `renderSequence`/`resolvedOptions`/`visibleSkills` path, and `consolidateRows` does `JSON.stringify` comparisons across all variants.

Measured with synthetic assemblies of assembly-scope `DESCEND` flows at `max-depth: 11`:

| flows | stages each | rows reported | time |
|---|---|---|---|
| 16 | 6 | 119 | 1.5 s |
| 20 | 6 | 147 | 3.9 s |
| 24 | 6 | 175 | 7.4 s |
| 20 | 10 | 231 | 13.2 s |

Instrumented, the 20×6 case does 108,120 queue pushes and renders 1,101 states, up to 55 for one flow. Failure scenario: an author with ~40 assembly-scope recursive subflows runs the read-only, no-model command the README tells first-time users to run, and waits about a minute for a ~300-row report. It terminates — the walk is correctly memoised on `(flow, callPosition, selfDepth)` with both bounded at 11, so there is no blowup or hang — but nothing bounds the constant factor and no test exercises any scale above the 10-deep chain fixture at `bot/tests/assembly-procedure.test.ts:126-164`.

Cheapest lever: memoise `scopedSubflows` per `(flow, stage, selfDepth, callPosition)`, and render once per distinct *rendering-relevant* state rather than once per traversal state.

### M8 — Shipped example transcripts are unverified prose, and they are the docs site's source of truth (medium)

`/home/ian/workspace/repos/botassembly/sdlc/scripts/examples:54` redirects check output to `/dev/null` and asserts exit status only. `bot/tests/examples-gate.test.ts` tests the gate script's own plumbing. `docs/scripts/extract-walkthrough.test.mjs:152-163` parses the README's fenced block and asserts its *structure* (six rows, stage names, an `options=intelligence=default` prefix) — it never runs the real command and compares.

Drift already happened undetected. At the pre-0279 base `6664e73`, `examples/hello/README.md` showed `options=intelligence=default@assembly,…` while the renderer at that same commit (`git show 6664e73:bot/src/assembly-check-command.ts:81`) emitted `${name}=${value.value}` with no `@rung` suffix. Ticket 0279 rewrote the transcript and it now matches byte-for-byte — care, not a check.

This matters because `docs/scripts/walkthrough-steps.mjs:27` (`CHECK_SOURCE = 'triage/README.md'`) carries that block verbatim into the published site's walkthrough. A wrong README publishes a wrong site while `make check` stays green. Lever: `sdlc/scripts/examples` already runs the exact command — capture stdout and diff it against the README block instead of discarding it.

### Low

- **L1** — Dead parameters left by ticket 0278. `bot/src/run-list.ts:191` `humanValue(summary, field, _now)` is fed from `:201` and `:209` and threaded through `markdown` (`:206`), `cellWarnings` (`:199`), `scan` (`:243`), `pageResult` (`:273`), `inspected` (`:316`) and the exported `inspectRunList(home, query, now)` (`:325`). Same for `runsLines(runs, _readingAt)` at `bot/src/inspection.ts:125`, fed from the exported `inspectRuns(…, readingAt)` at `:188`. `elapsedAge` was deleted from `bot/src/table.ts`; its input plumbing was not.
- **L2** — `bot/src/check.ts:351` emits `child_options` unconditionally while the sibling `child_input` (`:352`) and `child_outputs` (`:353-354`) are difference-gated. Every recursive flow's rows carry a duplicate options object, pushing sooner against `result-oversized` (`bot/src/assembly-check-command.ts:175-178`).
- **L3** — `bot/src/graph.ts:394` writes `maxDepth` onto the `Flow` even when `validateData` already recorded `value-invalid`. Probed: `max-depth: 12` yields `flow.maxDepth === 12`, `max-depth: 1e400` yields `Infinity`. Faults are fatal on every path I traced and `bot/src/subflow-scope.ts:12` caps recursion regardless, so this is missing defence in depth, not a live bug.
- **L4** — `bot/src/documents.ts:74-84`: the `size > maximum` test is at line 81, *after* the read loop, so an oversized task file costs 4 MiB of pointless I/O and allocation that `fstat` already proved unnecessary. Related: a file whose `stat` reports size 0 but has content yields `capacity = 0` and returns an empty `{kind:"read"}` rather than a refusal.
- **L5** — `bot/src/model-runtime.ts:78` masks with `& 0o777`, discarding setuid/setgid/sticky. Mode `02700` is accepted although ADR 0030 says "exact mode 0700".
- **L6** — `bot/src/run-consumption.ts:116-120`: `visited` is unreachable. `relative` is the accumulated tree path, unique per node by construction, and duplicate children are already rejected at `:95`. It reads as cycle protection and protects nothing; the real protection is the intermediate-symlink refusal at `bot/src/run-files.ts:95`.
- **L7** — `bot/src/subflow-runtime.ts:221` computes `childDepth` before the `flow === undefined` early return at `:224`, which cannot use it.
- **L8** — `bot/src/process-output.ts:35-57` hands the first chunk to `process.stdout` synchronously but defers every later chunk behind a write callback plus `setImmediate`, while stderr (`bot/src/cli.ts:96`) goes straight through. A command emitting stdout, stderr, stdout would interleave wrongly on a shared terminal. Unreachable today — all 29 `boundary.stdout(` call sites emit one pre-joined chunk.
- **L9** — Test-only seams in production. `BoundedReadHooks` (`afterRead`, `observeRead`) at `bot/src/documents.ts:72` exists solely for `bot/tests/request-limit.test.ts:60,73`; `bot/src/invocation.ts:262` passes no hooks.
- **L10** — Ticket 0276's own risk note says a stdin overflow "can close the pipe while its producer is still writing, so the producer may receive `EPIPE`." `bot/src/stdin.ts:14-18` only removes listeners; it never pauses or destroys. `bot/tests/request-limit.test.ts:90` asserts the opposite (`writableEnded === false`).
- **L11** — Unbounded, quadratic descendant walk. `bot/src/run-files.ts:84-102` (`walk`) re-`lstat`s every path component per record and `unchanged` (`:63-68`) does it again, so a chain of depth *N* costs O(N²). Measured: one `readRunState` at depth 30 took 1.6 s, at depth 120 took 15.4 s. A realistic worst legal case (20 runs × depth-10) is 453 ms. The lever is a hand-edited or restored `runs/` tree, after which `bot run list` stalls for minutes; termination rests on `PATH_MAX`. Record 0278 calls the missing cutoff deliberate but does not disclose the cost.

## Record inaccuracies

- **R1 — The base SHAs for 0270 and 0272 do not exist here.** `sdlc/records/0270-…md` cites base `34b83f19…`; `sdlc/records/0272-…md` cites `43bd32cf…`. `git cat-file -e` fails on both. Ticket 0272 rewrote history: `git rev-list --max-parents=0 HEAD` returns `2adb9717…` — 0272's own head is the root — and the whole repository is 25 commits. The 0272 record says the tree became a new root, but neither record warns that its cited base is unreachable. Those two tickets cannot be reviewed as diffs from this checkout; I verified them against the resulting tree only.
- **R2 — Record 0272's Darwin arm64 hash is 65 hex characters.** It states `b40ab0ae…a9aeb6a5c`, which is not a SHA-256. `sdlc/scripts/install-gitleaks` pins `…a9aeb6a5` (64 characters, no trailing `c`). The shipped pin is correct; the append-only record carries a typo in a supply-chain hash.
- **R3 — "uses a read-only open and awaited close" overstates what 0277 bought.** See M3.
- **R4 — "The Pi package root remains Bot's only model-runtime import" (0270).** Several modules statically import Pi subpaths as values: `bot/src/credentials.ts:9` (`@earendil-works/pi-ai/providers/all`), `bot/src/harness.ts:21` (`@earendil-works/pi-agent-core/node`), `bot/src/run.ts:3`. The *enforced* property — no Pi-free command loads any `@earendil-works` module — is real and well proved; the sentence is not accurate.
- **R5 — 0278's limitation paragraph omits a compatibility break.** `bot/src/record-story.ts:202` now rejects the whole record when `run_end.ts` parses earlier than `run_start.ts`. A historical run with backwards timestamps moves from readable to `invalid`, changing `bot run show` and `bot run list` output for it. The closing paragraph lists cost, no-cutoff, partial totals and timestamp width — not this.
- **R6 — 0278's `partial` causes are incomplete.** See M1.
- **R7 — 0279's artifact sentence covers outputs only.** See M2.
- **R8 — 0272's "scans ignored, untracked, modified, and ordinary working files."** I verified empirically that `gitleaks dir .` does read gitignored files. But `.gitleaks.toml:6-14` allowlists `.git/`, `.tools/`, `bot/node_modules/`, `docs/node_modules/`, `bot/coverage/`, `docs/dist/`, `docs/.astro/` and `bot/.bot-test-*`. The record mentions upstream exceptions, not this project's own path exclusions.
- **R9 — Minor wording.** 0280's "a dedicated hosted matrix" is a second job inside the existing `.github/workflows/runtime.yml`. Commit `6ecdb62` is titled "Bound platform test concurrency" but its `bot/tests/process.test.ts` hunk is the macOS `EPERM`/`EISDIR` admission. "Production TypeScript" throughout is really "everything under `bot/src`" — `sdlc/scripts/ratchet.mjs` has no notion of production versus support, it counts the directory.

### Verified TRUE (spot list)

- **0270** — no Pi-free command loads any `@earendil-works` module, proved by a real child-process module-load recorder over the complete command inventory.
- **0272** — Gitleaks 8.30.1, per-platform pinned SHA-256, `.gitleaksignore` refused, shallow repository refused, any stderr treated as failure (`sdlc/scripts/secrets`), gitignored files genuinely scanned.
- **0273** — `bot/src/access.ts` deleted; `access` (including `access: {}`) yields `key-unknown` via `bot/src/stage.ts:42,164` → `bot/src/documents.ts:309`, before model work and on resume, with a live tripwire (`bot/tests/retired-access-authoring.test.ts:49` proves the model *is* contacted on the control); record-1 readers retain `stage_start.access` and `tool_denied` with exact retained output.
- **0274** — the `flow === undefined` guard at `bot/src/subflow-runtime.ts:224` precedes `normalize()` (`:232`), the answer directory `mkdir`/`writeFile` (`:242`) and the child record path (`:253`); a mocked-`readFile` counter proves zero reads of the unavailable path with a valid sibling as control; batch numbering stable; four production lines; ratchet unchanged at 17,962. Reverting `subflow-runtime.ts` to base produces exactly the two failures the record describes.
- **0275** — `docs.yml` `check` is `uses: ./.github/workflows/runtime.yml`, `deploy.needs: [build, check]`, `examples/**` added, `runtime.yml` gained `workflow_call` while keeping `pull_request` and `push`. Docs build inputs really are only `docs/`, `specification/`, `examples/`.
- **0276** — one limit, `4 * 1024 * 1024`, inclusive, first refused byte 4,194,305 at all five gates (`invocation.ts:234`, `documents.ts:81`, `invocation.ts:273`, `stdin.ts:28`, `run-files.ts:271`); refusal before run birth for all sources and for resume; direct and task-file refusal before home access, and the home-trap test is non-vacuous (it makes `config.yaml` a directory and asserts byte-exact stderr); stdin rejects on the first excess byte with `writableEnded === false`; oversized donors stay raw-readable but cannot seed a resume; raw keeps its separate fixed-extent path and its own diagnostic; ratchet 18,142.
- **0277** — effective-user ownership via `process.geteuid` (`bot/src/model-runtime.ts:104-106`) with a real revert-catching test; modes exact `0700`/`0600`; symlinks refused via `lstat`; missing paths valid; per-route file selection real; the published migration shell is extracted verbatim from `docs/src/content/docs/reference/models.md` and executed by `docs/scripts/models-migration.test.mjs:12-17` (4/4 pass, wired into the gate).
- **0278** — unique-authorization-only descent (`bot/src/run-consumption.ts:95`); the `^request\.[A-Za-z0-9]{1,247}$` gate applied **before** any filesystem access (`bot/src/child-record.ts:42`), matching the writer's own generator (`invocation.ts:224,252`); unsafe addition → null; unsafe or negative duration → null (`bot/src/run-state.ts:24`); count mode reads no descendant fact (proved by a read spy); no `readdir` anywhere on the path.
- **0279** — one shared resolver (`bot/src/subflow-scope.ts`) with no surviving duplicate literal for the concept anywhere in `bot/src`; the depth formula is byte-identical between runtime (`subflow-runtime.ts:110-111`) and checker (`check.ts:244`); `max-depth` probed directly and refuses 0, 12, 2.5, `"3"`, `9007199254740993`, `Infinity`, `true`; shadowing precedence proved by fixture including the self-grant lapsing at maximum depth; a 4-flow mutual-reference cycle yields 8 rows, no duplicates, 3 ms; pagination covers the combined rows (203 rows at limit 200, round-tripped); depth-11 and call-position-10 off-by-ones proved at runtime (`bot/tests/subflow-depth.test.ts:66-87`); conformance fixtures compared byte-for-byte, 143/143.
- **0280** — `platformRefusal` admits only `linux`/`darwin`, WSL guidance for `win32`, generic otherwise (`bot/src/cli.ts:132-136`), applied in `main` before `admittedMain`, exit 2; what precedes it is exactly what the record discloses (env copy, `BOT_HOME` delete, output adapter, and a pure `join` in `credentialPath`); `sdlc/scripts/platformcheck` runs `make installcheck`, the examples gate, 16 named files each in a fresh process, then ten repetitions of two cleanup owners, with the full 38-invocation ordered contract and four exact fail-stop positions pinned by `scripts/platformcheck.test.mjs`; hosted matrix is `ubuntu-latest` + `macos-latest` on Node 22.22.0 with ten hostile mutations rejected. The four repair commits (`60f1838`, `6ecdb62`, `1c3bb52`, `d2b59b2`) are sound, not cover-ups: the bounded pipe assertion still proves every byte and its order, the `EISDIR`/`EPERM` admission is a genuine errno difference with the semantic proof retained, and the `/private/var` fix keeps both the space-bearing path and the full-path assertion.
- **Sizes** — every per-ticket ratchet number in the records matches `sdlc/ratchet.json` at that commit: 17,962 / 17,962 / 17,962 / 18,142 / 18,142 / 18,267 / 18,469 / 18,483.

## Weak tests

Most of this batch is strong. `bot/tests/cli-lazy-model-runtime.test.ts`, `bot/tests/request-limit.test.ts`, `bot/tests/subflow-unavailable.test.ts`, `bot/tests/ordinary-output.test.ts`, `bot/tests/assembly-procedure.test.ts`, `bot/tests/run-consumption-observation.test.ts`, `scripts/platformcheck.test.mjs`, `scripts/workflow-policy.test.mjs` and `scripts/runtime-workflow.test.mjs` all assert observable behaviour and carry live tripwires or hostile-mutation tables. The weak ones:

**Tests against a mirror rather than production**

- `bot/tests/record-event-shape.test.ts:190-196` — asserts against the test-side mirror `bot/tests/support/record-event-shape.ts`, not production. `accessOperations` was re-hardcoded into that mirror (`support/record-event-shape.ts:12`) after production `ACCESS_OPERATIONS` was deleted, so the mirror duplicates a rule that lives independently in `bot/src/legacy-record-events.ts` with nothing tying the two together. Only the first line touches production.

**Reachable only through injected mocks**

- `bot/tests/model-runtime.test.ts:341` and `:315` — the close-failure and open-failure branches cannot be produced by any real filesystem state on a euid-owned 0600 file. Branch-coverage ceremony.
- `bot/tests/model-runtime.test.ts:328` — mocks `fs.access`, which the shipped code no longer imports. Valid as a revert guard; proves nothing about real setuid behaviour.

**Would still pass with the feature reverted**

- `bot/tests/stage-identity-agreement.test.ts:75` and `bot/tests/cli-stage-workdir.test.ts:63` — both filter out `FLOW`/`DESCEND` rows, so they are blind to ticket 0279's definition rows.
- `bot/tests/ordinary-cli-output.test.ts:37-45` — asserts only that `bot run start -j` prints a `bot.run.result` under 65,536 bytes with empty stderr. True before 0276.
- `bot/tests/cli-exit.test.ts:63-69` — asserts only that `bot capabilities -j` parses and is under 1 MiB. True before 0276. (The `/dev/full` and `head -c 0` cases in the same file *are* real: on base, `cli.ts:89`'s old handler rethrew non-EPIPE and produced a stack, not the exact sentence.)
- `bot/tests/subflow-local-signal.test.ts:86` — I reverted `subflow-runtime.ts` to `b0a1072` and it passed all four cases while `subflow-unavailable.test.ts` failed both. It guards the future, not this change, and proves ordering only through an ENOENT proxy — it never shows a successful file input read and retained before the stop, which is what the record's "stopped valid calls retain their separate post-input ordering" claims.

**Assert position or count instead of content**

- `bot/tests/cli-profiles.test.ts:32`, `bot/tests/cli-profiles-chain.test.ts:26`, `bot/tests/cli-rung-precedence.test.ts:63`, `bot/tests/fanout-static.test.ts:48` — each hardcodes "the definition row is index 0" and shifts an index.
- `bot/tests/link-truth.test.ts:73` — `toHaveLength(1)` bumped to `toHaveLength(2)` with no assertion about the new row.
- `bot/tests/model-runtime.test.ts:226` — "a world-writable agent path fails" asserts only `rejects.toThrow(held.agent)`, any error naming the path. With `:143` (mode 0755) that is the whole agent-directory mode coverage, so a regression from exact-0700 to "no group/other bits" passes both. (`models.json` exactness *is* properly covered at `:302`.) `:236` is a stray blank line left by deleted assertions.

**Assert prose, or assert the fixture rather than the dependency**

- `bot/tests/spec-publication.test.ts:216-222` — four `toMatch` regexes over documentation prose; they assert word order in a paragraph.
- `bot/tests/examples-gate.test.ts:74` — the fixture's fake `bot` echoes `$PI_CODING_AGENT_DIR`, so the test proves the *script* exports that name. Nothing pins that name to Pi's own resolution (`ENV_AGENT_DIR` is derived inside the dependency). If Pi renamed the variable, the gate would silently inherit the operator's real Pi configuration and stay green — the exact failure ticket 0277 added it to prevent.
- `docs/scripts/models-migration.test.mjs:26-42` — running the published shell verbatim is genuinely good, but it asserts only mode, inode and content. Nothing feeds the migrated file back through `validatePrivateFile`. The same page requires an 0700 agent directory and never says how to repair one.
- `bot/tests/subflow-unavailable.test.ts:13-24` — the read witness mocks `readFile` from `node:fs/promises` only; `open`/`read`, `createReadStream` or `readFileSync` would slip past it. The artifact-absence assertions carry the real proof.

**Mislabelled**

- `bot/tests/run-consumption-observation.test.ts:101` — named "count mode reads no descendant record or request", but `:102-106` exercise the usage/JSON path and assert descendants *are* read. Only `:109-116` tests count mode.
- `bot/tests/cli-exit.test.ts:46` — `expect(held.touched).not.toHaveBeenCalled()` backs "no supplied boundary operation runs after `main` begins on a refusal", but `touched` is wired only to the `readStdin` and `clock` getters (`:24-32`); `cwd` and `env` are plain properties and would not trip it.

**Uncovered behaviour worth a test:** a symlinked descendant run directory escaping the run root (the defence at `bot/src/run-files.ts:95` holds — a fixture with such a symlink correctly yielded `tokensStatus: "partial"` — but nothing covers it; the "hostile" case at `run-consumption-observation.test.ts:119` uses `child: "../provider"`, which dies in `normalizedRunPath` before touching the filesystem); a symlinked agent directory; agent-directory modes with no world bits (`0750`, `0500`); a child request between 1 MiB and 4 MiB (M1); `bot assembly check` at any scale above ten flows (M7); and an example README transcript compared against real output (M8).

## Leftovers

- **Retired `access` declarations — clean.** `bot/src/access.ts` is gone and grep finds zero hits for `access-denied`, `accessDenied`, `changeToolResult`, `createBoundedFileTools`. No `access:` frontmatter outside `sdlc/`. `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `examples/`, `docs/` and `specification/elements/` carry no current-tense claim that the feature exists; `specification/elements/stage.md` lost its whole "## Access" section and invariants 34–37 were rewritten to point at `bot/tests/trusted-stage-tools.test.ts`. The surviving `tool_denied` references (`bot/src/legacy-record-events.ts`, `bot/src/record-story.ts:10-11`, `bot/src/readings.ts:178`, `bot/src/explain.ts:138`, `specification/elements/record.md:156`, `scripts/check-public-tree.mjs:66`) are all legitimate record-1 compatibility and `record.md:156` labels them so. The `access` hits left in `bot/src` are unrelated meanings (OAuth fields in `credentials.ts:30-31`, a Node error string in `tools.ts:298`, "network access" in `help.ts:198`).
- **Deleted secret detector and Git collector — clean in code, not in config.** `secret-detection`, `stored-git-secrets`, `secretDetection`, `storedGit` appear only in archived tickets and in the two dead eslint blocks (M6). `SECURITY.md:3`, `CONTRIBUTING.md:17` and `README.md:104` describe Gitleaks accurately, limits included.
- **Stale planning prose.** `sdlc/planning/notes/2026-09-11-prospective-user-review-and-twenty-questions.md:536` still says "The access configuration constrains direct model-facing tool dispatch" in the present tense. Outside the paths in scope, and a dated note rather than an active summary, but it is the only prose in the repo that still asserts the feature exists.
- **Dead modules and exports — none.** `npx knip --no-config-hints` exits 0, `madge --circular` finds none, `tsc --noEmit` is clean. Note knip's entry set is `src/spine.ts` plus tests, so an export used only by tests counts as used; a brute-force sweep of every `bot/src` export against `src/`, `tests/`, `scripts/`, `../scripts/` and `../smoke/` found no orphan either.

## Code health

Prioritised.

1. **Add a mechanical check that every eslint `files:` override pattern resolves to a real path.** M6 is the second-order finding: catch budgets, the ratchet, cycles, knip and pinned deps are all enforced mechanically, and this one class of drift has no check. `bot/scripts/check-lint-rules.mjs` already loads the resolved config, so the lever exists.
2. **Make the examples gate diff its own output** (M8). It already runs the exact command and throws the answer away.
3. **Reconcile the two request ceilings** (M1). `heldRunFile`'s 1 MiB `INSPECTION_MAX_BYTES` and `REQUEST_MAX_BYTES`'s 4 MiB now disagree on the same artifact, and the consumption reader is on the wrong side of it.
4. **Delete the dead `now` / `readingAt` plumbing** (L1). It crosses two public exports and will mislead the next reader into wiring a clock through.
5. **Two opposite rules for `repeat` in one 148-line file.** `bot/src/run-consumption.ts:51` defaults an omitted `repeat` to 1; `:17` deliberately treats omitted as distinct from 1. Both are what ticket 0278 asked for, but the divergence is uncommented at both sites.
6. **Two independent token-totalling implementations.** `bot/src/run-consumption.ts` requires all five counters present and safe; `bot/src/readings.ts:53` treats a missing counter as 0. They feed different surfaces, so `bot run show` usage detail and the `bot run list` tokens column can disagree for the same run. Ticket 0278 discloses the scoping difference, not the strictness difference.
7. **Small helper duplication.** `bot/src/process-output.ts:3` defines a private `errno()` identical to the exported `errorCode` in `bot/src/model.ts` that a dozen modules use. `bot/src/stdin.ts:5` hardcodes "The request exceeds the 4 MiB limit." rather than using `REQUEST_TOO_LARGE_SENTENCE` from the module it already imports.
8. **String-equality dispatch on a refusal sentence.** `bot/src/reader.ts:58` decides whether to skip home access by comparing `held.sentence === REQUEST_TOO_LARGE_SENTENCE`. A code plus a dedicated flag would be sturdier than matching prose.
9. **Structural equality via `JSON.stringify`.** `bot/src/check.ts:317` and `:350` deduplicate and compare row values with `JSON.stringify(a) === JSON.stringify(b)`, which is key-order sensitive. It works because one code path builds the rows; it is fragile by construction, and `check.ts:350` is on the hot path in M7.
10. **Module sizes are fine.** The largest is `bot/src/management.ts` at 696 lines with 45 functions; nothing is a god-module. No circular dependencies, no dead files, typecheck clean.
11. **Suite flakiness under load.** The full suite passed 1698/1698 for me on an idle machine, but a concurrent reviewer running it under load hit `bot/tests/hostile-gating.test.ts` ("an oversized response and output stay bounded and sealed", watchdog at `bot/tests/hostile.ts:47`), which then passed 22/22 in isolation. Records 0273 and 0276 each note the same class of one-off timing failure. `bot/vitest.config.ts` sets `testTimeout: 180_000`, which mostly masks it. The "complete local gate passed" claims are reproducible only on an otherwise idle machine.

## What I ran

- `git log --oneline -40`, `git rev-list --max-parents=0 HEAD`, `git rev-list --count HEAD`, `git cat-file -e <base>` for all ten cited bases, `git diff --stat` / `git diff` / `git show` for the eight reviewable ticket ranges and for `1c3bb52`, `6ecdb62`, `d2b59b2`, `60f1838`.
- `git show <sha>:sdlc/ratchet.json` for all eight reviewable heads; `node sdlc/scripts/ratchet.mjs` at HEAD (18,483/18,483, exit 0).
- `cd bot && npx vitest run` — **210 files, 1698 tests, all pass**, conformance 143/143, 94 s.
- `node --test docs/scripts/*.test.mjs scripts/*.test.mjs` — **150 tests, all pass**.
- `cd bot && npm run knip` (exit 0), `npm run typecheck` (exit 0), `npm run cycles` (no circular dependency). `docs/scripts/models-migration.test.mjs` in isolation (4/4). `scripts/platformcheck.test.mjs` (13/13).
- Empirical gitleaks probe in a scratch git repo: confirmed `gitleaks dir` reads `.gitignore`d files (planted `ghp_…` token found; the byte count covered all three files).
- Empirical POSIX probes against `validatePrivateFile` / `validateAgentDirectory`: world-writable parent, symlinked parent component, modes `02700`, `0750`, FIFO, symlinked `auth.json` and `models.json`.
- Empirical probes against `readAssembly` for `max-depth` values 1, 11, 0, 12, 2.5, `"3"`, `9007199254740993`, `1e400`, `true`.
- Timed `bot assembly check` on synthetic recursive assemblies (16×6, 20×6, 24×6, 20×10) with queue-push instrumentation; timed `readRunState` at descendant depths 30 and 120; built a symlinked-child-directory escape fixture and a 4-flow mutual-reference cycle.
- Reverted `bot/src/subflow-runtime.ts` and the nine 0276 source files to their bases in a throwaway state to confirm the records' red-green claims, then restored.
- Greps across `bot/`, `specification/`, `docs/`, `examples/`, `scripts/`, `smoke/`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `Makefile`, `.github/` for `access`, `tool_denied`, allowlist/deny-all/sandbox vocabulary, `stored-git-secrets`, `secret-detection`.
- I did **not** run `make check`, `sdlc/scripts/lint`, `make installcheck`, `make platformcheck` or `sdlc/scripts/install-gitleaks`: the first two regenerate files, and the installer needs the network.
- **Process note:** a parallel reviewer briefly reverted nine `bot/src` files as a red-green experiment. I restored with `git checkout -- bot/src`; `git status --porcelain --untracked-files=all` is empty and HEAD is `084c956`. Nothing was committed or pushed.

## Unverified suspicions

Not confirmed defects; I built no proof for any of them.

- `bot/src/record-story.ts:202` compares `Date.parse` of two timestamps. The writer only emits ISO-UTC (`bot/src/cli.ts:55`), so this is safe today. A hand-edited record mixing spellings (`"2026-09-14T10:00:00Z"` start, `"2026-09-14 06:00:00"` end, parsed as *local*) could flip a previously valid record to `invalid`. `NaN` comparisons also make the guard a no-op for an unparseable timestamp.
- Ticket 0277 validates `auth.json` and `models.json` only. Pi also reads `settings.json`, `tools/`, `bin/` and `themes/` from the same agent directory, and `tools/`/`bin/` hold executables. The 0700 directory check is the only thing behind them.
- `bot/src/process-output.ts:83-107` (`processRawStdout`) removes every `error` listener from `process.stdout` and restores them only from `final` or `destroy`. A raw pipeline constructed and abandoned without either would leave `OrdinaryOutput`'s listener gone and turn a later stdout error into an uncaught exception. Every current caller goes through `pipeline(...)` or `copyVerifiedOutput`, so I could not construct it.
- `deliveryExitCode` (`bot/src/process-output.ts:79`) treats only literal `"EPIPE"` as quiet. If macOS or WSL ever surfaces a destroyed stdout as `ERR_STREAM_DESTROYED` or `ECONNRESET`, a successful command whose reader closed early would exit 1 with a spurious diagnostic. Only the Linux paths are tested.
- `process.stderr` has no `error` listener in either version. If stderr is itself a closed pipe, `exitFlushed` at `:121-122` may trigger an unhandled `'error'`. Pre-existing.
- `docs/src/content/docs/reference/limits.md` attributes the 4 MiB bound to "the runtime" for "one fresh or resumed request". Subflow child requests are unbounded — `bot/src/subflow-runtime.ts:76-83` calls `readFile(path)` with no cap — so a child run is born with an arbitrarily large request. The record enumerates its five sources honestly; the docs table generalises past what ships.
- `OrdinaryOutput`'s queue (`bot/src/process-output.ts:9`) has no bound. `specification/elements/runtime.md:77` explicitly disclaims bounded memory for ordinary output, so this may be intended.
- The 2 GiB hosted heap exhaustion in ticket 0280 may not be fully root-caused. Both `d2b59b2` (per-file processes) and `60f1838` (bounded pipe assertion) landed, and the ticket's own narrative says the failure was isolated to `cli-exit.test.ts` *after* per-file isolation was already in. If `60f1838` was the real fix, `sdlc/scripts/platformcheck` now pays 36 vitest cold starts for a symptom that no longer exists — and per-file isolation permanently hides any future cumulative memory regression, since no file ever shares a heap.
- `scripts/installcheck.sh:18` computes `repo` with logical `pwd` while `:44` computes `physical_checkout` with `pwd -P`. They agree on Linux and hosted macOS passed, so the Make recipe evidently emits the physical spelling — but nothing pins that.
- The `win32` refusal is proven only through an injected boundary. On a real Windows process the entire static import graph of `cli.ts` runs first, and `cli.ts:174-175` calls `existsSync` and `realpathSync` before `main` is entered. There is no `windows-latest` CI leg (correctly excluded), so the claim that a Windows operator actually *sees* the WSL sentence rests on no imported module body throwing first.
- `sdlc/scripts/platformcheck:20` hand-maintains its 16-file list and `scripts/platformcheck.test.mjs:11-19` pins the same list a second time. A newly added signal or lock test will not join the platform owner, and nothing will notice.
