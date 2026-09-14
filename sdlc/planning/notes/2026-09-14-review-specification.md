# Specification audit — botassembly @ 084c956

Read-only. Nothing in the repository was modified.

## Verdict

The specification is unusually accurate for its size: all 24 record event types, all 8 cause words, all 40 refusal codes, the option rungs, the depth and byte bounds, the signal semantics, and the gate-75 contract were checked against `bot/src` and hold. The failures are concentrated in three places — the canonical exit-code table has been outgrown by the runtime, the machine-readable error vocabulary the spec promises is stable is almost entirely undocumented, and the invariant/conformance machinery has quietly acquired an undocumented exemption plus stale witnesses. Nothing found blocks a release, but the error-code gap and the `model-unresolved` exemption are the two items that make a second-runtime conformance claim unprovable as written.

Counts: 12 contradictions, 23 unspecified behaviors, 5 conformance gaps, 10 consistency problems, 5 readability notes.

---

## Contradictions

### C1. Exit codes 4 and 5 escape from a run; the canonical table says they cannot

- Spec: `specification/elements/runtime.md:25-32` — the exit-code table lists only `0`, `1`, `2`, `126`, `127`, `128+n`. `runtime.md:36` — "`2` is the run being impossible, whenever that is discovered." Invariant 23 (`specification/elements/invariants.md:87-91`) repeats it.
- Runtime: `bot/src/run.ts:316` — `if ("failure" in installation) return { exitCode: 5, cause: "fault", reason: installation.failure };`. `bot/src/run-mutation-command.ts:33` returns that code to the process in human mode; `:40` maps pre-start faults to `exit: integrity ? 5 : 4`. `bot/src/run-start.ts:20` exits 4 for a thrown pre-start dependency failure and `:153` exits 5 for an oversized result document.
- An invalid home identity record is precisely "the run is impossible", and `runtime.md:57` places that check before run birth, so the spec's own rule says it should be `2`.
- Counted mechanically: `grep -rhn "exit: [0-9]" bot/src/*.ts` yields `exit: 3` ×2, `exit: 4` ×4, `exit: 5` ×5. `bot/src/spine.ts:101` still declares `export type ExitCode = 0 | 1 | 2;`.
- `specification/elements/inspection.md:152,160,180,198` and `specification/elements/auth.md:57` document 3/4/5 for inspection and auth commands. Neither `runtime.md` nor `record.md` mentions 3, 4, or 5 anywhere (verified by grep). The stable chapter and the provisional chapter disagree about the process's own exit vocabulary.

### C2. The agent's `$TMP` is not the string the spec describes, and not the string the record holds

- Spec: `specification/elements/slots.md:7-9` — "The runtime exports them into the agent's environment and into every process the agent starts." `slots.md:162` — scratch "sits in a cache directory the runtime owns". `specification/elements/record.md:150-151` — `stage_start` "carries `slots`: the exact absolute strings supplied in its runtime environment".
- Runtime: `bot/src/invocation.ts:106` — `const TEMPORARY_HANDLE_DIRECTORY = "/tmp";` and `:110-112` — `join(TEMPORARY_HANDLE_DIRECTORY, \`bot-${hashBytes(backing)}\`)`. `bot/src/flow.ts:83` — `const slots = { ...backingSlots, TMP: tmpHandle, TMPDIR: tmpHandle };`. `bot/src/machinery.ts:199` — `const agentEnv = { ...context.env, TMP: context.slots["TMP"], TMPDIR: context.slots["TMPDIR"] };`, with the comment at `machinery.ts:197-198` stating it outright: "Hooks and gates keep the backing paths in `context.env`; only the agent's file tools and shell receive the short stage-slot handles."
- Consequences, all three unstated: (a) the agent sees `/tmp/bot-<sha256>`, a symlink in the machine's shared `/tmp`, not a runtime-owned cache path; (b) hooks and gates hold a different `$TMP` string than the agent for the same directory, so `slots.md`'s single-value claim and invariant 43 are false as written; (c) `bot/src/machinery.ts:166-169` `stageSlots()` reads `context.env`, so the recorded `slots.tmp` is the hook/gate value, not the agent's.
- `grep -rn "handle\|/tmp/bot\|socket" specification/elements/slots.md specification/elements/runtime.md` returns nothing relevant: the alias appears nowhere in the specification.

### C3. `model-unresolved` has no conformance case, in violation of invariant 50

