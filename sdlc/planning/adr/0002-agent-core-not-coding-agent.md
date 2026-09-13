# ADR 0002 — Build on pi-agent-core, not pi-coding-agent

**Status:** accepted with staged supersession by ADR 0030 · **Date:** 2026-07-31 · **Milestone:** Ticket 0249 ends the coding-agent package ban only for the public package-root exports `ModelRuntime` and `getAgentDir`. The rest of this decision remains historical context.

## Decision

The runtime depends on `@earendil-works/pi-agent-core` (AgentHarness, Session,
JSONL session storage, tool definitions) and `@earendil-works/pi-ai`
(providers, models, streaming, retries). It does not depend on
`@earendil-works/pi-coding-agent` in any form. Pi is consumed as an SDK.

## Context

`pi-coding-agent` is the interactive product: TUI, trust prompts, jiti
extension discovery, settings/session managers — 3 MB of source and a 168 MB
install, none of it needed by a headless runtime that pre-bakes its behavior.
`pi-agent-core`'s core is ~2,200 lines with five light dependencies, and the
surface the runtime touches — `prompt`, `abort`, `tools`, `session`,
`observe` — is the least likely to churn. Building here also dissolves the
need for a coding-agent-level "stop hook" contract: gating rides on
`prompt()` resolution semantics instead (ADR 0007).

`pi-coding-agent` remains valuable as *reference* — its tool implementations
and extension examples show idiomatic use of agent-core — and its repo is read
freely; its package is never imported.

## Consequences

- The dependency set is small enough to audit by hand.
- Anything the coding agent does that we want (e.g. its bash tool patterns) is
  reimplemented against agent-core's public API or requested upstream as an
  agent-core export — never imported across the product boundary.
- The upstream ask list (ADR 0011) is aimed at agent-core/pi-ai exports, with
  stabilizing the harness's provisional prompt/idle semantics at the top.
