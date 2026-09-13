---
flow: build
priority: 1
deps: [0245, 0254]
---
# Auth logout uses the current command contract

## Outcome

Authentication logout uses the current dispatcher and removes only the selected provider credential.

## Current facts

Logout mutates Pi's shared authentication store through the legacy dispatcher.

## Scope

Add one `auth.logout` descriptor for `bot auth logout <provider>` with no aliases and only `--json`/`-j`. The exact provider is required and is at most 256 UTF-8 bytes. Reject missing, extra, repeated, or unknown requests before credential access. Keep the legacy auth root and unmatched legacy paths separately dispatched until their migration and retirement tickets; the exact logout route moves to the current dispatcher.

Resolve the raw provider argument by exact match, then use Pi's canonical `provider.id` in results and post-resolution diagnostics. Reject an identity over 256 UTF-8 bytes. JSON passes the bounded raw candidate on validation failures and the bounded canonical identity after resolution through the shared JSON encoder, which escapes controls without changing the value. Every human or diagnostic occurrence passes the same applicable identity through the exact shared `inertText(identity, 256).text` renderer; never interpolate either value directly. Pi 0.85.1 returns no atomic existed-or-removed value. Do not race `listCredentials()` against `logout()` to invent one. Make logout idempotent and always invoke Pi for a known provider. On ordinary success JSON emits one newline-terminated `{schemaVersion: 1, kind: "bot.auth.logout", data: {provider, result: "completed"}}` document. Human output emits one bounded completion sentence. `completed` means Pi's selected-provider delete transaction settled; it does not claim that a credential existed beforehand or that ambient authentication is disabled. Either result is less than 4,096 bytes.

The alternatives are a racy preflight list, a private credential-store transaction, or an idempotent completion result. Use the completion result. The racy list can lie during concurrent login, and the private transaction would bypass the required public Pi owner. The accepted cost is that callers cannot distinguish a deletion from an already-absent no-op. A future public Pi removal outcome can support a new result version.

Classify a public Pi `CredentialSynchronizationError` for operation `logout` as a post-mutation failure. The selected stored credential has been deleted. Emit the same truthful completion result on standard output, then one bounded structured `synchronization-failed` error on standard error, and exit 5. Set `retryable: false` because repeating is unnecessary and ambient authentication may still exist. Never replace this settlement with a generic failure.

Cancellation before Pi starts the delete emits no completion result, returns a structured `cancelled` error, and exits 1. Other request failures exit 2. Storage failures whose public settlement does not prove deletion emit no completion result, return a secret-free `logout-failed` error, and exit 5; the diagnostic makes no claim about stored state. Errors use the shared version-1 `error` document on standard error and the 2,048-byte human error bound.

Validate the whole request and provider through the credential-free catalog, then recheck cancellation before invoking ticket 0245's warning hook exactly once. Construct a dedicated Pi `ModelRuntime` only after strict directory and authentication-file ownership and mode checks. Give it the live `authPath`, `modelsPath: null`, `refreshOnCreate: false`, and `allowModelNetwork: false`, then call its public `logout`. Bot performs no credential read, authentication or availability check, or provider refresh before deletion. A stored command-valued credential is therefore deleted without evaluation. Pi owns parsing, the long-wait file lock, mutation, and typed post-delete synchronization. Add the current logout route to the table proof. Help and invalid requests do not warn. Bot adds no credential writer or lock.

## Contract decisions

The idempotent completion result and its accepted cost replace the unprovable `removed` Boolean above. Preserve that result after `CredentialSynchronizationError` because Pi documents the deletion as complete. The accepted cost is a mixed settlement with useful stdout and a nonzero exit; callers must inspect both. Mark it non-retryable because the selected stored entry is already absent at Pi's delete transaction point. Ambient credentials remain outside logout's control.

Do not log out another provider, clear the whole store, or import old credentials.