- Spec: `specification/elements/invariants.md:147-152` — "Every refusal a runtime gives when it reads an assembly is a case in the corpus… [Managing the home] refuses what no case can hold… and those codes are named there." `model-unresolved` is in the Frontmatter table (`specification/elements/refusals.md:63`), not the Managing-the-home table, so it claims no exemption.
- Runtime: `bot/src/machinery.ts:119` — `fault(faults, "model-unresolved", node.path, unresolvedSentence(...))`, emitted while reading an assembly.
- Corpus: `grep -rh "model-unresolved" specification/conformance/*/*/expected.jsonl` returns nothing. The twelve `refuse/model-unresolved-*` directories all assert `intelligence-unresolved` or `key-unknown` instead; `specification/conformance/refuse/model-unresolved/expected.jsonl` reads `{"code":"intelligence-unresolved",...}`.
- The closure test passes only because of a hardcoded list: `bot/tests/conformance.test.ts:197` — `const runtimeOnly = ["model-unresolved"];`. `specification/elements/invariants-witnesses.md:117` boasts of row 50 that "the exemption is the specification's and is checked, not a list in the test file." That sentence is now false.

### C4. A `DESCEND.md` body is silently discarded

- Spec: `specification/elements/descend.md:7-12` — "`DESCEND.md` stands in the place of `FLOW.md`… The flow is otherwise ordinary… What the sentinel changes is one thing." `specification/elements/flow.md:41-43` makes a flow body the procedure shown to every stage.
- Runtime: `bot/src/graph.ts:368-370` — `function flowBody(sentinel: string, body: string) { if (sentinel !== "FLOW.md" || body.trim().length === 0) return {}; return { body }; }`. A descend flow never carries `flow.body`, and `bot/src/prompt-assembly.ts:76` then emits no Procedure section for any stage inside it. The sentinel changes two things.

### C5. `FANOUT.md` accepts eight keys, not four, and drops four of them

- Spec: `specification/elements/fanout.md:18` — "The sentinel has no body and exactly these four keys."
- Runtime: `bot/src/fanout-authored.ts:24` — `if (document.sound) validateData(document.data, file, faults, keys, keys);` leaves `optionNames` at its default `OPTION_NAMES` (`bot/src/documents.ts:315`), so `validateKeys` (`documents.ts:317`) also admits `timeout`, `retries`, `local-context`, and `intelligence`. `fanout-authored.ts:32` then returns `options: {}` and no runtime path reads a FanoutNode's options. An author writing `intelligence: cheap` on a fan-out gets neither a refusal nor an effect.

### C6. `bot auth list` describes three standings; the runtime has two

- Spec: `specification/elements/auth.md:85-90` — "The standing is one of three plain answers: signed in… from the environment, when it holds none and the environment answers instead; none, when neither does."
- Runtime: `bot/src/auth-list-command.ts:18` — `type AuthState = "stored" | "unobserved";`, set at `:107` with no environment lookup.
- This also contradicts the same file at `auth.md:42-47`, which describes the two-state form and says the command "never resolves ambient secrets". Lines 85-90 are stale text.

### C7. "A home that already exists is left as it stands" vs. the mandatory `0700`

- Spec: `specification/elements/home.md:115` — "a home that already exists is left as it stands."
- Runtime: `bot/src/home-installation.ts:53-54` — `return stat.isDirectory() && Number(stat.uid) === effectiveUser() && (Number(stat.mode) & 0o7777) === 0o700;`. A pre-existing home at `0755` fails installation-identity validation and refuses the run before run birth.
- `home.md:28` states the refusal, so the document contradicts itself; the runtime sides with `:28`.

### C8. Two incompatible definitions of a filename "stem"

- Spec: `specification/elements/refusals.md:98` — `$INPUT` collision uses "the stem… so `review.txt` and `review.json` collide". `refusals.md:73` — `hook-duplicate` uses "name before the first dot".
- Runtime: `bot/src/check.ts:83` — `const source = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;` (last dot) vs `bot/src/model.ts:284-286` — `const dot = name.indexOf(".");` (first dot).
- `notes.v2.txt` and `notes.txt` collide as hooks and do not collide as inputs. The specification uses one word for two rules.

### C9. `mark` evidence is never validated

- Spec: `specification/elements/runtime.md:239-240` and `specification/elements/checklist.md:55-57` — "a missing or empty one rejects the mark"; "A mark without nonempty evidence is likewise an error and leaves the item `todo`."
- Runtime: `bot/src/tools.ts:112-124` — `markTool.execute` validates the item number and `params.reason?.trim().length` for `skipped`, and never inspects `params.evidence`. The only guard is the provider-side schema `Type.String({ minLength: 1 })` at `tools.ts:49`, which accepts whitespace-only evidence where the `reason` path trims. `bot/src/run-checklist-command.ts:124` then reports that evidence as valid.

