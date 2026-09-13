# ADR 0027 — One root command runs the complete offline check

**Status:** accepted · **Date:** 2026-09-06 · **Ruled by:** Ian · **Supersedes:** the root Makefile boundary that directs complete checks to `bot/`

## Context

Bot's runtime Makefile owns its static and test implementations. The project lint script also checks generated documentation. A contributor could run the runtime check, miss a red project check, and still describe the result as complete. Tickets 0019 through 0027 crossed that gap before ticket 0028 repaired the documentation failure.

## Decision

The repository root exposes one offline `make check` command. The target only composes the existing project lint and test ladders. Those ladders and `bot/Makefile` continue to own their checks. Bare `make` remains help. The live smoke ladder remains separate and never runs from the complete check.

Every completion record reports root `make check`. A green subset may support focused development but cannot complete a ticket.

## Consequences

One command now answers whether the whole repository is fit. The root Makefile gains coordination responsibility but no check implementation. Small documentation changes pay for the full offline gate before completion.
