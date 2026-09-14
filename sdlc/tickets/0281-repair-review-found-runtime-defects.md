---
flow: build
priority: 2
deps: []
---
# Repair review-found runtime defects

## Outcome

A legal child request of any admitted size can be verified, so a healthy run tree reports complete tokens. `bot assembly check` states input shape honestly, so a choice reads differently from a parallel and no reader sees two concurrent inputs where one file arrives. The raw output latch lasts only as long as its pipeline. A check proves every eslint `files:` pattern names a real path.

## Current facts

- `REQUEST_MAX_BYTES` is 4,194,304 (`bot/src/request-limit.ts:1`). The child-agreement reader calls `heldRunFile` (`bot/src/child-record.ts:43`), which refuses above `INSPECTION_MAX_BYTES = 1024 * 1024` (`bot/src/run-files.ts:14,246,253`). A `too-large` result makes `requestAgrees` false, so the ancestor reports `tokensStatus: "partial"` forever. Resume already reads through `boundedHeldRunFile` (`bot/src/continuation.ts:228`).
- `consolidateRows` unions differing inputs into plain `input` with no marker (`bot/src/check.ts:320-336`) while differing outputs get `possible_outputs`. `specification/conformance/accept/descend-depth/expected.jsonl:5` ships `"input":["<item>.txt","<item>.json"]` for a stage receiving one file. `checkCollision` (`:80-90`) strips extensions, so that pair raises `input-collision` when authored.
- `renderContainer` returns `namedOutputs(branches)` for `CHOOSE` and `PARALLEL` alike (`bot/src/check.ts:179-181`). `specification/conformance/accept/container-skills/expected.jsonl` gives `99-done` after a choice `"input":["escalate.txt","patch.txt"]`, while `specification/elements/graph.md:93` says one file arrives, named after the alternative that ran.
- `processRawStdout` sets the module-global `rawProcessOutput` (`bot/src/process-output.ts:65,84`) and never clears it. `exitFlushed` then takes a branch that never drains the ordinary queue (`:112-115`). Every `bot run output` and `bot run request` is raw (`bot/src/run-output-command.ts:38`), and `copySelected` always invokes the destination factory (`:60`), so the latch outlives each such command. No current call site loses bytes.
- `bot/eslint.config.js:266-277` grants complexity allowances to `src/stored-git-secrets.ts` and `tests/stored-git-secrets.test.ts`. Ticket 0272 deleted both files and said it would remove the exceptions. `bot/scripts/check-lint-rules.mjs` already resolves the real config, and its virtual targets `src/probe.ts` and `tests/probe.test.ts` do not exist on disk.
- `inspectRequest` (`bot/src/one-run.ts:50`) is exported and referenced nowhere. It reads a retained request through the same 1 MiB `heldRunFile`.
- `humanValue(summary, field, _now)` (`bot/src/run-list.ts:191`) and `runsLines(runs, _readingAt)` (`bot/src/inspection.ts:125`) ignore their clock parameters, threaded from the exported `inspectRunList` and `inspectRuns`. `mergeChildRows` emits `child_options` unconditionally (`bot/src/check.ts:351`) while its siblings are difference-gated. `bot/src/subflow-runtime.ts:221` computes `childDepth` before the `flow === undefined` return at `:224`.

## Scope

- Give the consumption reader the writer's ingestion ceiling. Read the retained child request through `boundedHeldRunFile(…, REQUEST_MAX_BYTES)`. A request above the admitted limit stays refused.
- Make check input shape explicit. Mirror `values` and `possible_outputs` (`bot/src/check.ts:311-318,336`): `input` holds the first variant and `possible_inputs` holds the union. Apply it to depth-variant unions and to the stage after a `CHOOSE`. `inputs` (`:320`) must also union any `possible_inputs` the variants already carry, or a choice inside a depth variant loses entries. Leave the choice row and alternative rows unchanged.
- End the raw latch without moving a raw command onto the ordinary exit branch. `restore` runs in `final` and `destroy` (`bot/src/process-output.ts:99,101`) before `exitFlushed`, so clearing it there would drain `OrdinaryOutput`, emit `stdoutDeliveryDiagnostic`, and change the exit code that record 0276 preserved. Clear the latch in `ordinaryProcessOutput` instead, on every `ordinaryProcessOutput()` call, not only when the instance is first constructed (`processOutput ??=` at `bot/src/process-output.ts:67-70` builds once per process). The raw command's own exit path is unchanged.
- Delete the two dead eslint override blocks. Extend `bot/scripts/check-lint-rules.mjs` so every `files:` pattern resolves to at least one real path, with the virtual probe targets as the one declared exception.
- Delete the unused `_now` and `_readingAt` parameters and their plumbing through both exported readers. Delete the unreferenced `inspectRequest`. Gate `child_options` on difference like its siblings. Move `childDepth` below the early return.
- Update the conformance corpus, `specification/elements/inspection.md` where check output fields are described, the changelog, and example transcripts carrying a changed row. Change nothing else in the specification.
- Remove the two valueless `--intelligence` guards in `bot/src/check.ts` (`:105`, `:393`) so a valueless `--intelligence` with a missing row refuses with `intelligence-unresolved`, as `specification/elements/invocation.md:118-119` states. The specification audit lists this as C12; ticket 0282 owns every other audit item.
- Excluded. The private-file boundary becomes a specification honesty item in ticket 0282. The check and descendant-walk costs stay in the review note, because no measurement here establishes a bound worth enforcing. Example transcript verification is a documentation ticket. `bot/src/model-runtime.ts` is untouched.

