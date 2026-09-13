# The invariant witness ledger

This ledger is non-normative repository test and tooling evidence. It is not a
chapter of the runtime contract.

One row per numbered promise in [invariants.md](invariants.md): what in this
repository would fail if a runtime stopped honoring it. Walked item by item on
2026-08-03 (ticket 0061) by reading the tests and the corpus, never by guessing
from an invariant's wording.

Three verdicts, and only three:

- **Witnessed** — a named test or corpus case bites.
- **UNWITNESSED** — nothing in the tree would fail. The row says what a witness
  would take.
- **Unwitnessable by design** — nothing can witness it, and the specification
  says so in its own voice. No current row qualifies. This category exists so that
  UNWITNESSED keeps its sting; it is not a place for things that are merely
  hard.

Paths are from the repository root. A witness is cited by file and by a
fragment of the test's own name, because names are what `vitest -t` takes.
Corpus cases are cited by directory under `specification/conformance/`.

**A smoke rung is not a witness.** `smoke/` runs live models, costs money, and
never runs in `make check`. Where a rung is the only thing covering a sentence,
the row says UNWITNESSED and names the rung as partial evidence.

## What the agent is not told

| # | Verdict | Witness |
| - | ------- | ------- |
| 1 | Witnessed | `bot/tests/runtime-prompt-disclosure.test.ts` "nothing a real run sends a model names the machinery around it" — a real run's system prompts and user messages are screened for the assembly root's absolute path. Also `bot/tests/prompt.test.ts` "no golden discloses hidden runtime facts" (`/\/(?:home\|Users)\//`) over the checked-in goldens, and the byte-equality golden tests in the same file. |
| 2 | Witnessed | Same live screen, for the home path, the run directory's path, and `BOT_HOME`; `bot/tests/prompt.test.ts` screens `/\bBOT_HOME\b/` and `/\.local\/share\/bot\b/`. The tool-result channel is screened for the run's name and the scratch root too, on success and on failure (row 5). |
| 3 | Witnessed | Same live screen, for `/\bgates?\b/`. That the agent *is* told its schema and its checklist: `bot/tests/prompt.test.ts` "checklist instructions, contract, and unfinished text match goldens". That a passing gate's words stay out: `bot/tests/cli-gate-folder-faults.test.ts` "gate folder in name order with a named failure" asserts the session never contains `lint clean`. |
| 4 | Witnessed | Same live screen: the intelligence name `worker`, model id `faux-1`, reasoning level `xhigh`, timeout `3600`, and `/\b(?:provider\|model\|…\|intelligence)\b/`, `/\b(?:retry\|retries\|attempts?\|rounds?)\b/`, `/\b(?:timeout\|deadline\|budget)\b/`. |
| 5 | Witnessed | Both channels screened. The prompt: the live screen's `/\b(?:repeat\|repeats\|repetition\|loop\|loops\|iteration)\b/`. Tool results — the road note A found the repeat travelling — `bot/tests/runtime-tool-disclosure.test.ts` "no tool result a real run hands a model names the runtime's ground": across a two-repeat LOOP and a following stage, the distinct tool results are exactly nine strings, so a repeat number in any of them would make the set eighteen, and each names the slot (`$OUTPUT`, `$TMP/draft.txt`) rather than a path. Five of the nine are failures — a missing file, a read and a write under a file, a write onto a directory, and a failing `edit` — because a tool that fails is a second channel and it was the wider one. Closed by ticket 0066, which made path resolution slot-aware (`SlotExecutionEnv` in `bot/src/tools.ts`) so the tool echoes back the string it was handed, and by ticket 0068, which composes the failure's message from the slot form at the same seam. The third channel is the shell, which expands slots itself and so could not be composed away at all; ticket 0067 made the value say nothing instead, and the same file's `bash` leg runs `echo $OUTPUT` in both repeats and screens what the shell printed. The tree beneath it: `bot/tests/runtime-scratch-opacity.test.ts` "a two-repeat LOOP with a subflow leaves a scratch tree whose directories name nothing". See note A. |
| 6 | Witnessed | Same live screen, for `/\b(?:assembly\|assemblies\|flow\|flows\|stage\|stages)\b/`; `bot/tests/cli-local-context.test.ts` "a hostile workspace description cannot open a section of its own" asserts a real run's system prompt has exactly the headings `# Purpose, # Workspace, # Instructions, # Output, # Slots, # Skills, # Tools`. The tool-result channel is screened too, on success and on failure (row 5). The shell channel with it: ticket 0067 left `bash` unwrapped and made the scratch path uninformative instead, and `bot/tests/runtime-scratch-opacity.test.ts` walks a real run's whole scratch tree asserting that no directory below the run names a stage, a repeat, or the words `stages`/`subflows`. |