### C10. Child stdin is `/dev/null`, not written and closed

- Spec: `specification/elements/runtime.md:343-344` — "A runtime writes a child's stdin and then closes it."
- Runtime: `bot/src/process.ts:173` — `stdio: ["ignore", "pipe", "pipe"]`. The observable effect (immediate EOF) matches; the described mechanism does not exist.

### C11. The `$TMP` warning fires before the checks, not before settlement

- Spec: `specification/elements/runtime.md:189-191` — "Before a normally completed stage settles, inspect `$TMP`."
- Runtime: `bot/src/gating.ts:254` — `const warned = await warnForTmp(input, warning);` sits between the refusal test and `runChecks`, so the warning is issued on a round whose output may then fail its checks and be sent back. The once-only guard (`warning.sent`) means the round that actually settles gets no warning.

### C12. `--intelligence` with no value suppresses `intelligence-unresolved`

- Spec: `specification/elements/invocation.md:118-119` — "A missing intelligence row is refused (`intelligence-unresolved`) naming the requested name."
- Runtime: `bot/src/check.ts:105` — `if (runs && intelligenceTrouble !== undefined && !context.invocation.valueless.has("intelligence"))`, and the same guard at `check.ts:393`. A valueless `--intelligence` suppresses the refusal. The spec states no such exception.

**False positive I checked and rejected.** Two agents reported that `runtime.md:21`'s native-Windows refusal is unimplemented. It is implemented: `bot/src/cli.ts:132-136` `platformRefusal` and `cli.ts:165`. What *is* unstated is that the same function refuses every platform other than `linux` and `darwin`, not only `win32`.

---

## Unspecified behavior

### U1. The structured error vocabulary — the largest single gap

`specification/elements/inspection.md:198` promises that a JSON error "names the failed `run.list` operation, **a stable code and cause**". The specification then names three of them anywhere in its text (`home-not-found`, `home-invalid`, `cursor-invalid`, all at `inspection.md:196-198`). The error envelope shape itself — `bot/src/new-command-result.ts:41-44`, `{schemaVersion, kind:"error", error:{code, operation, cause, message, retryable, details}}` — never appears; the literal `"kind": "error"` is absent from `specification/`.

Verified absent from the whole `specification/` tree by grep: `option-repeated` (`bot/src/assembly-update-command.ts:60`), `value-missing` (`bot/src/auth-list-command.ts:44`), `too-large` (`bot/src/record-lines.ts:146`), `integrity-failed` (`auth-list-command.ts:27`), `record-invalid` (`bot/src/run-check-command.ts:179`), `cursor-snapshot` / `cursor-position` / `cursor-conflict` / `cursor-limit` (`bot/src/session-page.ts:93-94`, `bot/src/run-list-query.ts:26,166`), `session-too-large` (`bot/src/run-session-command.ts:89`), `source-changed` / `destination-changed` (`bot/src/auth-import-command.ts:52-53`), `result-oversized` (`assembly-update-command.ts:81`), `filesystem-error` (`run-check-command.ts:184`), `import-busy` / `removal-busy` / `update-busy` / `creation-busy`, `provider-catalog-unavailable` (`bot/src/auth-logout-command.ts:72`), `terminal-required` (`bot/src/auth-login-command.ts:215`), `stdout-delivery` (`run-check-command.ts:220`), `limit-invalid` / `offset-invalid` / `timestamp-invalid` / `field-unknown`, `option-unknown` / `argument-extra` / `argument-invalid` / `arguments-invalid`, `home-missing` / `home-changed` / `link-settled`, `run-missing` / `run-ambiguous` / `record-missing` / `selection-empty`, `bad-utf8`, `state-not-reached`.

A wide sweep of kebab-case literals in `bot/src` found 221 distinct strings, 156 absent from the spec; that sweep includes non-codes (test hook names, `proper-lockfile`, `utf-8`). A narrow sweep of literal `code:`/`cause:` assignments finds 27 codes with 13 absent. Most codes reach the envelope through helpers, so the true figure sits between. Either way: a program written against `bot --json` must read `bot/src` to learn what to branch on.

### U2. `--script`, and `model_source: "scripted"`

`bot/src/cli-contract.ts:413` declares `--script` as a `bot run start` option; `bot/src/flags.ts:145-146` parses it; `bot/src/run.ts:212-214` swaps the real model for a scripted transcript and `run.ts:397` records `scripted: true`. `specification/elements/invocation.md` enumerates the accepted options twice (`:40`, `:82`) and lists neither. `record.md:85` carries `model_source` in the field table and the provenance prose at `record.md:112-136` never defines it or its values. The word "scripted" appears in the spec once, in passing, at `conformance.md:61`.

