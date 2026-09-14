---
flow: build
priority: 2
deps: []
---
# Align specification with runtime

## Outcome

A reader who never opens `bot/src` can predict every exit code, refusal code, structured error code and cause, CLI option, environment variable, and bound the runtime exposes. Three places where the specification holds the better contract move the runtime.

## Current facts

The audit `sdlc/planning/notes/2026-09-14-review-specification.md` found 12 contradictions, 23 unspecified behaviors, 5 conformance gaps, and 10 consistency problems. Its runtime-side items were re-verified at `9699a10`.

- `bot/src/graph.ts:368-370` returns `{}` for any sentinel but `FLOW.md`, so a `DESCEND.md` body never reaches a prompt. `flow.md:41-43` makes a body the shared procedure and already silences a whitespace-only one.
- `bot/src/fanout-authored.ts:24` calls `validateData` without `optionNames`, so `documents.ts:315` admits `timeout`, `retries`, `local-context`, and `intelligence`, and `:32` drops them. `documents.ts:263-275` already gives an unknown key `key-unknown`.
- `bot/src/tools.ts:112-124` never inspects `params.evidence`, against `checklist.md:55-57`. `bot/src/check.ts:105` and `:393` suppress `intelligence-unresolved` for a valueless `--intelligence`, against `invocation.md:118-119`; 0281 owns that file.
- `bot/tests/conformance.test.ts:197` carries `const runtimeOnly = ["model-unresolved"];`, which `invariants-witnesses.md:117` says does not exist. `bot/src/new-command-result.ts:41-44` defines a JSON error envelope the specification never shows.

## Scope

The specification moves for seven contradictions. C1: add exit codes 3, 4, and 5 to `runtime.md` and invariant 23. C2: describe the agent's `/tmp/bot-<hash>` handle, the differing hook and gate value, and which the record holds. C6: delete the stale three-standing sentence at `auth.md:85-90`. C7: reconcile `home.md:115` with `:28`. C8: give the two stem rules two names. C10: replace the stdin-writing sentence with immediate EOF. C11: place the `$TMP` warning where `gating.ts:254` places it. C3 is G1 below.

The runtime moves for three. Ticket 0281 owns `bot/src/check.ts` and the C12 repair, so this ticket keeps `invocation.md` as written and touches no line of that file. C4: `flowBody` admits a `DESCEND.md` body, because `descend.md` calls the flow otherwise ordinary. C5: `parseFanout` passes an empty option-name list, so the four extra keys draw `key-unknown`. C9: `markTool.execute` rejects whitespace-only evidence as it rejects an empty skip reason.

Document U1 in full: the envelope shape and every stable `code` and `cause` string. Prove it the way `bot/tests/spec-vocabulary.test.ts` proves refusals: add a closed exported vocabulary beside `REFUSAL_CODES` in `bot/src/spine.ts` that every `CliFailure` draws from, then pin the specification to it both ways. Scan no source text. Also U2 `--script` and `model_source`; U3 `--timeout` and `--retries`; U6 the eight scrubbed credential names and `XDG_CACHE_HOME`; U7 the 250 ms grace, the 1 s and 5 s drain with its terminal fault, and the 250 ms `$TMP` cadence; U10 the 4 MiB request ceiling and its code; U11 `--correlation` and its 256-byte bound; U14 the two container faults; U20 the named bounds; U23 the retired-store path and `bot assembly create`. Fold U5, U12, and U17 in as a sentence each.

Exclude the rest. U4, U8, U9, U15, U21, and U22 are record and stage endings the record chapter owns. U16 is unexercised. U18 and U19 are internal mechanism. U13 is 0281's.

G1: `model-unresolved` is emitted only at `bot/src/machinery.ts:119`, which needs `models.getAvailable()`, and the corpus harness calls `check()` in `bot/src/reader.ts` with no Models coupling, so no static case can reach it. State that runtime-only exemption in invariant 50 and in `refusals.md`, and make `bot/tests/conformance.test.ts` read it from the specification instead of the literal `runtimeOnly` array. That is what `invariants-witnesses.md:117` already claims. Leave `specification/conformance/refuse/model-unresolved/` as it stands. G2: repair the four dead test names in the witness ledger. G3: re-walk the ledger against tickets 0270 through 0280 and restate its date. Exclude G4, because a model-free static corpus cannot witness runtime invariants, and G5, because the ledger already admits the code-versus-rule limit.