## What the agent cannot do

| # | Verdict | Witness |
| - | ------- | ------- |
| 7 | Witnessed | `bot/tests/extract-tools.test.ts` "ordinary control tool names are exhaustive and sequential, and invalid decisions reject without selecting" asserts the ordinary tool list is exactly `mark`, `refuse`, `continue`, `select`, `clean-temp`, and `fault`. The conditional `subflow` tool joins only when the author placed one in scope (row 8). The file the agent *can* still reach is answered by invariant 14, not prevented. |
| 8 | Witnessed | `bot/tests/extract-tools.test.ts` "a subflow's own stages never see it in scope unless DESCEND below max-depth". Spot-falsified: deleting `scope.delete(flow.name)` from `scopedSubflows` turns it red. |
| 9 | Witnessed | `bot/tests/extract-tools.test.ts` "each control tool's arguments are exactly the ones runtime.md fixes" — `mark` takes `item`, `state`, required `evidence`, and `reason` and nothing else, so an item's text is not something it can write. Items come from the body: same file, "checklist extraction follows the line grammar". |
| 10 | Witnessed | `bot/tests/extract-tools.test.ts` (the tool list and the fixed argument sets); `bot/tests/hostile-gating.test.ts` "a tool call naming an unknown tool feeds back instead of faulting the stage"; `bot/tests/gating.test.ts` "CHOOSE sends back an invalid selection, asks again, and accepts the next valid selection". |
| 11 | Witnessed | `bot/tests/cli.test.ts` "$TMP is per stage by default" asserts the second stage's `$TMP` is empty; `bot/tests/cli-fanout-handoff.test.ts` asserts each stage's `received` list exactly; one session per stage in `bot/tests/cli.test.ts` "CLI runs two faux-provider stages". Interpretation: `tmp: flow` (slots.md) is an authored opt-in to sharing scratch, pinned by "tmp: flow shares one $TMP across every stage of the flow". |

## What the runtime guarantees

