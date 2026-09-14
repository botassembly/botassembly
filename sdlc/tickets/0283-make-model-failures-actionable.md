---
flow: build
priority: 1
deps: [0281, 0282]
---
# Make model failures actionable

## Outcome

Every model failure names the model string, its rung, what the runtime observed, and one command. No message claims a catalog miss proves retirement or unavailability elsewhere.

## Current facts

Observed at `9699a10` with the installed `bot`, an isolated agent directory, `PI_OFFLINE=1`, and a `0700` home.

- `machinery.ts:119`, `model-unresolved`, exit `2`: `No provider offers a model named no-such-model-xyz. Name a model one of these providers offers: google, opencode, ...` That is a global claim, repeated verbatim for `provider: nosuchprovider` with the real `model: claude-opus-4-5`. Neither names a rung or command. The same site emits the useless `Configure a model.` when no rung names one, and an actionable ambiguity sentence when several providers hold the name. `intelligence-unresolved` (`machinery.ts:114`) is already actionable.
- A catalog-resolved model with no credential passes admission, births a run, and fails at the first stage: `fault: Provider is not configured: anthropic`, exit `2`, repeated as the run result reason. No model, no rung, no `bot auth login anthropic`. A provider refusal arrives verbatim: `fault: OpenAI API error (401): {"type":"CreditsError",...}`, exit `2`. `credentials.ts:180` renders a non-`Error` throw unactionably.
- `machinery.ts:101` already calls `getAvailable()` in the run-start walk, and offline that set omits every uncredentialed provider, so the credential gap is knowable before run birth with no model call.
- `bot run start --json` emits `details.refusals[]` of `code`, `path`, `message`, each bounded at 512 bytes by `run-start.ts:26`. `bot assembly check --json` emits unbounded `details.faults[]` of `code`, `path`, `sentence`.
- `check.ts` imports no `@earendil-works` module; record 0270 bars Pi from assembly management.
- Origin: `sdlc/planning/decisions/2026-09-13-evidence-based-completion-sequence.md:13`; archived ticket `0231` records the older mismatch.

## Scope

- Every model failure carries the authored model string, its rung (command, task, stage, flow, assembly, home, default), the observed cause, and one action.
- Cause and action pair up. Absent from the catalog, or the named provider lacks the name: `bot model list <provider>`. Held by several providers, or named at no rung: name one. No credential: `bot auth login <provider>`. The provider refused: repeat its status and message. The call failed before an answer: retry.
- Delete every sentence generalising beyond the catalog Bot read. Bot authors the credential and refusal reasons rather than passing Pi's string on.
- The no-credential case becomes a pre-birth refusal, not a post-birth fault: `getAvailable()` already answers at admission, no model call is needed, and a born run that cannot proceed leaves an unwanted record. It takes one new code, `credential-missing`, because `bot auth login <provider>` is an action neither existing code carries. A refusal after birth stays a `fault`.
- `credential-missing` enters `spine.ts` and the Resolution table of `refusals.md`, not Frontmatter. A static corpus cannot supply an uncredentialed provider, so `refusals.md` marks the code runtime-only with that reason, the way ticket 0282 marks `model-unresolved`, and `conformance.test.ts` derives the exemption from that text. A runtime test carries the proof.
- Each `details.refusals[]` entry gains `model`, `provider`, `rung`, `cause`, and `action`, `null` where absent. The four facts fit the 512-byte `message` bound at `run-start.ts:26`; raising it needs a deliberate specification change naming it.
- Exclude `bot assembly check`. It stays Pi-free under record 0270 and claims nothing about availability; consulting the catalog there would pull Pi and its owner-only preflight in.
- Update `refusals.md`, `record.md`, witnesses, help, guides, examples, changelog.
- Exclude new network calls, fetches, and probes.

## Acceptance

Start with failing tests. `bot/tests/cli-refusals.test.ts` asserts byte-exact stderr for each admission cause above, each naming the model, rung, and next command. A negative assertion proves no stderr or JSON message holds `No provider offers`, `retired`, or `unavailable`.

A `credential-missing` test proves a credential-less catalog model refuses before run birth, names model, rung, provider, and `bot auth login <provider>`, and births no run. Conformance passes closure with `model-unresolved` and `credential-missing` as the only runtime-only exemptions, both derived from `refusals.md`.

`bot/tests/model-runtime-wiring.test.ts` proves two post-birth reasons: an injected `401` repeats its status and text, and a non-`Error` throw names the model and retry. A JSON test pins field names, nulls, and the longest model and rung inside the 512-byte bound. Run those suites and examples, then `make check`.

## Dependencies

Ticket 0282 owns the `model-unresolved` conformance case and refusal vocabulary; 0281 repairs the runtime defects under it. This ticket rebases onto main after both land. ADR 0030 keeps Pi the availability owner.

## Risk facts

Readers of `details.refusals[]` see new fields, a new code enters the refusal vocabulary, and transcripts change pre-release.

A run that today births and fails at stage one now refuses without a record. `getAvailable()` is Bot's only offline credential evidence, so a credential it cannot see refuses a run that might succeed. Rewriting Pi's sentence hides a later Pi wording change.

## Size decision

- Starting production size: 18483 nonblank lines
- Ending production size:
- Simpler approach tried: Edit `unresolvedSentence`.
- Why insufficient alternatives were rejected: It leaves the credential and provider paths, which give no action.
- Production code added: Cause classification carrying model and rung, the `credential-missing` refusal, envelope fields.
- Production code deleted: The global-claim sentences.
- Accepted cost: Longer refusal text; one more code.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: Public text, a new code, and JSON fields change across resolution, runtime, and specification, and proof is byte-exact.
- Selected model: `claude-opus-5` medium reasoning implements; the same for design and code review

## Review

- Origin: Plan outcome 13.
- Design review: rejected once. The first draft had `bot assembly check` consult the catalog, reversing record 0270, and claimed an item 0282 owns.
- Code review: pending
