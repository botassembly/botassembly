---
flow: build
priority: 1
deps: [0245, 0254]
---
# Auth login uses the current command contract

## Outcome

Authentication login uses the current dispatcher and leaves one secret-safe final result after an interactive provider exchange.

## Current facts

Login mutates Pi authentication through the legacy dispatcher. Provider interaction and OAuth refresh can overlap shared durable credential state.

## Scope

Adopt Pi's public `ModelRuntime.login` owner. Add one `auth.login` descriptor for `bot auth login <provider>` with no aliases and only `--json`/`-j`. The exact provider is required and is at most 256 UTF-8 bytes. Reject missing, extra, repeated, unknown, ambient-only, or non-terminal requests before credential access. Keep the legacy auth root and unmatched legacy paths separately dispatched until their migration and retirement tickets; the exact login route moves to the current dispatcher.

Send prompts, URLs, device codes, progress, and all provider interaction to standard error. Honor both the command abort signal and each `AuthPrompt.signal`. Escape controls and bound each rendered interaction to 2,048 bytes, at most 100 interactions, and less than 65,536 bytes total. Crossing a bound cancels the flow before it can return a credential. Standard output contains no interaction.

Resolve the raw provider argument by exact match, then use Pi's canonical `provider.id` in results and post-resolution diagnostics. Reject an identity over 256 UTF-8 bytes. JSON passes the bounded raw candidate on validation failures and the bounded canonical identity after resolution through the shared JSON encoder, which escapes controls without changing the value. Every human or diagnostic occurrence passes the same applicable identity through the exact shared `inertText(identity, 256).text` renderer; never interpolate either value directly. On ordinary success, JSON emits exactly one newline-terminated `{schemaVersion: 1, kind: "bot.auth.login", data: {provider, authenticated: true, credentialType}}` document after Pi settles login. `credentialType` is `api_key` or `oauth`. Human output emits one bounded completion sentence. Either result is less than 4,096 bytes. Pi 0.85.1 returns a secret-bearing `Credential` and exposes no safe account identity, so this version publishes only its type discriminant. Never inspect or publish other returned fields. A future public safe account API requires a new result version.

Classify a public Pi `CredentialSynchronizationError` for operation `login` as a post-mutation failure. The credential has been persisted. Emit the same truthful success result on standard output, then one bounded structured `synchronization-failed` error on standard error, and exit 5. Set `retryable: false` because automatically repeating an interactive login can replace the new credential; a later invocation reloads the stored value. Never replace this settlement with a generic failure or claim that nothing was stored.

Before Pi starts the credential mutation, user or prompt cancellation emits no success result, returns a structured `cancelled` error, and exits 1. Request failures exit 2. A provider exchange failure emits no success result, returns a secret-free `dependency-failed` error without the provider's error text, and exits 4. A storage failure whose public settlement does not prove persistence emits no success result, returns a secret-free `login-failed` error and exits 5; the diagnostic makes no claim that storage stayed unchanged. All errors use the shared version-1 `error` document on standard error and the 2,048-byte human error bound.

Validate the whole request and provider through the credential-free catalog, then invoke ticket 0245's warning hook exactly once before constructing the credential-bearing runtime or reading Pi's store. Add the current login route to the table proof. Help and invalid requests do not warn. Pi owns same-provider login and refresh serialization; Bot adds no credential lock.

## Contract decisions

Publish only the credential type because Pi 0.85.1 has no public safe account identity. The accepted cost is that callers cannot display an account name. Preserve the success result after `CredentialSynchronizationError` because Pi documents the write as complete. The accepted cost is a mixed settlement with useful stdout and a nonzero exit; callers must inspect both. Mark it non-retryable to prevent an automatic second interactive exchange. Bound interaction rather than trusting provider text. The accepted cost is cancellation of a provider that exceeds 100 messages or 65,535 rendered bytes.

Do not implement old-store import or logout.

## Acceptance

Tests cover successful API-key and OAuth type results, provider refusal, ambient-only refusal, command and prompt cancellation before mutation, corrupt storage, human output, clean JSON standard output, every interaction channel and bound, hostile credential and provider error values, exact exit codes, warning order, and the capability row. Hostile configured provider IDs include controls, terminal escapes, Markdown delimiters, and an over-bound identity; tests prove exact JSON escaping, inert bounded human and diagnostic rendering, and pre-access refusal of the over-bound identity. A deterministic same-provider test uses Pi's real auth lock to overlap login with expired-OAuth refresh and proves one serial order with a valid final credential. A deterministic injected `CredentialSynchronizationError` proves persisted success remains on standard output with the nonzero settlement on standard error.

## Dependencies

0245 supplies Pi authentication ownership, strict preflight, and warning timing. 0254 remains an integration dependency for the shared safe provider projection. This implementation uses the already-public credential-free provider catalog boundary and does not import unfinished 0254 internals. Pi 0.85.1 supplies only the returned credential type as safe login metadata.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for credential mutation and concurrent refresh
- Final level: 4
- Reasons: Interactive provider work writes shared credentials. Cancellation, refresh, output separation, and secret handling need hostile proof.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if Pi's public login API cannot keep structured output separate from interaction.

## Review

- Design review: accepted 2026-09-11 after two rejections made safe result fields, cancellation, warning timing, post-write synchronization settlement, and provider identity rendering exact
- Code review: rejected 2026-09-11 because command cancellation incorrectly outranked Pi's typed proof of a persisted credential, real API-key persistence lacked a current-route proof, and the exact per-interaction, aggregate, count, and select boundaries lacked tests
- Code remediation: typed post-mutation settlement now outranks a concurrent abort. A real Pi API-key command proves exact persisted bytes and private directory and file modes. Exact tests cover a 2,049-byte interaction, aggregate overflow below 101 messages, success at 100 messages under the aggregate bound, failure at message 101, and select interaction. Pending independent re-review.
- Code re-review: accepted 2026-09-11 after the settlement precedence, real persistence, and exact interaction-boundary remediations were independently verified

## Size decision

- Starting production size: 18574 nonblank lines at the accepted integration boundary.
- Ending production size: 18797 nonblank lines.
- Production change: net +223 nonblank lines.
- Remediation size: unchanged at 18797 nonblank production lines; the settlement branches only changed order.
- Simpler approach tried: Extend the legacy authentication renderer and storage wrapper with a JSON arm.
- Why insufficient alternatives were rejected: The legacy owner exposes path-bearing prose and untyped failure settlements. It cannot preserve the current one-document result, bounded provider interaction, typed post-persistence settlement, and separate legacy dispatch without changing callers that remain until tickets 0247 and 0217.
- Production code deleted: No behavior owner was deleted. Four existing registration lines were replaced to add the current descriptor, help screen, and dispatch route.
- Accepted cost: One 203-nonblank-line command owner isolates request validation, safe interaction, Pi login, and truthful synchronization settlement. Twenty additional net production lines publish and route the contract. The combined integration batch owns the final shared ratchet decision.