### U3. `--timeout` and `--retries` as CLI options

`bot/src/cli-contract.ts:412,414` (run start) and `:101,102` (assembly check). `timeout` and `retries` are documented only as config/frontmatter keys (`invocation.md:109,124`). `--retries` appears in the tree only inside a fixture, `specification/conformance/accept/resolve-near/invocation:1`.

### U4. `checks/refusal.txt` and `checks/fault.txt`

`bot/src/gating.ts:97` and `:104` write the agent's refusal or fault reason under the attempt's `checks/` folder with no matching `check` event. `record.md:374-390` and the directory tree at `record.md:316-344` describe `checks/` as holding one capture per check. A reader enumerating that directory finds two entries the record does not point at.

### U5. A passing output check writes an empty capture

`bot/src/checks.ts:53` — `await recordCheck(input, "output", "output.txt", Buffer.alloc(0), 0);`. `specification/elements/gates.md:27` names only `output-missing.txt`.

### U6. The credential environment names that are stripped

`specification/elements/slots.md:13-14` and invariant 43 say "provider credential environment names consumed by the parent" are scrubbed. The specification never lists them. The runtime strips `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLOUD_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`. An operator cannot tell from the spec whether their provider's variable survives into a stage. `XDG_CACHE_HOME` is also read by the runtime and named nowhere in the spec.

### U7. Timing constants that can end a run

- SIGTERM→SIGKILL grace fixed at 250 ms: `bot/src/process.ts:240`. `runtime.md:325` says only "after a grace period".
- Post-exit capture drain: 1 s quiet, 5 s absolute (`bot/src/process.ts:258-259`). A gate that exits `0` but whose grandchild holds the pipe open past 5 s produces `bot/src/executables.ts:49` — `reason: \`${executable.file} did not close its captured output after exiting.\`` — exit `2`, cause `fault`. `runtime.md`'s "Running child processes" section names timeout, overflow, `126`/`127`, and hash drift; this fifth terminal machinery fault is absent.
- `$TMP` sampled every 250 ms: `bot/src/flow.ts:110`. `runtime.md:157-164` says "samples" without a cadence, and an unreadable sample silently reschedules (`flow.ts:133-135`).

### U8. The `$TMP` byte ceiling ends the stage through the agent-fault channel

`bot/src/flow.ts:112-141` — over `tmpMaxBytes` the runtime sets `session.controls.fault` and aborts the harness (`flow.ts:122-123`); `gating.ts:82` re-reads it before sealing. The record therefore shows an operator-configured ceiling breach as an agent-reported fault with a `checks/fault.txt` capture. Neither `stage.md`'s agent-loop section nor its exit table names this ending.

### U9. An extra agent turn between stopping and the checks

`bot/src/gating.ts:255-259` prompts the agent with a `$TMP` listing and asks it to use `clean-temp` or finish, and `gating.ts:181-185` does it again after a loop question. `specification/elements/stage.md:251-262` and `specification/elements/loop.md:220-223` both describe that seam as empty.

### U10. Request ingestion ceiling of 4 MiB

`bot/src/request-limit.ts:1` — `export const REQUEST_MAX_BYTES = 4 * 1024 * 1024;`. Stated in `conformance.md:75` and the changelog. Absent from `runtime.md` (which says at `:154` "Nothing bounds a run as a whole") and from `refusals.md`, so no code is named for the refusal.

### U11. `--correlation` and its 256-byte bound

`bot/src/run-start.ts:47-53`. `runtime.md:79` mentions "correlation" as a field of the structured result but never the option or its bound.

### U12. A flow is deleted from its own stages' scope

`bot/src/subflow-scope.ts:14` — `if (scope.get(flow.name) === flow) scope.delete(flow.name);`. `specification/elements/subflow.md:213` says an assembly-root `subflows/` entry is "callable by every stage", and `descend.md:107` justifies the exclusion with "a folder cannot contain itself", which is not the mechanism here. The runtime enforces a no-self rule the spec only derives from placement.

### U13. `bot assembly check` renders a `CHOOSE` like a `PARALLEL`

`bot/src/check.ts:179-180` returns `namedOutputs(branches)` for both kinds, so the plan shows the following stage receiving one input per alternative where `specification/elements/graph.md:93` says exactly one file arrives, named after the alternative that ran. `check.ts:60` also predicts the extension from `alternatives[0]` alone, while `choose.md:89` allows alternatives to produce different shapes.

### U14. Two container endings with no spec vocabulary