| # | Verdict | Witness |
| - | ------- | ------- |
| 12 | Witnessed | `bot/tests/cli.test.ts` "CLI refuses a malformed assembly with no run record"; `bot/tests/cli-refusals.test.ts` "a subflow child naming an unresolvable model refuses upfront, before any run starts"; `bot/tests/cli-gate-folder-faults.test.ts` "126/127 broken assembly" leg A. Each asserts `runs/` does not exist — absence is the honest witness. |
| 13 | Witnessed | `specification/conformance/refuse/entry-unknown`; `specification/conformance/accept/shape-forms` holds a `.hidden` entry that is accepted and absent from the check output; `bot/tests/record.test.ts` "assembly prehash covers every visible file in bytewise path order" keeps `.secret` and `.ignored/hidden.txt` out of the hash. Spot-falsified: widening `visible()` regressed `accept/shape-forms` and `refuse/folder-empty-gate`. |
| 14 | Witnessed | Before the run: `bot/tests/record.test.ts` "assembly prehash covers every visible file". Each time it runs: `bot/tests/cli-gate-rehash.test.ts` "rehash before running: a gate that rewrites itself between attempts ends the run" — record.md's own story, run end to end; the file is that one since ticket 0117 moved it out of `cli-gate-folder-faults.test.ts`, and since 0117 both halves are taken over the run's own copy of the assembly (`bot/tests/run-capture-seal.test.ts` "the CAPTURED gate edited mid-run still ends the run"). Unit half: `bot/tests/record.test.ts` "executables are rehashed and output seal drift is terminal". The identity the hash covers includes the executable bit (ticket 0113): `bot/tests/record.test.ts` "an executable file's identity line carries `:x` and a non-executable's does not". |
| 15 | Witnessed | `bot/tests/record.test.ts` "exclusive run-directory creation is the claim and appends serialize"; `bot/tests/cli-json-and-show.test.ts` "leg 6" re-sums the token summary from the record's own `turn` events and asserts `--json` is byte-identical to `record.jsonl` with no summary in it. |
| 16 | Witnessed | `bot/tests/run-record.test.ts` compares exact bytes with `record.jsonl`; `bot/tests/run-session.test.ts` compares exact raw bytes with the selected session. |
| 17 | Witnessed | `bot/tests/gating.test.ts` "a failure hook cannot conjure an output for a stage whose before hook failed"; `bot/tests/hostile-gating.test.ts` "a tool result arriving after the timeout changes nothing already recorded"; `bot/tests/abandoned-prompt.test.ts` all three; `bot/tests/hostile-flow.test.ts` "one unreadable input-file is that call's outcome" (no `input`, no `exit` on a call that never started); `bot/tests/gating.test.ts` "a signal-aborted gate records judged: false". |
| 18 | Witnessed | `bot/tests/cli-gate-folder-faults.test.ts` "rehash at sealing"; `bot/tests/gating.test.ts` "a success hook that rewrites the passed output is a fault, never a seal"; `bot/tests/cli-hook-env.test.ts` compares the success hook's `cat "$OUTPUT"` to the sealed bytes and their sha256. |
| 19 | Witnessed | `bot/tests/cli-invocation-legs.test.ts` "stdin leg" (`kept.equals(stdinBytes)`); `bot/tests/cli-subflow-pins.test.ts` "leg 2" (a 10,000-character output arrives whole and the on-disk copy equals it exactly); `bot/tests/hostile-gating.test.ts` "an oversized response and output stay bounded and sealed" (1 MiB). The far end of "end to end" is `bot/tests/run-output.test.ts`: "run output preserves bytes and exits for root, stage, missing, changed, and ambiguous selection" compares invalid UTF-8 bytes with the sealed file, and "real start and resume descriptors resolve to their exact retained output" checks both current run-creation paths. |
| 20 | Witnessed | `bot/tests/stage-identity-agreement.test.ts` both tests — check's names and the record's names are one set of strings, including a container folder named `*.md`. |
| 21 | Witnessed | `bot/tests/cli-scratch-session-prompt.test.ts` "legs 3 and 4" — one session at the repeat level across both attempts, the send-back reason between the two turns, and the held agent's context growing rather than restarting. Spot-falsified: moving the session to the attempt level turned six tests in six files red. |
| 22 | Witnessed | The mechanism, unit: `bot/tests/clock.test.ts` — spend accumulates across send-backs, `pause()`/`resume()` is single-depth, a cleared clock keeps its spend. The runtime using it: `bot/tests/hostile-gating.test.ts` "the stage budget covers every send-back" (attempt two is armed at attempt one's deadline, so dropping `turns.ts`'s accumulated spend reads 1,700 where 1,000 is due); `bot/tests/gating.test.ts` "a gate is armed for the whole stage budget" (the agent burns 900ms of a 1,000ms budget and the gate's deadline is still a whole 1,000ms away, so quartering the budget gates and hooks are given reads 1,150 where 1,900 is due — one site in `executables.ts` serves both kinds); `bot/tests/gating.test.ts` "a gate timeout uses its fresh clock and records exit null" (a gate has a clock at all). Time in one budget never counting against another: `bot/tests/flow.test.ts` "a looped parallel branch and subflow child produce isolated nested run evidence" — the child spends twice the parent's whole budget and the parent survives, because `subflow-runtime.ts` pauses its clock. Every one of these drives an injected manual clock (`bot/tests/manual-clock.ts`); none sleeps. |
| 23 | Witnessed | `bot/tests/cli-checklist-schema-sendbacks.test.ts` "checklist exhaustion" (1/exhausted at both ends); `bot/tests/cli-gate-folder-faults.test.ts` "126/127 broken assembly" (2/fault, the record naming the file); `bot/tests/cli-rejected-choose.test.ts` (1/rejected); `bot/tests/cli.test.ts` "CLI refuses a malformed assembly with no run record" (2, no record). |

## Structure

| # | Verdict | Witness |
| - | ------- | ------- |
| 24 | Witnessed | `specification/conformance/accept/shape-nesting` — every `STAGE` line carries `output`, every `PARALLEL`/`LOOP`/`CHOOSE` line carries none. Live: `bot/tests/cli-rejected-choose.test.ts` (the chooser's `stage_end` has no `output` and no output file was minted); `bot/tests/cli-fanout-handoff.test.ts` "LOOP handoff" (the tail receives `cycle.txt`, pointing at the last repeat's output). |
| 25 | Witnessed | `bot/tests/cli-gate-folder-faults.test.ts` "first argument and env" (`$1` and `$OUTPUT` are the same readable file, holding the sealed bytes; `$INPUT` iterated as a directory); `bot/tests/cli-hook-env.test.ts` (`readdir($INPUT)`); `bot/tests/file-tools.test.ts`. |
| 26 | Witnessed | `specification/conformance/accept/shape-nesting` — `02-assess/risk/02-sum` receives `gather.txt`, the LOOP's name, not the buried `dig.txt`; `03-refine/01-draft` receives `cost.txt` and `risk.txt`, the branch names, not `sum.txt`. Live: `bot/tests/cli-fanout-handoff.test.ts`, all three tests. Spot-falsified: making the container rename a no-op turned the LOOP handoff test red. See note B for the half this does not reach. |
| 27 | Witnessed | `bot/tests/cli-checklist-schema-sendbacks.test.ts` "checklist send-back e2e" — the `before` hook's side file holds one line after two attempts, there is one `hook` event on attempt 1's path, and attempt 2's capture path does not exist. |
| 28 | Witnessed | `bot/tests/hostile-flow.test.ts` "SEQUENCE: a provider fault in the first stage ends the run once; the next stage never appears"; `bot/tests/cli-rejected-choose.test.ts` (1/rejected at stage and run); `bot/tests/flow.test.ts` "LOOP records stop, fixed-count limit, and unanswered-question exhaustion". |
| 29 | Witnessed | `specification/conformance/refuse/body-unexpected`, `refuse/body-missing`, `refuse/choose-body-missing`, `refuse/choose-body-comment`; `bot/tests/comment-stripping.test.ts` "a comment-only CHOOSE.md body faults body-missing, not alternative-mismatch". That the body is a *prompt*: `bot/tests/gating.test.ts` "LOOP holds an unanswered question" with `bot/tests/prompt.test.ts` "the later question is appended verbatim". |
| 30 | Witnessed | `bot/tests/gating.test.ts` "a missing output is sent back into the same session and the next attempt passes" (the feedback bytes asserted at `checks/output-missing.txt`); `bot/tests/cli-scratch-session-prompt.test.ts` "legs 3 and 4" (the gate's reason lands in the session between the two attempts' turns). |
| 31 | Witnessed | `bot/tests/cli-rung-precedence.test.ts` — eight peel runs plus innermost-first; `specification/conformance/accept/resolve-near`, `accept/resolve-far`, `accept/local-context-rung`. Spot-falsified: consulting containers before the stage turned "chain peel 2" red and regressed `accept/local-context-rung`. See note C on the "every key" half. |
| 32 | Witnessed | `specification/conformance/refuse/key-missing-loop`, `refuse/key-missing-descend`, `refuse/value-invalid-repeat`; `bot/tests/flow.test.ts` "LOOP records stop, fixed-count limit" and "DESCEND exposes only the remaining self-chain depth"; `bot/tests/cli-subflow-pins.test.ts` "leg 1" (ordinary calls across two batches); `bot/tests/subflow-depth.test.ts` "a cross-flow call chain records its positions and stops at the depth ceiling" (the fixed runtime bound). |
| 33 | Witnessed | `bot/tests/cli-checklist-schema-sendbacks.test.ts` "a skip needs a reason" — the bare skip leaves no `tool_call` event at all and the item stays `todo`; the reasoned skip is recorded with its reason. |

## What is claimed, and what is not

| # | Verdict | Witness |
| - | ------- | ------- |
| 34 | Witnessed | `bot/tests/stage-access-boundary.test.ts` proves both sides. A declared boundary refuses direct model-facing calls, while an allowed Git command reads a file denied to direct file tools. The unrestricted case writes through an absolute path outside `$PWD`. Bot does not provide operating-system containment. |
| 35 | Witnessed | `bot/tests/file-tools.test.ts` "the runtime's file tools include read, write, edit, and a shell" proves the runtime's underlying file-tool set, not the absence of a stage dispatch policy. Written for this ledger: before it, deleting `createBashTool` from `createFileTools` left all 337 tests and all 89 corpus cases green. |
| 36 | Witnessed | `bot/tests/file-tools.test.ts` exercises the shell with `cd "$DATA" && pwd && printenv TMP`. `bot/tests/stage-access-boundary.test.ts` proves that hooks and gates read caller-owned files, an allowed Git command escapes the direct-dispatch policy, and an unrestricted direct write accepts an absolute path outside `$PWD`. Honest limit: no finite test can enumerate everything an operating system account can reach. |
| 37 | Witnessed | `bot/tests/cli.test.ts` "Pi session tool rendering reports recorded outcome and duration" proves reported direct tool calls. `bot/tests/stage-access-boundary.test.ts` proves denied direct calls become `tool_denied` events. `bot/tests/spec-publication.test.ts` pins the limit that Bot does not watch the filesystem or claim a complete list of changes. Honest limit: a bounded behavior test cannot prove the absence of every possible observer. |
| 38 | Witnessed | `bot/tests/flow.test.ts` "a looped parallel branch and subflow child produce isolated nested run evidence" — the child asserts `origin === "subflow"`, receives the call's input as `request.txt`, and finds `PARENT_ONLY` absent from its environment; `bot/tests/cli-subflow-pins.test.ts` "leg 1" (each child is its own run with its own `run_start`) and "leg 4" (the child's own `run_end`). Honest limit: "no session crosses" is witnessed indirectly — each child is routed by its *own* system prompt, and the parent's next turn carries only the tool result — never by comparing session files. |

