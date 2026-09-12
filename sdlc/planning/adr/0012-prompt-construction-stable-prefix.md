# ADR 0012 — Prompt construction and the stable prefix

**Status:** accepted (Ian, 2026-07-31); the second Consequences bullet is
superseded by ADR 0016 (Ian, 2026-08-05) — see below · **Date:** 2026-07-31

## Decision

The spec (`prompt.md`) says *what* the agent is told; this decides *how* it is
laid out, because the gating economics hang on it (ADR 0007: cache-read held
across rounds only when the prefix is byte-stable, and only past provider
cache minimums — P1's finding).

- **The system prompt is everything stable for the stage:** the assembly's
  purpose, the stage instruction (checklist heading included), the slot
  announcements, the skill and subflow name+line listings, and the schema's
  rendering. Built once per stage-repeat, byte-identical across every round
  of a held agent.
- **The first user turn is the variable part:** the input filenames as they
  stand after `before`, and the request framing. Send-backs append only the
  check's captured bytes; the LOOP question round appends only the question.
  Nothing ever edits earlier context (Pi's append-only invariant is also the
  cache's).
- **Ordering inside the system prompt is fixed by this ADR** (purpose,
  instruction, output contract, slots, skills, subflows, tools note) so two
  stages differ only where their content differs — small assemblies stay
  under provider cache minimums and see no cache reads; that is accepted, not
  fought with padding.
- The purpose body is inserted verbatim — the spec has no templating
  (assembly.md: the body enters every stage as written) and this ADR adds
  none.

## Consequences

- Prompt text is constructed in one module (`prompt.ts`) with golden-file
  tests, because every byte is contract: it decides both what the model knows
  (the spec's information-hiding rules) and what the cache re-reads.
- ~~The record does not store the prompt: it is reconstructible from the
  assembly's bytes plus this ADR's layout, and the record's assembly hash
  names which bytes those were (a hash identifies, it does not reconstruct —
  keeping the assembly is the operator's side of that bargain). The session
  holds what was actually sent.~~ **Superseded by ADR 0016 (2026-08-05):
  both halves were false — the session holds no system prompt, and
  `local-context: use` injects workspace bytes from no assembly. Ticket
  0118 retains the rendered system prompt and first user turn per
  stage-repeat, beside the session. The layout rules above stand.**