`bot/src/containers.ts:66` — `{ exit: 2, cause: "fault", reason: "A loop ran no repeats." }`; `containers.ts:130` — `{ exit: 2, cause: "fault", reason: "The chooser returned no held alternative." }`.

### U15. Fan-out aggregate promotion and `selected`

`bot/src/fanout.ts:144-154` promotes any item whose sealed output cannot be verified to `exit 2 / fault` regardless of the child's own cause; `fanout.ts:305` writes a `selected` item id into `fanout_done`. `fanout.md:172-173` describes neither.

### U16. Symlink scanning exempts declared opaque root folders

`specification/elements/graph.md:150` refuses symbolic links "anywhere in an assembly". `bot/src/assembly.ts:11-21` `findSymlinks` recurses the whole tree, but `:13` — `if (path.length === 0 && !includeAssemblyRoot(policy, entry)) continue;` — skips any root entry the traversal policy excludes, before the `isSymbolicLink()` test. A root folder declared opaque in `ASSEMBLY.md`'s `folders:` list is therefore never scanned. The exemption is real; whether it is reachable in a way that matters depends on `assembly-policy.ts:67-71`, which I read but did not exercise.

### U17. Tilde refusal in the file tools

`bot/src/tools.ts:245,269` refuse any path beginning with `~`. Not in `runtime.md`'s "The agent's tools".

### U18. Provider-facing overrides

`bot/src/harness.ts:363` — `if (property === "maxTokens") return 0;` and `harness.ts:367` — `retry: { enabled: false }`. `runtime.md:286-289` leaves continuation to the runtime, so this is permitted; the mechanism is invisible to a second implementer.

### U19. Process-group evidence file format

`bot/src/process.ts:83-95` and `bot/src/process-group-evidence.ts:9-27` write `process-groups/group-<uuid>` containing `pending\n` then `<pid>\n`. `runtime.md:326-330` describes the behavior; the on-disk format is unstated, and `busy` reads any non-matching entry as busy.

### U20. Unspecified bounds

`TIMEOUT_MAX = 2_147_483` (`bot/src/documents.ts:207`; `invocation.md:125` refuses an unhonourable timeout without naming the ceiling); `FETCH_TIMEOUT = 600_000` (`bot/src/management.ts:19`); `LOCK_ATTEMPTS = 51` / `LOCK_RETRY_MS = 20` and `PROVIDER_RETRIES = 2` / `PROVIDER_RETRY_DELAY_MS = 1_000` (`bot/src/credentials.ts:19-20,134-135`); `HASH_IN_FLIGHT = 8` (`bot/src/record.ts:272`); `RUNS_BOUND = 20` (`bot/src/inspection.ts:116`); `offsetMaximum: 2_147_483_647` (`bot/src/cli-contract.ts:51,56`); auth-import lock waits 30 s / 1 s (`cli-contract.ts:62`).

### U21. A parallel branch that throws aborts the container by rethrow

`bot/src/containers.ts:95` records that branch as `exit: 2, cause: "fault"`, then `:108-109` rethrows out of the container after the `parallel_done` event. `specification/elements/parallel.md:171-188` covers only branches that fail by exit code.

### U22. Fan-out `subflow_call` rows are written after every child settles

`bot/src/fanout.ts:250-261` appends them in one batch once all children have ended, not as each child ends. `fanout.md` says only "records one sorted disposition per item", so a reader cannot tell whether the record is live during a fan-out.

### U23. `bot auth import` help names a path the runtime does not use

`bot/src/help.ts:263` tells operators `bot auth import ~/.local/share/bot/credentials.json`. `bot/src/invocation.ts:72-74` resolves the retired store to `${XDG_CONFIG_HOME:-~/.config}/bot/credentials.json`, which is what the warning at `cli.ts:147` stats. The spec names neither path. Also unspecified: `bot assembly create` exists in the runtime (`bot/src/assembly-create-command.ts`, `ASSEMBLY_CREATE_CONTRACT` at `cli-contract.ts:43`) and appears nowhere in `specification/`.

---

## Conformance gaps

### G1. `model-unresolved` — the one real corpus gap

See C3. This is the only refusal code outside the Managing-the-home block with no case, and the exemption lives in `bot/tests/conformance.test.ts:197` rather than in the specification.

### G2. Four dead test names in the witness ledger

Every *file path* the ledger names exists (all 123 backticked path tokens checked with `test -e`; the six apparent misses were brace notation whose expansions all exist). Four *test names* no longer do:

| Ledger row | File | Cited name | Reality |
| --- | --- | --- | --- |
| 31 | `bot/tests/cli-rung-precedence.test.ts` | `"chain peel 2"` | absent |
| 31 (note C) | same | `"every key"` | absent |
| 43 note | `bot/tests/cli.test.ts` | `"tmp: flow shares one $TMP across every stage of the flow"` | renamed to `"tmp: flow shares $TMP across stages and deletes it when the flow settles"` |
| 44 | `bot/tests/flow.test.ts` | `"a signal mid-flow returns 128+n, starts no next stage, and runs no failure hook"` | renamed to `"a signal mid-flow records what completed, where it died, and which signal arrived"` — the new name no longer claims 128+n, no next stage, or no failure hook |

Row 31 is the serious one. `specification/elements/invariants-witnesses.md:73` says that file holds "eight peel runs plus innermost-first". `grep -n "^test(" bot/tests/cli-rung-precedence.test.ts` returns exactly one line: `49:test("omission resolves default from home", ...)`. The spot-falsification story the row tells cannot be reproduced, and invariant 31's witness is now three accept cases.

### G3. The ledger's walk date predates the retirements

`specification/elements/invariants-witnesses.md:8` — "Walked item by item on 2026-08-03 (ticket 0061)". Tickets 0270-0280 landed 2026-09-11..13 and retired `access`, denial events, command-name filtering, the custom scanner, and the Git collector, and added `bot run resume`, `bot auth import`, platform qualification, and fan-out. The ledger has been patched since but not re-walked, and row 44's "Honest limit: nothing asserts the CLI offers *no* `--resume`" now reads oddly against a runtime that ships `bot run resume`.

### G4. 38 of 50 invariants have no corpus case

Only invariants 13, 24, 26, 29, 31, 32, 39, 40, 41, 42, 43, 49 are exercised by a conformance case. This is expected rather than alarming — the corpus is model-free and static, so it can only witness read-time validation — but it means the ledger's `bot/tests/*` citations carry almost the whole load, which is why G2 matters more than it looks.

Separately, 29 of the 35 accept cases are cited by no ledger row at all (all nine `intelligence-*`, both `model-*`, `shape-minimal`, `subflow-nesting`, `subflow-skills`, `stage-workdir`, `skills-field`, `declared-folder`, `docs-inert`, `fanout-static`, `format-selection`, `link-editable`, `md-named-folder`, `non-strict-root`, `assembly-agent`, `body-replacement`, `container-skills`, `container-workdirs`). They test real behavior; the ledger simply does not map them.

### G5. Rules with no case at finer grain than a code

`specification/elements/refusals.md:41`'s `sentinel-unknown` row names five distinct faults; the corpus holds three cases. The ledger admits this at row 50's honest limit. It is the mechanism by which `refusals.md:125-132`'s "a rule with no case cannot be tested" can be true of codes and false of rules.

The "143 current model-free corpus cases" claim at `conformance.md:9` is **accurate**: 35 accept + 108 refuse = 143, and `npx vitest run tests/conformance.test.ts` printed `conformance: 143/143 passing`.

---

## Consistency problems

### S1. Version 0.0.1 versus the plan's v0.1.0

Six normative sentences name `0.0.1` as the first public release: `specification/README.md:32`, `README.md:34`, `conformance.md:7`, `:9`, `:10`, `:12`, `elements/record.md:35`. Two of them are the conformance-claim vocabulary a second runtime would cite ("Claiming conformance to 0.0.1"). `sdlc/planning/decisions/2026-09-13-trusted-execution-and-completion-plan.md` ("Completion and release") and `sdlc/planning/plan.md` ("Release rule") both say the first public release is `v0.1.0`. Nothing in `specification/` mentions `0.1.0`. Publishing as `v0.1.0` makes all six wrong at once. `bot/package.json:4` also says `"version": "0.0.1"`.

### S2. FANOUT belongs to no category

- `specification/elements/graph.md:13-16` — "Three of the sentinels type **containers** — `LOOP.md`, `CHOOSE.md`, and `PARALLEL.md`; the others type a flow or a stage."
- `graph.md:33` gives `FANOUT.md` a row — "one subflow run for each checked list item" — which is neither a flow nor a stage, so graph.md's taxonomy sentence excludes its own table row.
- `specification/elements/stage.md:286-294` says "A stage folder holds exactly one sentinel file, and the sentinel names the stage's type", then lists only `STAGE.md`, `LOOP.md`, `CHOOSE.md`, `PARALLEL.md`. `FANOUT.md` and `DESCEND.md` are absent. A runtime implementing `stage.md` alone would refuse a fan-out.
- `graph.md:77-81`'s container-key table omits FANOUT's four keys (`items`, `subflow`, `width`, `max-items`, `fanout.md:13-16`).