## Simplicity

| # | Verdict | Witness |
| - | ------- | ------- |
| 39 | Witnessed | Codes shared across distinct faults, each of which would break if a runtime split them: `refuse/key-missing-{descend,flow,loop,skill}`, `refuse/folder-empty-{choose,flow,gate}`, `refuse/loop-nested{,-deep}`, `refuse/frontmatter-{bom,bom-task,invalid-duplicate,invalid-unfenced,invalid-yaml}`, `refuse/sentinel-unknown-{caps,case,position}`, `refuse/input-collision{,-subflow}`. Also `bot/tests/conformance.test.ts` "refusal codes: the reader's are corpus cases, the home's are pinned by test" and `bot/tests/spec-vocabulary.test.ts` "spine.ts holds exactly the refusal codes refusals.md defines". Honest limit: whether a code names *the fault a person must fix* rather than the rule that caught it is an editorial judgment no test makes. |
| 40 | Witnessed | `specification/conformance/refuse/loop-nested` and `refuse/loop-nested-deep`. |
| 41 | Witnessed | Name order: `bot/tests/cli-fanout-handoff.test.ts` (`alpha.txt` before `beta.txt`), `bot/tests/flow.test.ts` "PARALLEL width two starts in name order", `bot/tests/cli-gate-folder-faults.test.ts` (gate entries in name order), `bot/tests/record.test.ts` (prehash path order), `bot/tests/prompt.test.ts` "skills and callable helpers are flattened and bytewise ordered", `accept/shape-nesting`. Bytewise and not a locale: `bot/tests/spec-vocabulary.test.ts` "the one comparator is bytewise over UTF-8, never a locale collation". Written for this ledger: before it, replacing `bytewise` with `localeCompare` left the whole gate green, because every ordering fixture in the suite uses names the two comparators agree on. Honest limit: the pin holds the comparator, not that every call site uses it. |
| 42 | Witnessed | `specification/conformance/refuse/frontmatter-invalid-unfenced`, `refuse/frontmatter-invalid-yaml`, `refuse/frontmatter-invalid-duplicate`, `refuse/frontmatter-bom`, `refuse/frontmatter-bom-task`; `bot/tests/fuzz-regressions.test.ts` "guard: zero-byte and BOM-prefixed sentinels refuse as unsound frontmatter". |
| 43 | Witnessed | `bot/tests/cli.test.ts` "a caller variable passes through beneath the slots, and a slot overwrites a same-named caller variable" and "a gate script sees no BOT_HOME in its environment"; `bot/tests/cli-hook-env.test.ts` (the `HOOK_CANARY` canary through a real hook); `specification/conformance/refuse/slot-reserved-env`. |
| 44 | Witnessed | A signal ends the run and nothing further starts: `bot/tests/flow.test.ts` "a signal mid-flow returns 128+n, starts no next stage, and runs no failure hook"; `bot/tests/gating.test.ts` "a signal-ended stage does not run its failure hook". Invoking again is a new run: `bot/tests/record.test.ts` "exclusive run-directory creation is the claim" and `bot/tests/cli-local-context.test.ts` "absence is silence", where three invocations over one fixture produce three runs. Honest limit: nothing asserts the CLI offers *no* `--resume`; `bot/tests/cli-help.test.ts` checks that every listed command appears, not that no other exists. |

