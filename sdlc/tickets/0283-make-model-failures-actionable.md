---
flow: build
priority: 1
deps: []
---
# Make model failures actionable

## Outcome

Every model failure names the model string, its rung, what the runtime observed, and one command to run. No message claims a catalog miss proves retirement or global unavailability.

## Current facts

Observed at `084c956` with the installed `bot`, an isolated `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`, and a `0700` home.

- `machinery.ts:119`, `model-unresolved`, exit `2`: `No provider offers a model named no-such-model-xyz. Name a model one of these providers offers: google, opencode, opencode-go, zai.` The first sentence is a global claim. The identical sentence appears for `provider: nosuchprovider` with `model: claude-opus-4-5`, which `bot model list anthropic` prints. Neither names a rung or a command. The same site emits `Configure a model.` for no model at any rung, and the actionable `Name one provider for this model: <providers>.` for an ambiguous name.
- `machinery.ts:114` and `check.ts:106,394`, `intelligence-unresolved`, exit `2`: `Define an intelligence named ghost in the home configuration, or name one it defines: default.` Actionable.
- `bot assembly check` never calls `modelFaults`, so an assembly whose model no catalog holds exits `0` there and is refused by `bot run start`.
- A catalog-resolved model with no credential passes admission, births a run, and fails at the first stage in Pi's words: `fault: Provider is not configured: anthropic`, exit `2`, repeated as the `bot.run.result` reason. No model, no rung, no `bot auth login anthropic`. A provider refusal arrives verbatim: `fault: OpenAI API error (401): {"type":"CreditsError",...}`, exit `2`. `credentials.ts:180` renders a non-`Error` throw as `The provider retry failed with a non-Error value.`
- Admission refusals reach JSON as `details.refusals[]` of `code`, `path`, `message`; run-time faults as one `reason.text` string (`record.md:86,90`).
- Origin: `sdlc/planning/decisions/2026-09-13-evidence-based-completion-sequence.md:13`, archived ticket `0231-bot-and-pi-availability-mismatch.md`, and `sdlc/planning/notes/2026-09-14-review-specification.md` C3 and G1; `model-unresolved` has no conformance case and is exempted at `conformance.test.ts:197`.

## Scope

- Every model failure carries the model string as authored, its rung (command, task, stage, flow, assembly, home, default), the observed cause, and one action.
- Cause and action pair up. Absent from the local catalog, or the named provider holds no such name: `bot model list <provider>`. Held by several providers, or named at no rung: name one. No credential: `bot auth login <provider>`. The provider refused: repeat its status and message and invent no remedy. The call failed before an answer: retry.
- Delete every sentence generalising beyond the catalog Bot read. Bot authors the credential and refusal reasons rather than passing Pi's string through.
- Keep `model-unresolved` and `intelligence-unresolved` and add no code. The credential gap and the refusal stay run-time faults, so their action rides in the reason.
- Each `details.refusals[]` entry gains `model`, `provider`, `rung`, `cause`, and `action`, `null` where absent. Run-time faults keep one string and no record field.
- `bot assembly check` reports `model-unresolved` wherever `bot run start` would refuse.
- Update `refusals.md`, `record.md`, the conformance corpus, witnesses, help, guides, examples, and the changelog. Give `model-unresolved` a case and drop `runtimeOnly`.
- Exclude new network calls, catalog fetches, provider probes, the human-versus-JSON exit-code gap, and `retryable` on `dependency-failed`.

## Acceptance

Start with failing tests. `bot/tests/cli-refusals.test.ts` asserts byte-exact stderr for each admission cause above, each line naming the model, the rung, and the next command. A negative assertion proves no stderr line and no JSON message holds `No provider offers`, `retired`, or `unavailable`.

`bot/tests/model-runtime-wiring.test.ts` proves three run-time reasons: a credential-less catalog model names model, rung, provider, and `bot auth login <provider>`; an injected `401` repeats that status and text with no remedy; a non-`Error` throw names the model and retry.

`bot/tests/assembly-procedure.test.ts` proves check and start refuse one assembly with the same codes and paths. A JSON test pins field names and nulls across both modes, and conformance passes closure with no exemption list. Run those suites plus documentation and examples, then `make check`.

## Dependencies

ADR 0030 fixes Pi as the availability and credential owner, and this ticket adds no Pi call. Ticket 0279 owns the assembly-check rows, and a refusal changes none.

## Risk facts

Readers of `details.refusals[]` see new fields. Transcripts and conformance expectations change before the first advertised compatibility point. Reporting `model-unresolved` in `bot assembly check` makes a check fail that passes today. Bot rewriting Pi's credential sentence hides a later Pi wording change. `ResolvedOptions.from` already carries the rung.

## Size decision

- Starting production size: 18483 nonblank lines
- Ending production size:
- Simpler approach tried: Edit `unresolvedSentence` only.
- Why insufficient alternatives were rejected: That leaves the credential and provider paths, which give no action, untouched.
- Production code added: Cause classification carrying model and rung, run-time reasons, refusal fields, the check-side walk.
- Production code deleted: The global-claim sentences and the exemption list.
- Accepted cost: Longer refusal text; a check fails on an unconfigured model.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: Public text and JSON fields change, the work spans resolution, checking, runtime, specification, and conformance, and proof is byte-exact.
- Selected model: `claude-opus-5` medium reasoning implements and reviews design and code

## Review

- Origin: Plan outcome 11 and the completion sequence decision. One fixture run reached a live provider and returned the 401 recorded above; no live run followed.
- Design review: pending
- Code review: pending
