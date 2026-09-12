# ADR 0021 — Bot authentication follows Pi

**Status:** accepted with staged supersession by ADR 0030 · **Date:** 2026-08-20 · **Milestones:** Ticket 0244 ends the captured-authentication-environment, always-false file-probe, and sealed-from-Pi-configuration rules. Ticket 0245 ends the Bot-supplied live credential-file rule. Pi-owned authentication semantics, secret-safe reporting, and the no-secret stage rule remain subject to ADR 0030's arbitrary-local-configuration limit. · **Amends:** ADR 0017.

## Context

ADR 0017 gave bot an operator-owned credential file and `bot auth`. That closed
the loop for an interactive operator, but it did not answer three questions for
a machine adopted by a scheduler or for the next provider Pi adds: how a
headless machine receives credentials, what happens when a credential expires,
and who defines a provider's credential shape and login.

The pinned `@earendil-works/pi-ai@0.83.0` already answers those questions.
`Models.login` runs a provider-owned flow and persists its result through the
injected `CredentialStore`; `Models.getAuth` resolves stored or environmental
credentials. For OAuth, it refreshes a token with less than five minutes of
validity through `CredentialStore.modify`, rechecks under that lock, and keeps
the old credential when refresh fails. A stored credential wins over the
environment; Pi does not fall back to an environment key after that refresh
fails. Providers carry their own login, refresh, and credential shapes.

Bot already reaches those paths: `providerModels` supplies Pi's
`builtinModels` with the bot credential store and the run's environment
snapshot; `bot auth login` supplies only the terminal adapter. The store is the
necessary boundary exception. Pi-ai publishes the `CredentialStore` interface,
not Pi's persistent store, and Pi's small reference CLI writes a cwd-relative
`auth.json`; neither is bot's machine-wide, owner-only file. Bot therefore
keeps the conforming, atomic, locked store from ADR 0017, but it never owns
refresh or provider protocol code.

## Decision

### The rule

**Bot does what Pi does for authentication, through Pi's public provider and
Models APIs.** Bot supplies the credential-file boundary, environment snapshot,
terminal rendering, and secret-safe reporting. Pi supplies provider discovery,
credential shape, login flow, OAuth refresh, auth precedence, and provider
onboarding. Bot does not fork a provider flow, parse a provider protocol, or
invent a second credential configuration language.

The invariants are unchanged:

- credentials remain machine-wide, owner-only, absent from `config.yaml`, and
  never printed;
- a stored credential owns its provider and Pi's environment fallback answers
  only when no stored credential exists;
- runs resolve credentials from their boundary snapshot while stage shells
  receive none of the provider credential environment; and
- bot never reads another agent's store except through the explicit,
  operator-named `bot auth import` bridge.

The small boundary code is justified by those invariants. Its validation may
recognise Pi's current tagged credential forms so malformed files fail plainly,
but it preserves Pi-owned fields rather than giving them bot meanings. Any Pi
shape that its current store cannot preserve is a Pi-upgrade compatibility item,
not an invitation to coerce it into a bot shape.

### 1. Headless provisioning

`bot auth login` remains a terminal conversation. Bot adds no `--headless`,
`--device`, token-on-stdin, or bot-named credential environment variable. A
Pi flow decides whether it offers a browser, manual-paste, or device-code path;
bot renders that flow and does not select one using Pi's internal option ids.

A non-interactive job receives credentials the same two ways Pi does:

1. its launcher or secret manager supplies the provider's documented
   environment variables to bot's parent process; bot snapshots them for Pi
   and removes them from every stage environment; or
2. provisioning places a bot credential file containing a credential obtained
   through Pi, including by non-interactive `bot auth import <named-file>`.

The import is a provisioning bridge, not a runtime credential lookup. A
scheduler neither types a secret nor reads an arbitrary agent's home while
running. Provider environment names and their companion configuration values
remain a reviewed allowlist at the snapshot-and-scrub boundary; they are never
passed to a stage merely because Pi may consume them.

`PI_OAUTH_CALLBACK_HOST` remains Pi's documented, login-time callback binding
control. Pi currently reads it from the process rather than `AuthContext`; it
is not a credential and does not alter run authentication. Bot does not make
that residual ambient read a general provider-configuration channel.

### 2. Lifecycle and recovery

Bot relies on Pi's locked OAuth refresh at request-auth resolution. It does not
pre-refresh at `bot auth`, display expiry, rotate a credential itself, or prompt
for a login during a run. A job that needs an unattended credential uses its
provider's unattended mechanism from the first decision above, not an
interactive OAuth renewal hidden in a run.

A refresh failure leaves Pi's stored credential in place and makes the request
fail. Bot must make that failure safe and actionable: it ends the affected
stage and run as a fault, does not retry a rejected credential or fall back to
the environment, does not start an interactive login, and reports a fixed
recovery sentence without Pi's provider error text. The sentence directs the
operator to restore the credential before running again. This prevents an OAuth
response body or other provider diagnostic from becoming a terminal line or
record reason.

A credential that expires after a request starts is likewise a provider result,
not a prompt opportunity. The request may finish or fail as Pi and the provider
decide; bot's ordinary, bounded transport retry policy remains for errors Pi
marks retryable, not for authentication rejection.

### 3. Provider onboarding

Pi's built-in provider collection is bot's provider catalog. A Pi update that
adds a provider therefore brings Pi's provider id, credential shape, login
flow, refresh behavior, and environment resolution; bot must not add a
provider-specific parallel implementation. `bot auth` and `bot models` obtain
providers from that collection.

Every Pi pin update is an authentication compatibility review. If the update
adds or changes environment inputs, stored credential variants, login events,
or refresh behavior, its implementation ticket updates the explicit
snapshot-and-scrub boundary and its secret-leak proof before enabling that pin.
If Pi's public APIs cannot express the new behavior without weakening bot's
credential isolation, bot keeps the prior pin and raises the gap upstream or
as a separate ADR. The exception is evidence-based, never an unreviewed
provider-specific workaround.

## Consequences

- Follow-on provisioning guidance must document the two headless paths so an
  adopter does not mistake a terminal login for the only way to configure a
  scheduler.
- Follow-on implementation must make Pi credential refresh or rejection failure
  secret-safe and give its operator a stable recovery path. It does not add a
  refresh or login flag.
- Future provider work is normally a Pi pin update plus its compatibility
  review, not a bot provider feature. No speculative provider ticket is cut.
- ADR 0017's file ownership, import bridge, terminal adapter, and no-secret
  laws stand. Its claim that bot owns authentication is narrowed: bot owns the
  operator-facing boundary, while Pi owns authentication behavior.
