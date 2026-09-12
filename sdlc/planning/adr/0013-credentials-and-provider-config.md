# ADR 0013 — Credentials and provider configuration

**Status:** accepted with staged supersession by ADR 0030 · **Date:** 2026-07-31 · **Milestones:** Ticket 0244 ends this ADR's rejection of `ModelRuntime`. Ticket 0245 ends its separate-store outcome. The public credential-store contract and no-hand-rolled-reader rules remain until those milestones.

## Decision

**V1 builds no auth machinery at all.** The runtime uses pi-ai's default
resolution as shipped: per-provider environment variables
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, … — pi-ai's own table), injected
through `createModels()`/`builtinModels()` on public API. No `bot auth`
command, no `$BOT_HOME/auth.json`, no credential store of our own. Pi's
default models and providers are the v1 catalog.

**Subscription reuse (OAuth logins the user made in the interactive agent) is
a supported goal, deferred one step.** The research established it is safe
through Pi's public path: the file-backed store uses `proper-lockfile` for
cross-process locking, and pi-ai owns refresh-token rotation inside
`store.modify()` under that lock — an embedder and the interactive agent
cannot clobber each other's rotated tokens. What blocks v1 is packaging, not
safety: that layer (`ModelRuntime`, `AuthStorage`) lives in
`pi-coding-agent`, which ADR 0002 bans. The standing rule therefore narrows
from "never read `~/.pi/agent/auth.json`" to: **never through a hand-rolled
reader or shim** — only through Pi's own locking store implementation,
whichever package it ships in when we adopt it.

Getting there is upstream ask #7 (ADR 0011): move the auth/model-runtime
layer down into pi-ai or agent-core so embedders get stored logins and OAuth
refresh without depending on the interactive product. If upstream declines,
the fallback decision — a scoped exception to ADR 0002 admitting only
`ModelRuntime`, versus reimplementing a locking store against pi-ai's public
`CredentialStore` interface — is taken then, as its own reviewed event, not
now.

**Reviewed event, 2026-08-01 (Ian's rulings: no upstream asks will be
filed; ticket 0012 approved).** The fallback taken is the conforming
store against pi-ai's public `CredentialStore` interface — NOT the
pi-coding-agent exception (whole-product dependency, no granular
export, version lockstep; see ticket 0012). The rule narrows once
more, to its final form: **credential access only through a conforming
`CredentialStore` injected into pi-ai; token/refresh logic never in
our code (pi-ai runs refresh inside `store.modify()`); lock protocol
identical to pi-coding-agent's (`proper-lockfile@4.1.2`, same
options, on the credential file's own path); the file path arrives
only via environment (`BOT_AUTH`) — never hardcoded, keeping the
`~/.pi` lint ban intact, and never via `config.yaml`, whose keys the
spec closes.** Prototype evidence and risk ledger: ticket 0012.

## Context

The earlier draft invented a parallel auth world (`bot auth`, our own
auth.json) on the belief that touching the interactive agent's store was
inherently corrupting. The research showed the corruption hazard is real only
for naive readers — P1's shim *would* have dropped rotated tokens had a
refresh occurred; it wrote back atomically and none did — while Pi's own
store is designed for exactly this concurrent reuse. Building a second
credential store to avoid a solved problem is the kind of duplication ADR
0001 exists to refuse. There is no `pi-multipass` in the Pi checkout;
the blessed extension pattern for new providers is
`registerProvider(createProvider({...auth}))` with Pi's core owning storage —
the same lesson: providers plug in, stores don't multiply.

Subscription terms are the operator's business, not the runtime's: Pi's own
docs note Codex subscriptions are endorsed for third-party harnesses while
Anthropic plans bill harness usage as per-token extra usage. The runtime
resolves what Pi resolves and records which model ran; what a token is
allowed to do is between the operator and their provider.

## Consequences

- `home.md`'s `config.yaml` keeps naming providers/models only — no secrets
  in config, ever; the spec stays silent on credentials, which are the
  runtime's business.
- V1 setup instructions are one line: export your provider's API key.
- Prototypes may keep using the interactive store read-only for convenience;
  runtime code may not touch `~/.pi` paths at all until the subscription
  step lands through Pi's own store (the deep-import lint also bans `~/.pi`
  literals in `src/`).
- The open question "provider configuration and the ambiguous-provider
  refusal" (open-questions.md) is narrowed by v1: with Pi's catalog as the
  only catalog, provider ambiguity is resolved or refused by pi-ai's own
  resolution, and the spec's `model-unresolved` ambiguity arm maps to what
  pi-ai reports.