### S3. FANOUT's nesting rule is an exception graph.md does not count

`graph.md:116` — "Any container holds any container, to any depth, with two exceptions", naming `tail-container` and `loop-nested`. `fanout.md:11` — "A fan-out cannot be first, last, nested, or placed in a subflow." Either FANOUT is a container and there are three exceptions, or it is not and `graph.md:96` should not give it a row in the container handoff table.

### S4. A provisional control described by stable documents

`fanout.md:3` is `provisional` and `:5` says the control "may change in a later pre-1.0 release". Three `stable` documents describe FANOUT with no hedge: `graph.md:33`, `graph.md:96`, `graph.md:98`, and `conformance.md:81`. A reader taking graph.md at its label treats FANOUT as settled.

### S5. Missing stability labels

`specification/README.md` (the document that *defines* what stability labels mean, at `:34`), `specification/CHANGELOG.md`, and `specification/elements/invariants-witnesses.md` carry none. The witnesses file self-describes as non-normative at `:3`, which is arguably a substitute; it is the only `elements/*.md` without the line. The other 30 documents carry one at line 3; four are `provisional` (`auth.md`, `inspection.md`, `management.md`, `fanout.md`).

### S6. A stable chapter carrying an open release task

`runtime.md:21` (stable) — "WSL follows the Linux path, but the final release candidate still requires a clean-clone WSL qualification." `conformance.md:77` (stable) repeats it. A settled contract document is asserting a platform whose qualification is open.

### S7. `TMPDIR` missing from runtime.md's environment section

`runtime.md:86-100` enumerates the exported slots, the pass-through rule, the credential and `BOT_HOME` scrubbing, and `$BOT_RUN_ID`. `TMPDIR` is not among them, though `slots.md:17` and invariant 43 (`invariants.md:122`) both name it as set by the run over any caller value. `hooks.md:21-24` omits it too — correctly, as it happens, since `flow.ts:223` builds the hook environment without it (see C2).

### S8. Nine dead anchors in the CHANGELOG

All relative file links across 638 markdown files resolve. Nine anchors do not, all in `specification/CHANGELOG.md`, all pointing into `elements/inspection.md` at headings since renamed or moved: `:630` and `:757` → `#bot-output-run-stage` (now `### bot run output`); `:648` → `#bot-auth` (moved to `elements/auth.md`); `:871` and `:911` → `#bot-runs` (now `### bot run list`); `:880` → `#bot-status`; `:885`, `:921`, `:1083` → `#bot-prune` (moved to `elements/management.md`). The prose is legitimately frozen; the links are live dead ends.

### S9. "Seven control tools" is six plus a conditional one

`specification/elements/invariants.md:35-37`, `graph.md:107`, and `runtime.md:27` all say seven control tools. `bot/src/record-events.ts:287` — `export const CONTROL_TOOLS = ["mark", "refuse", "continue", "select", "clean-temp", "fault"] as const;` — holds six; `subflow` is granted separately by scope and never joins that list, so `bot/src/turns.ts:55` filters on a six-name set. The effect matches the spec; the vocabulary does not, and a second implementer reading "the seven control tools" as one closed set would build the wrong thing.

### S10. Retired concepts — clean

No surviving normative text assumes access declarations, command-name filtering, denial events, a custom secret detector, or a Git collector. The single `access` mention outside the changelog is correctly framed as history: `record.md:156` — "Record-1 readers retain two fields from the retired authored-access feature… Current writers produce neither form." Containment language is uniformly disclaiming (`invariants.md:94`, `:162`, `runtime.md:271,273,311`, `slots.md:58,219`, `inspection.md:9`, `auth.md:22`). Platform statements match the plan.

Also verified consistent: all 50 invariants have exactly one witness row, no gaps and no extras; every hyphenated refusal code cited in any element doc is defined in `refusals.md`'s 40-code tables; the seven control tools agree across `runtime.md:27`, `graph.md:107`, `invariants.md:35`; depth limits agree across `subflow.md:184`, `descend.md:25-35`, `invariants.md:87-88`; the 4,194,304-byte bound agrees between `invocation.md:54` and `inspection.md:158`; the 10,000/2,048-byte views agree across `gate.md:101`, `record.md:381`, `subflow.md:133`, `runtime.md:81`.

---

## Readability

