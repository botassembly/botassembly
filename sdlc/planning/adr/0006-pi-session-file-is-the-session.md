# ADR 0006 — Pi's session file is the session artifact

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

Each stage-repeat's `AgentHarness` writes its session through Pi's
`JsonlSessionStorage`, pointed directly at the record layout
(`stages/<stage>/<repeat>/session.jsonl`). That file — Pi's native format — is
the session the specification means. The runtime never maintains a second
transcript, never re-serializes messages, and the record references the
session rather than containing it.

## Context

The specification already allows this: session.md says the session file's
format is the runtime's agent library's own, and inspection renders it. The
predecessor maintained a bot-owned transcript format beside Pi's and its own
ticket 260 named that "the single largest source of complexity" in resume.
The inversion is free: Pi's storage takes a file path.

## Consequences

- `bot session` rendering is written against Pi's session schema, pinned with
  Pi (ADR 0003); `--raw` is a byte copy.
- Per-turn facts the record needs (usage, tool calls, stop reasons) come from
  the live event stream at run time (ADR 0008), not from re-parsing session
  files afterward.
- If Pi's session format changes at an upgrade, old runs stay readable because
  the reader that renders them is pinned alongside — and the record never
  depended on the session's internals.