## The record's contract

| # | Verdict | Witness |
| - | ------- | ------- |
| 45 | Witnessed | Each of the eight words pinned to its situation: `success` (`bot/tests/cli.test.ts`), `refused` (`bot/tests/cli.test.ts` "CLI writes one stderr line naming a failed run's cause and reason"; `bot/tests/cli-subflow-pins.test.ts` "leg 4"), `exhausted` (`bot/tests/cli-checklist-schema-sendbacks.test.ts` "checklist exhaustion"), `rejected` (`bot/tests/cli-rejected-choose.test.ts`), `blocked` (`bot/tests/external-blocker.test.ts` "a gate exit 75 is a blocked run with its captured external evidence and no retry"), `timeout` at exit 1 (`bot/tests/hostile-gating.test.ts` "a stream that never resolves ends at the stage timeout") and at exit 2 (`bot/tests/gating.test.ts` "a gate timeout uses its fresh clock"), `signal` (`bot/tests/flow.test.ts`), `fault` (`bot/tests/hostile-flow.test.ts`, `bot/tests/cli-gate-folder-faults.test.ts`). The closed vocabulary: `bot/tests/spec-vocabulary.test.ts` "CAUSES holds exactly the cause words record.md's table names, each once" — written for this ledger; before it a synonym could be added silently. |
| 46 | Witnessed | `bot/tests/record-event-shape.test.ts` "the constructor registry and field coverage ledger cover every current event field", "every known top-level field rejects a wrong type and unknown top-level fields stay additive", "each required field is required in its constructor form", "closed nested shapes and conditional groups reject partial or extra members", "the reader schema accepts every current constructor and its conditional forms", and "the reader schema rejects missing required fields and broken conditional groups"; `bot/tests/hostile-flow.test.ts` "one unreadable input-file is that call's outcome" (no `input`, no `exit` on a call that never started); `bot/tests/cli-fanout-handoff.test.ts` (`repeat` present inside a LOOP and absent outside — placement, knowable before the run); `bot/tests/cli-json-and-show.test.ts` "leg 6 — rendered `bot run events` is one line per recorded event" (the same current invocation twice is byte-identical). Honest limit: "never because a runtime chose to leave it out" has nothing to break, because no configuration knob governs a field's presence. |
| 47 | Witnessed | `bot/tests/gating.test.ts` "a length-truncated turn continues before any finished-work check" — stop reasons `["length", "stop"]` with a single `stage_start`. |
| 48 | Witnessed | `bot/tests/record.test.ts` "exclusive run-directory creation is the claim and appends serialize" asserts the first line starts `{"record":1,"ts":`. |

