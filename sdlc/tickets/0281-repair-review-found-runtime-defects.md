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
- `processRawStdout` sets the module-global `rawProcessOutput` (`bot/src/process-output.ts:65,84`) and never clears it. `exitFlushed` then takes a branch that never drains the ordinary queue (`:112-115`). `--raw` is optional on `bot run output`, so a plain invocation sets the latch. No current call site loses bytes.
- `bot/eslint.config.js:266-277` grants complexity allowances to `src/stored-git-secrets.ts` and `tests/stored-git-secrets.test.ts`. Ticket 0272 deleted both files and said it would remove the exceptions. `bot/scripts/check-lint-rules.mjs` already resolves the real config, and its virtual targets `src/probe.ts` and `tests/probe.test.ts` do not exist on disk.
- `humanValue(summary, field, _now)` (`bot/src/run-list.ts:191`) and `runsLines(runs, _readingAt)` (`bot/src/inspection.ts:125`) ignore their clock parameters, threaded from the exported `inspectRunList` and `inspectRuns`. `mergeChildRows` emits `child_options` unconditionally (`bot/src/check.ts:351`) while its siblings are difference-gated. `bot/src/subflow-runtime.ts:221` computes `childDepth` before the `flow === undefined` return at `:224`.

## Scope

- Give the consumption reader the writer's ingestion ceiling. Read the retained child request through `boundedHeldRunFile(…, REQUEST_MAX_BYTES)`. A request above the admitted limit stays refused.
- Make check input shape explicit. Keep `input` as the files that definitely arrive and add `possible_inputs`, symmetric with `possible_outputs`, for a set where exactly one arrives. Apply it to depth-variant unions and to the stage after a `CHOOSE`. Leave the choice row and alternative rows unchanged.
- Clear `rawProcessOutput` when the raw adapter restores the retained listeners, so the latch ends with its pipeline.
- Delete the two dead eslint override blocks. Extend `bot/scripts/check-lint-rules.mjs` so every `files:` pattern resolves to at least one real path, with the virtual probe targets as the one declared exception.
- Delete the unused `_now` and `_readingAt` parameters and their plumbing through both exported readers. Gate `child_options` on difference like its siblings. Move `childDepth` below the early return.
- Update the conformance corpus, `specification/elements/inspection.md` where check output fields are described, the changelog, and example transcripts carrying a changed row. Change nothing else in the specification.
- Remove the two valueless `--intelligence` guards in `bot/src/check.ts` (`:105`, `:393`) so a valueless `--intelligence` with a missing row refuses with `intelligence-unresolved`, as `specification/elements/invocation.md:118-119` states. The specification audit lists this as C12; ticket 0282 owns every other audit item.
- Excluded. The private-file boundary becomes a specification honesty item in ticket 0282. The check and descendant-walk costs stay in the review note, because no measurement here establishes a bound worth enforcing. Example transcript verification is a documentation ticket. `bot/src/model-runtime.ts` is untouched.

## Acceptance

Start with failing tests. A fixture child born with a request between 1 MiB and 4 MiB yields a verified ancestor with complete tokens and a `tokensStatus` other than `partial`. A request above 4 MiB still refuses. A depth-variant stage reports one `input` plus `possible_inputs`. The stage after a `CHOOSE` does the same, and the stage after a `PARALLEL` keeps every branch file in `input`. No emitted `input` array would raise `input-collision` if authored. A raw command followed by an ordinary `exitFlushed` in one process drains the ordinary queue. `check-lint-rules.mjs` fails on an override naming a missing path and passes on the current config. A valueless `--intelligence` with a missing row refuses with `intelligence-unresolved`.

Run `bot/tests/run-consumption.test.ts`, `bot/tests/run-consumption-observation.test.ts`, `bot/tests/assembly-procedure.test.ts`, `bot/tests/fanout-static.test.ts`, `bot/tests/cli-rejected-choose.test.ts`, `bot/tests/ordinary-output.test.ts`, `bot/tests/run-list.test.ts`, `node bot/scripts/check-lint-rules.mjs`, and the conformance corpus. Then run the complete local gate `make check`.

## Dependencies

Ticket 0276 owns the 4 MiB ingestion limit, which this ticket keeps. Ticket 0279 owns the check row contract, and this ticket corrects one field family in it. Ticket 0282 owns the private-file item.

## Risk facts

Machine readers of `bot assembly check` see a new `possible_inputs` field and a shorter `input` array after a choice. Shipped conformance fixtures and example transcripts change. This is a pre-release change-in-place correction before the first advertised compatibility point.

Records already written are not rewritten. A fresh read of the same tree reports the corrected status. The new lint check refuses a pattern that resolves to nothing, so a future virtual target must be declared in the script.

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
- Proof score: 1
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: The change decides a new public check field and changes a shipped one across the conformance corpus. It reconciles two ceilings governing a persisted record read and clears a process-lifetime latch. Each proof is deterministic, and a wrong result is user-visible, not destructive.
- Selected model: `claude-opus-5` with medium reasoning for design review, implementation, and code review

## Review

- Origin: The independent reviews `sdlc/planning/notes/2026-09-14-review-recent-work.md` (M1, M2, M5, M6, L1, L2, L7) and `sdlc/planning/notes/2026-09-14-review-specification.md` (U13). Every cited line was reopened at HEAD `084c956` before this ticket was written.
- Design review: pending
- Code review: pending
