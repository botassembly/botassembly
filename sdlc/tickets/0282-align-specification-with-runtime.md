---
flow: build
priority: 2
deps: []
---
# Align specification with runtime

## Outcome

A reader who never opens `bot/src` can predict every exit code, refusal code, structured error code and cause, CLI option, environment variable, and bound the runtime exposes. Four places where the specification holds the better contract move the runtime.

## Current facts

The audit `sdlc/planning/notes/2026-09-14-review-specification.md` found 12 contradictions, 23 unspecified behaviors, 5 conformance gaps, and 10 consistency problems at `084c956`. Its four runtime-side items were re-verified.

- `bot/src/graph.ts:368-370` returns `{}` for any sentinel but `FLOW.md`, so a `DESCEND.md` body never reaches a prompt. `flow.md:41-43` makes a body the shared procedure and already silences a whitespace-only one.
- `bot/src/fanout-authored.ts:24` calls `validateData` without `optionNames`, so `documents.ts:315` admits `timeout`, `retries`, `local-context`, and `intelligence`. `:32` discards them. `documents.ts:263-275` already gives an unknown key `key-unknown`.
- `bot/src/tools.ts:112-124` never inspects `params.evidence`, against `checklist.md:55-57`. `bot/src/check.ts:105` and `:393` suppress `intelligence-unresolved` for a valueless `--intelligence`, against `invocation.md:118-119`.
- `bot/tests/conformance.test.ts:197` carries `const runtimeOnly = ["model-unresolved"];`. `invariants-witnesses.md:117` denies that list exists. `bot/src/new-command-result.ts:41-44` defines a JSON error envelope the specification never shows.

## Scope

The specification moves for seven contradictions. C1: add exit codes 3, 4, and 5 to `runtime.md` and invariant 23. C2: describe the agent's `/tmp/bot-<hash>` handle, the differing hook and gate value, and which one the record holds. C6: delete the stale three-standing sentence at `auth.md:85-90`. C7: reconcile `home.md:115` with `:28`. C8: give the two stem rules two names. C10: replace the stdin-writing sentence with immediate EOF. C11: place the `$TMP` warning where `gating.ts:254` places it. C3 is G1 below.

The runtime moves for four. Ticket 0281 owns `bot/src/check.ts` and carries the C12 repair, so this ticket keeps `invocation.md` as written and adds no C12 change. C4: `flowBody` admits a `DESCEND.md` body, because `descend.md` calls the flow otherwise ordinary. C5: `parseFanout` passes an empty option-name list, so the four extra keys draw `key-unknown`. C9: `markTool.execute` rejects whitespace-only evidence as it rejects an empty skip reason.

Document U1 in full: the envelope shape and every stable `code` and `cause` string, with a test deriving the list from `bot/src` that fails when either side drifts. Also U2 `--script` and `model_source`; U3 `--timeout` and `--retries`; U6 the eight scrubbed credential names and `XDG_CACHE_HOME`; U7 the 250 ms grace, the 1 s and 5 s drain with its terminal fault, and the 250 ms `$TMP` cadence; U10 the 4 MiB request ceiling and its refusal code; U11 `--correlation` and its 256-byte bound; U14 the two container faults; U20 the named bounds; U23 the retired-store path and `bot assembly create`. Fold in U5, U12, and U17 as a sentence each.

Exclude the rest. U4, U8, U9, U15, U21, and U22 are record and stage endings the record chapter owns. U16 is unexercised. U18 and U19 are internal mechanism. U13 is 0281's.

G1: add a `refuse/model-unresolved` conformance case with the real code and delete `runtimeOnly` from `bot/tests/conformance.test.ts`. G2: repair the four dead test names in the witness ledger. G3: re-walk the ledger against tickets 0270 through 0280 and restate its date. Exclude G4, because a model-free static corpus cannot witness runtime invariants, and G5, because the ledger already admits the code-versus-rule limit.

Fix S1 through S9. For S1 the specification says this publication is unreleased and targets `0.1.0` as the first public release, and the release ticket sets the final string. Give FANOUT a place in `graph.md`'s taxonomy, key table, and nesting exceptions, and add it to `stage.md`'s sentinel list. Hedge the stable FANOUT sentences. Label the three documents lacking a stability line. Move the open WSL qualification out of stable prose. Add `TMPDIR` to `runtime.md`'s environment list. Repair the nine dead CHANGELOG anchors. Say six control tools plus the conditional `subflow` grant.

Add one honest paragraph to the model-runtime or auth element on the private-file check: no `O_NOFOLLOW`, no ancestor directory check, same-account replacement remains possible. Do not change `bot/src/model-runtime.ts`.

Write the changelog entry. Leave the rest of `bot/src/check.ts` and all of `docs/` alone. Generated specification pages rebuild from `specification/` on their own.

## Acceptance

Start with failing tests. A `DESCEND.md` body reaches every stage's prompt and a whitespace-only one stays silent. `intelligence` on `FANOUT.md` draws `key-unknown`. Whitespace-only evidence rejects the mark and leaves the item `todo`.

The new vocabulary test enumerates every structured error code and cause from `bot/src` and fails on one the specification does not name. Run it, `conformance.test.ts` at 144 cases with no `runtimeOnly` list, `spec-publication.test.ts`, `spec-vocabulary.test.ts`, `spec-record-vocabulary.test.ts`, `cli-help.test.ts`, and `capabilities.test.ts` under `bot/tests/`, then `sdlc/scripts/spec` and the complete local gate `make check`.

## Dependencies

Ticket 0281 owns `bot/src/check.ts` and U13. This ticket touches only the two `valueless` guards there, so sequence them and let the later rebase. Ticket 0279 set the assembly-check contract. This ticket leaves it alone.

## Risk facts

Three runtime behaviors change. `intelligence` on `FANOUT.md` starts refusing. A mark with whitespace evidence starts failing. A `DESCEND.md` body authors wrote and never saw now reaches prompts and changes model input.

The S1 statement replaces six normative sentences naming `0.0.1`, including the conformance-claim vocabulary. Ian can overturn the `0.1.0` target.

The error-code list is a new public compatibility surface. A published code is a promise, and the generated test is the only thing keeping it true.

## Size decision

- Starting production size: 18483 nonblank lines
- Ending production size:
- Simpler approach tried: Write the error codes as prose and check nothing.
- Why insufficient alternatives were rejected: A hand-written list of 27 or more codes drifts on the next ticket. That is how this gap formed.
- Production code added: Evidence validation in `mark`, a fan-out option-name restriction, a `DESCEND.md` body path, a conformance case.
- Production code deleted: Two `valueless` guards and the `runtimeOnly` exemption.
- Accepted cost: Assemblies using the four ignored fan-out keys now refuse.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: The error vocabulary and the version statement are new public compatibility decisions. The work spans the specification tree, the conformance corpus, the witness ledger, and four runtime behaviors. Proof needs a generated check, not one assertion.
- Selected model: `claude-opus-5` with medium reasoning for implementation, design review, and code review

## Review

- Origin: the independent audit `sdlc/planning/notes/2026-09-14-review-specification.md`, with M3 and M4 from `2026-09-14-review-recent-work.md`.
- Design review: pending
- Code review: pending