## Refusing and proving

| # | Verdict | Witness |
| - | ------- | ------- |
| 49 | Witnessed | An ambiguous provider: `bot/tests/cli-refusals.test.ts` "a provider-ambiguous model refuses by naming the candidate providers" (both `faux-a` and `faux-b` in the diagnostic) with `specification/conformance/refuse/model-unresolved`. An ambiguous target: `refuse/request-invalid`. Two things behind one name: `refuse/sentinel-duplicate`, `refuse/hook-duplicate`, `refuse/schema-duplicate`, `refuse/number-duplicate`, `refuse/gate-conflict`, `refuse/input-collision`, `refuse/input-collision-subflow`. Honest limit: "naming both" is asserted only for the provider case — the corpus asserts code and path and never the sentence, by design (refusals.md). "It never picks" is asserted everywhere: each case requires exit 2. |
| 50 | Witnessed | Two legs, both closed. refusals.md → the runtime: `bot/tests/spec-vocabulary.test.ts` "spine.ts holds exactly the refusal codes refusals.md defines" — written for this ledger; before it, a code added to refusals.md and never implemented left `bot/tests/conformance.test.ts` green, demonstrated. The runtime → the corpus: `bot/tests/conformance.test.ts` "refusal codes: the reader's are corpus cases, the home's are pinned by test", in both directions. Since ticket 0125 that test carries the scope Ian ruled on 2026-08-05: a code the corpus does not exercise is red unless refusals.md's "Managing the home" table names it, and each code that table names is red unless some test in the suite asserts its whole stderr byte for byte — the exemption is the specification's and is checked, not a list in the test file. Honest limit: the closure is over *codes*, not rules — refusals.md's `sentinel-unknown` row names five distinct faults and the corpus holds three cases, and "a rule with no case" at finer grain than a code is not mechanically checkable from the tables. |