Fix S1 through S9. For S1 the specification says this publication is unreleased and targets `0.1.0` as the first public release, and the release ticket sets the final string. Three places enforce the old strings: `PUBLICATION_VERSION = "0.0.1"` at `bot/tests/spec-publication.test.ts:9`, the hardcoded `143` at `conformance.md:9`, and the version sentence at the repository `README.md:76`. Move all three. Leave `bot/package.json` to the release ticket. Give FANOUT a place in `graph.md`'s taxonomy, key table, and nesting exceptions, and in `stage.md`'s sentinel list. Hedge the stable FANOUT sentences. Label the three documents lacking a stability line. Move the open WSL qualification out of stable prose. Add `TMPDIR` to `runtime.md`'s environment list. Repair the nine dead CHANGELOG anchors. Say six control tools plus the conditional `subflow` grant.

Add one honest paragraph to the model-runtime or auth element on the private-file check: no `O_NOFOLLOW`, no ancestor directory check, same-account replacement still possible. Do not change `bot/src/model-runtime.ts`.

Write the changelog entry. Leave `bot/src/check.ts` and `docs/` alone; generated specification pages rebuild from `specification/` on their own.

## Acceptance

Start with failing tests. A `DESCEND.md` body reaches every stage's prompt and a whitespace-only one stays silent. `intelligence` on `FANOUT.md` draws `key-unknown`. Whitespace-only evidence rejects the mark and leaves the item `todo`.

The new vocabulary test fails when a declared code is unspecified and when a specified code is undeclared. Run it, `conformance.test.ts` at 143 cases with the exemption derived from `refusals.md`, `spec-publication.test.ts`, `spec-vocabulary.test.ts`, `spec-record-vocabulary.test.ts`, `cli-help.test.ts`, and `capabilities.test.ts` under `bot/tests/`, then `sdlc/scripts/spec` and the complete local gate `make check`.

## Dependencies

Ticket 0281 owns `bot/src/check.ts`, C12, and U13. This ticket touches no line of that file. 0281 also edits `specification/elements/inspection.md`, `specification/CHANGELOG.md`, the conformance corpus, and `bot/tests/conformance-passing.txt`, and this ticket edits all four. Rebase onto main after 0281 lands, before the final gate. Ticket 0279 set the assembly-check contract, left alone here.

## Risk facts

Three runtime behaviors change. `intelligence` on `FANOUT.md` starts refusing. A mark with whitespace evidence starts failing. A `DESCEND.md` body authors wrote and never saw now reaches prompts and changes model input.

The S1 statement replaces six normative sentences naming `0.0.1`, including the conformance-claim vocabulary. Ian can overturn the `0.1.0` target.

The error-code list is a new public compatibility surface. A published code is a promise, and the pinned vocabulary is what keeps it true.

## Size decision

- Starting production size: 18483 nonblank lines
- Ending production size:
- Simpler approach tried: Write the error codes as prose, or derive them by scanning source text.
- Why insufficient alternatives were rejected: Prose drifts on the next ticket. A text scan cannot tell a code from a test hook name.
- Production code added: A closed error-code vocabulary in `spine.ts`, evidence validation in `mark`, a fan-out option-name restriction, a `DESCEND.md` body path.
- Production code deleted: None. The `runtimeOnly` array leaves the test file for the specification.
- Accepted cost: Assemblies using the four ignored fan-out keys now refuse, and every new `CliFailure` must name a declared code.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: The error vocabulary and the version statement are new public compatibility decisions. The work spans the specification tree, the conformance corpus, the witness ledger, and three runtime behaviors. Proof needs a pinned vocabulary, not one assertion.
- Selected model: `claude-opus-5` with medium reasoning for implementation, design review, and code review

## Review

- Origin: the audit `sdlc/planning/notes/2026-09-14-review-specification.md`, with M3 and M4 from `2026-09-14-review-recent-work.md`.
- Design review: accepted after one rejection.
- Code review: pending