The accepted runtime replaces two rejected options. The general configured runtime refreshes before logout and can execute command-valued credentials. A private Bot writer bypasses Pi's supported mutation and typed synchronization API, duplicates its storage rules, and gives up Pi's 30-second lock acquisition window. Keep the dedicated no-refresh Pi runtime. Its cost is a second lightweight runtime instance for logout. A future Pi logout constructor can remove that instance without changing the command result.

## Acceptance

Tests cover selected-provider removal, another provider remaining, idempotent success when the selected credential is absent, unknown-provider refusal, corrupt storage, cancellation during provider lookup and runtime construction, human and JSON output, hostile secret-shaped values, bounds, exact exit codes, warning order, and the capability row. Hostile configured provider IDs include controls, terminal escapes, Markdown delimiters, and an over-bound identity; tests prove exact JSON escaping, inert bounded human and diagnostic rendering, and pre-access refusal of the over-bound identity. A real process fixture plants a command-valued stored credential and proves logout never executes it. Deterministic same-provider tests use separate Pi runtime instances to overlap logout with login and expired-OAuth refresh and prove serialized final states without relying on a preflight list. An 11-second held Pi file lock proves the production adapter keeps waiting instead of stealing or replacing the lock. A deterministic injected `CredentialSynchronizationError` proves the completion result remains on standard output with the nonzero settlement on standard error.

## Dependencies

0245 supplies authentication ownership, strict preflight, warning timing, and Pi's file lock. 0254 supplies safe provider identity. The dedicated Pi runtime keeps `ModelRuntime.logout` and its typed post-delete settlement without the general runtime's pre-delete refresh.

## Size decision

- Starting production size: 18991 nonblank lines
- Ending production size: 19139 nonblank lines
- Initial implementation diff: 119 added and 3 deleted nonblank lines. The earlier review incorrectly described those three replaced lines as no deletion.
- Remediated implementation diff: 152 added and 4 deleted nonblank lines.
- Simpler approach tried: Extend the legacy logout branch in `auth.ts`.
- Why insufficient alternatives were rejected: The legacy route cannot publish the current descriptor, bounded versioned result, stable error vocabulary, idempotent completion meaning, or truthful post-delete synchronization settlement without changing the maintained bare authentication surface.
- Production code deleted: Four replaced nonblank lines. The initial implementation replaced three; final remediation replaced one more. The legacy authentication root and unmatched paths remain during their compatibility window.
- Accepted cost: One 110-nonblank-line command owner keeps parsing, exact provider selection, settlement classification, and rendering local. The remaining 38 net new nonblank production lines dispatch, publish, and isolate the strict Pi runtime.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for destructive credential mutation
- Final level: 4
- Reasons: Logout deletes shared credential state and replaces an unprovable Boolean with a new idempotent public settlement. Concurrent access and target selection must not remove another provider or expose a secret.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if logout becomes recoverable through a public Pi transaction.

## Review

- Design review: accepted 2026-09-11 after two rejections replaced the unprovable `removed` value and made warning, interruption, post-delete synchronization settlement, and provider identity rendering exact
- Implementation: the focused owner passes 16 tests covering the descriptor, exact results, idempotence without a list preflight, validation and warning order, real-path command isolation, provider and runtime setup cancellation, stable secret-safe failures, truthful post-delete synchronization settlement, two-runtime same-provider login and refresh locking, and an 11-second Pi lock hold
- Code review: rejected 2026-09-11 because the general model runtime could execute stored commands during refresh, setup cancellation was not rechecked, the login lock proof used one runtime instance, and the size evidence omitted three replaced lines; remediated with a dedicated no-refresh credential runtime, deterministic setup-abort cases, two-runtime lock fixtures, and exact size accounting
- Code review: rejected again 2026-09-11 because that runtime used a private Bot writer with a shorter lock budget and no production-reachable typed synchronization; remediated by restoring Pi's supported `ModelRuntime.logout`, removing the private live writer, adding provider-lookup cancellation, and proving the production adapter across an 11-second Pi lock hold
- Code review: accepted 2026-09-11