## Notes

**A. The repeat number used to reach the model through a tool result.** This
note is now history in both its halves, and it is kept because it is the
clearest lesson in this ledger: a disclosure screen that covers only the
channel we author is not a screen.

*What it said, and what closed it.* Every successful `write` handed the model
the absolute path it wrote to, and that path is the runtime's scratch tree:

```text
Successfully wrote 9 bytes to …/cache/bot/tmp/<run>/stages/01-cycle/01-work/1/output.txt
Successfully wrote 9 bytes to …/cache/bot/tmp/<run>/stages/01-cycle/01-work/2/output.txt
```

The blame was misplaced. Pi echoes back **the path parameter it was handed**;
the runtime was the thing expanding `$OUTPUT` before the call, so the tool was
faithfully repeating the runtime's own expansion. Ticket 0066 made path
resolution slot-aware and deleted the pre-expansion, and
`bot/tests/runtime-tool-disclosure.test.ts` now screens this channel.

*The second half, and what closed it.* Screening the success channel left the
failure channel wide open: a file tool that FAILED disclosed everything the old
success message did, because `read` and `write` surfaced Node's own message,
which Node composes from the resolved path. Measured end-to-end on 2026-08-03,
through a real two-repeat LOOP, the model was handed:

```text
ENOENT: no such file or directory, open '…/cache/bot/tmp/<run>/stages/01-cycle/01-work/1/tmp/does-not-exist.txt'
ENOENT: no such file or directory, open '…/cache/bot/tmp/<run>/stages/01-cycle/01-work/2/tmp/does-not-exist.txt'
```

The trailing `1` and `2` are the repeats — invariant 5 exactly, on one missing
file, with the run's name and the stage's place in the flow beside it. Ticket
0068 closed it the same way `edit` was always written: the env composes the
error from the path it maps back to slot form, before there is a message to
scrub, so the agent is handed `Could not access file: $TMP/does-not-exist.txt.
Error code: not_found.` The screen in row 5 covers both halves now.

*The third channel, and why it took a different kind of fix.* Slots are real
environment variables in the stage environment, so a shell expands them itself
— which is why `bash` was deliberately left unwrapped by both tickets, and why
nothing here was fixable by composing messages differently. `echo $OUTPUT`
handed the agent the absolute path, repeat number and all. Measured by the
driver on 2026-08-03, in the same real two-repeat LOOP that witnesses row 5:

```text
…/cache/bot/tmp/<run>/stages/01-cycle/01-work/1/output.txt
cat: …/cache/bot/tmp/<run>/stages/01-cycle/01-work/2/tmp/nope.txt: No such file or directory
```

