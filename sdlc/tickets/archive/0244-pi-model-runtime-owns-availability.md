---
flow: build
priority: 1
deps: [0249]
---
# Pi ModelRuntime owns provider and model availability

## Outcome

Run, resume, and model listing resolve providers and models through one Pi ModelRuntime built from the operator's local Pi configuration.

## Current facts

Installed Pi reports 134 locally configured models while Bot reports 112. Pi ModelRuntime combines built-ins with local model configuration. The current machine uses an owner-controlled `models.json` symlink whose resolved file is owned by the current user and is not world-writable.

## Scope

Create one asynchronous Bot-owned ModelRuntime construction path. Inject Bot's current credential store until 0245 changes credential ownership. Pass the ModelRuntime through request preparation and place Bot's retry wrapper at the selected model stream boundary.

Support built-in and declarative providers, custom headers, environment references, and command-backed configuration values through Pi's public API. Resolve the Pi agent directory once at the production boundary. Tests inject temporary paths and runtime factories.

Treat local Pi model configuration as trusted operator input. Permit an owner-controlled symlink. Require the agent directory to be owned by the current user and not world-writable. Require the resolved model file to be regular, owned by the current user, and not world-writable. Fail before provider contact when configuration is unreadable, corrupt, or fails validation.

Construct with `refreshOnCreate: false`, reject `ModelRuntime.getError()`, and then perform the ordinary offline refresh. Startup may resolve local environment, file, and command-backed authentication. It must not request a model stream or make a model-catalog network request. Permit a catalog network refresh only through an explicit request. `PI_OFFLINE` vetoes that refresh. Do not load extensions, use deep imports, add fallback models, or claim that local configuration forms a sandbox.

Publish the arbitrary-configuration environment limit from ADR 0030. Preserve the existing proof that every built-in Pi credential environment name is removed from stage environments even though ModelRuntime reads the live parent-process environment.

## Acceptance

Offline tests cover missing configuration, the current owner-controlled symlink shape, rejected world-writable or foreign-owned files, corrupt configuration, custom providers and models, headers, environment references, command-backed values, and exact unknown-model refusal. Tests prove no model stream or catalog network request on startup or configuration failure. Explicit refresh and `PI_OFFLINE` behavior are distinct. Documentation names the arbitrary environment limit. Stage-environment tests cover every built-in Pi credential environment name.

Run, resume, and model listing use the same injected runtime. Provider-specific session attribution remains correct. The previously observed locally configured model appears through Bot when it appears through the same Pi runtime.

## Size decision

- Starting production size: 17046 nonblank lines
- Ending production size: 17142 nonblank lines
- Simpler approach tried: The first implementation kept Bot's provider-level retry wrappers and marked wrapped model collections to avoid retrying twice at the harness boundary. It also awaited live refresh without inspecting Pi's typed settlement.
- Why insufficient alternatives were rejected: Provider wrapping cannot cover declarative providers owned by ModelRuntime without rebuilding Pi's private composition. Independent runtime construction in run, resume, and listing would split availability and configuration state. Ignoring an aborted or failed refresh reports stale local rows as live success. Throwing the first provider error would expose an unbounded provider-controlled diagnostic and discard Pi's multi-provider settlement.
- Production code deleted: 41 lines, including provider mutation and the mutable live-catalog swap.
- Accepted cost: 96 additional nonblank lines. The 84-line runtime implementation provides one validated, memoized production runtime; owner and mode checks; public declarative configuration; offline startup; explicit catalog refresh; and one selected-model retry owner. The 12-line remediation inspects typed live-refresh settlement, returns one bounded provider-name diagnostic, and suppresses stale rows after an aborted or failed refresh.

## Dependencies

0249 supplies compatible Pi packages and the migrated harness adapter.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for security-sensitive local command and endpoint configuration
- Final level: 4
- Reasons: One runtime must govern several public paths. Configuration can redirect requests or execute operator-supplied commands. Corrupt or untrusted state must fail before a network effect.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation changes credentials, extensions, or public command results.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after two remediation rounds closed live-refresh reporting and acceptance-proof gaps