## Acceptance

Start with failing tests. A fixture child born with a request between 1 MiB and 4 MiB yields a verified ancestor with complete tokens and a `tokensStatus` other than `partial`. A request above 4 MiB still refuses. A depth-variant stage reports its first-variant `input` plus a `possible_inputs` union; `specification/conformance/accept/descend-depth/expected.jsonl:5` becomes `"input":["<item>.txt"]` with both files in `possible_inputs`. The stage after a `CHOOSE` does the same, and the stage after a `PARALLEL` keeps every branch file in `input`. A choice inside a depth variant keeps every alternative. No emitted `input` array would raise `input-collision` if authored. A raw command followed by an ordinary command in one process drains the ordinary queue, and `bot run output --raw` to a full and to a closed pipe keeps its current exit code and single diagnostic. Identical child options emit no `child_options`; differing ones still do, so `bot/tests/assembly-procedure.test.ts:91` keeps the field for its differing child timeout and the conformance corpus, which carries no `child_options` row today, stays unchanged in that field. `npm run typecheck` passes and `bot/tests/run-list.test.ts`, `bot/tests/importable-readers.test.ts`, and `bot/tests/run-output.test.ts` pass with the clock parameters and `inspectRequest` gone. `check-lint-rules.mjs` fails on an override naming a missing path and passes on the current config. A valueless `--intelligence` with a missing row refuses with `intelligence-unresolved`.

Run `bot/tests/run-consumption.test.ts`, `bot/tests/run-consumption-observation.test.ts`, `bot/tests/assembly-procedure.test.ts`, `bot/tests/fanout-static.test.ts`, `bot/tests/cli-rejected-choose.test.ts`, `bot/tests/ordinary-output.test.ts`, `bot/tests/run-list.test.ts`, `bot/tests/importable-readers.test.ts`, `bot/tests/run-output.test.ts`, `node bot/scripts/check-lint-rules.mjs`, and the conformance corpus. Then run the complete local gate `make check`.

## Dependencies

Ticket 0276 owns the 4 MiB ingestion limit, which this ticket keeps. Ticket 0279 owns the check row contract, and this ticket corrects one field family in it. Ticket 0282 owns the private-file item and makes no change to `bot/src/check.ts`. Both tickets touch `specification/CHANGELOG.md`, `specification/elements/inspection.md`, the conformance corpus, and `bot/tests/conformance-passing.txt`; 0281 lands first and 0282 rebases onto it.

## Risk facts

Machine readers of `bot assembly check` see a new `possible_inputs` field and a shorter `input` array after a choice. Shipped conformance fixtures and example transcripts change. This is a pre-release change-in-place correction before the first advertised compatibility point.

The raw exit path keeps its own failure ownership: `bot run output --raw` to a full or closed pipe keeps its current exit code and single diagnostic. Records already written are not rewritten. A fresh read of the same tree reports the corrected status. The new lint check refuses a pattern that resolves to nothing, so a future virtual target must be declared in the script.

## Size decision

- Starting production size: 18483 nonblank lines
- Ending production size:
- Simpler approach tried:
- Why insufficient alternatives were rejected:
- Production code added:
- Production code deleted:
- Accepted cost:

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: The change decides a new public check field and changes a shipped one across the conformance corpus. It reconciles two ceilings governing a persisted record read and clears a process-lifetime latch. Proof spans a large-request fixture, pipe-failure behavior on both a full and a closed pipe, the conformance corpus, and a new mechanical lint check. A wrong result is user-visible, not destructive.
- Selected model: `claude-opus-5` with medium reasoning for design review, implementation, and code review

## Review

- Origin: The independent reviews `sdlc/planning/notes/2026-09-14-review-recent-work.md` (M1, M2, M5, M6, L1, L2, L7) and `sdlc/planning/notes/2026-09-14-review-specification.md` (U13). Every cited line was reopened at HEAD `9699a10`.
- Design review rejection 1: the six findings were the false `--raw` fact, a latch clear that would move raw commands onto the ordinary exit branch, an unstated `possible_inputs` rule, a scope bullet with no acceptance, an unstated overlap with ticket 0282, and the dead `inspectRequest`.
- Design review: accepted after one rejection.
- Code review: pending