- **`elements/inspection.md`** (351 sentences, 8 paragraphs over 120 words, longest 274) — each command's contract is a single unbroken wall of assertions mixing byte bounds, exit codes, and failure modes, so a newcomer cannot find the one sentence that answers their question.
- **`conformance.md`** — one 491-word paragraph at `:98` explains what the static corpus cannot exercise, which is the single most important idea in the chapter and the least scannable text in the tree.
- **`elements/runtime.md`** (399-word paragraph, 5 over 120) — the "Command-line contract" section interleaves the settled contract with release-status asides (`:21`'s pending WSL qualification) and structured-result minutiae, so the reader cannot tell what a second runtime must do from what this one currently does.
- **`elements/record.md`** (424 lines, 4 paragraphs over 120 words) — the field table is the real reference but sits between long prose sections, and fields like `model_source`, `tools`, and `skills` appear in the table with no prose anywhere that defines them.
- **`elements/fanout.md`** — short and clear on its own, but a reader who arrives from `graph.md` or `stage.md` has already been told a taxonomy that has no room for it (S2), so the clearest document in the set is the one most likely to confuse.

---

## What I ran

- `git log --oneline -3` — confirmed HEAD `084c956`.
- `npx vitest run tests/conformance.test.ts` in `bot/` — `conformance: 143/143 passing`, 3 tests, 789 ms.
- `ls specification/conformance/accept | wc -l` → 35; `ls .../refuse | wc -l` → 108.
- `npx tsx src/cli.ts --help` and `<command> --help` for all 25 commands (via a subagent) — worked, exit 0, no network, no model calls.
- `grep -rhn "exit: [0-9]" bot/src/*.ts | grep -o "exit: [0-9]" | sort | uniq -c` → 0:20, 1:17, 2:42, 3:2, 4:4, 5:5.
- `grep -rh "model-unresolved" specification/conformance/*/*/expected.jsonl` → no output.
- `grep -n "^test(" bot/tests/cli-rung-precedence.test.ts` → one line.
- A Python pass over every `specification/**/*.md` for sentence counts, paragraph word counts, and stability labels.
- A link and anchor checker over 638 markdown files (via a subagent).
- Direct reads of `bot/src/spine.ts`, `cli.ts`, `cli-contract.ts`, `inspection-result.ts`, `inspection.ts`, `run.ts`, `run-list-command.ts`, `check.ts`, `model.ts`, `gating.ts`, `process.ts`, `machinery.ts`, `graph.ts`, `fanout-authored.ts`, `documents.ts`, `invocation.ts`, `flow.ts`, and `bot/tests/conformance.test.ts`.
- Six parallel read-only subagent audits over the element documents, the CLI surface, the conformance corpus, and internal consistency. Every finding above that came from a subagent and is stated as fact was re-verified by me against the named lines.

---

## Unverified suspicions

- Whether `pi-agent-core` enforces `Type.String({ minLength: 1 })` on tool arguments before `execute` runs. If it does, C9 narrows to whitespace-only evidence; if it does not, evidence is unvalidated entirely.
- Whether `resume.ts` / `continuation.ts` honour `runtime.md:79-81` (donor facts, durable carried-stage counts, identity omission when the result does not fit) and `prompt.md:35,80` (prior-attempt labelling). Only the call sites in `run.ts` and `prompt.ts:114` were read, and `prompt.ts:114` matches.
- Whether `fanout.md:172`'s copy-integrity sentence ("a path replacement cannot redirect the copy, an append is not chased") is enforced in `run-files.ts`'s `holdRunFile`. Call sites at `fanout.ts:128-132` were read; the module was not.
- Whether `subflow.md:260`'s "a larger one comes back as a tool result to split, not as a failure" holds. `tools.ts:227-228` rejects with an Error; whether the harness turns that into an error tool result rather than a stage fault is asserted only by a comment at `subflow-runtime.ts:229-231`.
- Whether `record.md:24-27`'s claim that `tmp_teardown` names the stage "the way `run_end` does" holds for the flow-scoped `tmp: flow` case. `record-events.ts:199-214` makes `identity` optional, so a stage-less `tmp_teardown` is constructible; no call site was traced.
- `refusals.md:74`'s `not-runnable` rule "no shebang on something that is not a binary": `bot/src/documents.ts:367` approximates "binary" as `bytes.includes(0)`. A NUL-free binary is refused and a text file containing a NUL is accepted. I did not confirm that either case is reachable in practice.
- `busy.ts`'s conservative-busy rules against `runtime.md:328-332` and `management.md`.
- The standard-output settlement and EPIPE contract at `runtime.md:75-77`; `process-output.ts` was not read.
- Several "documented" verdicts on numeric bounds rest on a numeral appearing somewhere in spec prose (`2,048`, `4,096`, `480`). The distinctive ones were checked in context; the common small numbers may match an unrelated sentence.
