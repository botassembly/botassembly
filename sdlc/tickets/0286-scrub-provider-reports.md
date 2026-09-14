---
flow: build
priority: 1
deps: [0283]
---
# Scrub recognized credentials from provider reports

## Outcome

A provider error report holding a credential value that this run supplied through a recognized environment name never reaches stderr, the `--json` envelope, or the run record. The report stays otherwise verbatim inside its bound, and 0283's sentence shape holds.

## Current facts

Observed at `008f41a`. Origin: `sdlc/issues/2026-09-14-provider-report-unscrubbed.md`.

- `credentials.ts:181-191` builds `providerReport` from `reason.message`, then its cause's `message` and `code`. `credentials.ts:192-197` embeds it verbatim in the 0283 sentence, bounded at 2,048 bytes, unscrubbed.
- Two paths carry Pi's `errorMessage` unbounded and unscrubbed: `credentials.ts:226` on an exhausted retry or a non-retryable error, and `credentials.ts:242` when a model carries no retry context. Pi sets it from the formatted provider error (`pi-ai/.../openai-responses.js:155`); `turns.ts:60` makes it the fault reason.
- `pi-tap.ts:204` writes `diagnostic.error.message` from a transport failure into the `provider_transport` record event, a fourth path. The catch at `credentials.ts:233` reports Bot's own append failure, not a provider's.
- A fault reason reaches stderr, the record's `result` event (`run-result.ts:34`), and the 512-byte refusal `message` (`run-start.ts:41`).
- The registry is `CREDENTIAL_ENVIRONMENT_NAMES` in `credential-environment.ts`, 53 names. It answers Pi's `env()` at `credentials.ts:118-126` for the runtime at `:245`, and `scrubCredentialEnvironment` at `:127-131` deletes those names from `flow.ts:223`'s child environment. It redacts no value. Pi also resolves credentials from `auth.json` and `models.json`, under ADR 0030 step 5.

## Scope

- Add one redactor over the registry. It reads `process.env` at redaction time, the same live environment ADR 0030 admits as an authentication input; no new parameter threads through `harness.ts:353`. It replaces each occurrence of a recognized name's nonempty value with a marker. Apply it at `credentials.ts:192-197`, `:226`, `:242`, and `pi-tap.ts:204`.
- Bound after redaction so a cut never splits a credential. The 0283 sentence shape otherwise holds.
- State the limit beside the fault sentence at `specification/elements/record.md:187`: matching is pattern-based over recognized environment names, misses a credential Pi resolves from `auth.json` or `models.json`, and cannot prove a secret absent.
- Delete the issue file in the same commit. Exclude detection patterns beyond the registry, `check.ts` (Pi-free under record 0270), and Pi's session files.

## Acceptance

Start with failing tests. `bot/tests/credentials.test.ts` plants a synthetic value under each recognized name and asserts the marker and the value's absence in a report echoing it. `bot/tests/model-runtime-wiring.test.ts` drives a fake provider whose error body echoes a synthetic credential, asserting stderr bytes, the `--json` refusal `message`, and the record's result reason. `bot/tests/provider-retry.test.ts` proves the exhausted retry and the unchanged clean report. `bot/tests/pi-tap.test.ts` proves the redacted `provider_transport` message.

Run those suites, then the complete local gate `make check` at the root: `sdlc/scripts/spec`, `sdlc/scripts/lint`, `sdlc/scripts/test`, in the foreground.

## Dependencies

Ticket 0283 owns the scrubbed sentence and has landed. ADR 0030 assigns secret-safe diagnostics to Bot.

## Risk facts

Redaction changes provider text a reader may match on. A short or common value redacts unrelated text. A provider that encodes or truncates the credential defeats the match. Credentials Pi resolves from `auth.json` or `models.json` are not in the environment and stay unredacted. Bot does not read them. Pattern scanning cannot prove a secret absent.

## Size decision

- Starting production size: 18817 nonblank lines
- Ending production size:
- Simpler approach tried: Drop the provider report.
- Why insufficient alternatives were rejected: The provider's status and text are the only honest account of a refusal.
- Production code added: One redactor and four call sites.
- Production code deleted: None expected.
- Accepted cost: A redaction can hide wanted text.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: Four public text surfaces change together, proof is byte-exact under failure injection, and a wrong redactor gives false assurance. It adds no exposure, so no level 4 floor applies.
- Selected model: `claude-opus-5` medium reasoning implements; the same for design and code review

## Review

- Origin: Issue `2026-09-14-provider-report-unscrubbed.md`, held by record 0283.
- Design review: rejected once. The draft overclaimed the outcome, missed `pi-tap.ts:204`, left the value seam unnamed, and excluded no session files.
- Code review: pending.
- Completion: pending.