Ticket 0067 changed the value instead of the message. Below `<scratch>/<run>/`
the tree is one opaque directory per stage attempt — no stage name, no repeat
number, no `stages` or `subflows` segment — so the same command now prints
`…/cache/bot/tmp/<home>/<run>/a6f1b7fd8539b1cc/output.txt` — the `<home>` level
is a hash and arrived with ticket 0140, which names nothing either — and
walking up from it
finds names that say nothing and reveal no ordering. The run directory is
untouched: it names everything still, and `bot run events` prints each stage's
scratch location, because a reader can no longer guess it.

What that is not is prevention. `runtime.md` says a runtime is trusted rather
than a sandbox: the agent still holds a shell, the path still names the scratch
root and the run, and an agent that goes looking can still find things. What
changed is that wandering stopped being educational.

One residue, measured by the driver rather than reasoned about, because it is
the kind of thing a ledger should say out loud: the names disclose nothing but
the *count* still moves. Listing the run level of the scratch tree finds one
attempt directory during a loop's first repeat and two during its second. So
the runtime never states the repeat and no path spells it, and an agent that
thinks to count its siblings can still bound it from below. Closing that would
mean hiding the tree rather than renaming it, which is the sandbox this
specification declines to be.

**B. A container's rename is witnessed live only for a LOOP.** The corpus pins
the naming statically through `bot assembly check` for every container, and
`bot/tests/cli-fanout-handoff.test.ts` pins the LOOP and PARALLEL cases through
a real run. The CHOOSE case is not discriminated at run time: in
`bot/tests/cli-rejected-choose.test.ts` the alternative is a single-file stage
already named `patch`, so renaming its output to the alternative's name is
invisible. An alternative that is a *folder* whose last stage has a different
name would discriminate it.

**C. Rung coverage is one key deep.**
`bot/tests/cli-rung-precedence.test.ts` varies `intelligence` across all six
authored model-choice rungs and proves the implicit home default. The loose
non-model ladder still shares one resolution path; `local-context`, `timeout`,
and `retries` have narrower rung coverage.

## The count

| Verdict | Rows |
| ------- | ---- |
| Witnessed | 50 |
| UNWITNESSED | 0 |
| Unwitnessable by design | 0 |

Fourteen rows had at least one clause with no witness when the walk began:
1, 2, 3, 4, 5, 6, 9, 14, 22, 35, 36, 41, 45 and 50. Twelve were closed by five
tests written during the walk, listed in ticket 0061's report. Invariant 5 was
closed afterwards by tickets 0066 and 0068, and invariant 22 by ticket 0133 —
the backlog this ledger measures is empty for the first time.

Empty is not finished. Eight rows carry a stated **honest limit** — 36, 38, 39,
41, 44, 46, 49 and 50 — and notes B and C name two coverage gaps the walk found
and left. Those are where a row is thinner than the sentence above it, and they
are the next thing to read when something surprising turns out to have been
unpinned.

## The standing rule

This ledger measures a backlog. What stops it growing is CHECKLIST item 17:

> **Do not promise behavior you do not test.** If a ticket adds or changes a
> sentence in `specification/` that promises a runtime will do something, the
> test or corpus case that would fail if the runtime stopped doing it lands in
> the same commit — or the report names the sentence as UNWITNESSED in so many
> words.

The evidence that the rule is needed is in this ledger's own margins. Every
sentence closed during the walk was written in an earlier ticket with nothing
to falsify it. Breaking the runtime on purpose, one sentence at a time, the
walk found that it could delete the agent's shell, swap the one comparator for
a locale collation, stop acting on a gate an agent had rewritten, and tell
every agent its model, its retries, its timeout and where its gate lives — with
every test and every corpus case still green. Quartering every gate's clock was
the fifth, and stayed green well past the walk; ticket 0133 closed it, and the
mutation now reds `bot/tests/gating.test.ts` "a gate is armed for the whole
stage budget" with that row's own numbers — 1,150 where 1,900 is due. All five
are closed. An unwitnessed promise is how a specification starts lying.

The other lesson this ledger keeps teaching is about itself. Row 22 read
UNWITNESSED after `clock.test.ts` had already closed most of it, and this
paragraph went on saying so after 0133 had rewritten the row. **A row is a claim
about the tree, and it goes stale the way any other claim does.** Sweeping it
belongs to whoever changes what it describes.
