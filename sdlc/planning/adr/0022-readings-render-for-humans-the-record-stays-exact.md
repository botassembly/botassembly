# ADR 0022 — Readings render for humans; the record stays exact

**Status: ACCEPTED** · **Date:** 2026-08-27 · **Author:** the architect seat, from Ian's UX direction of 2026-08-27 · **Amends:** nothing. ADR 0019 governs which words exist and what each answers; this ADR governs how a reading's human answer renders. No verb changes its name, its flags, or which answer it gives.

## Context

Bot's readings are correct and spartan. `bot runs` prints real columns but no header row, raw ISO timestamps, and raw token counts. `bot status` prints one line of six key-value pairs with raw byte counts. Humans scan these answers on a phone and agents read them mid-diagnosis; both deserve composed output. The 2026-08-27 UX assessment (workspace notes, botassembly reports) holds the evidence.

## Decision

1. **A reading that lists renders a labeled table.** A header row names each column, columns align, numbers right-align, identifiers print verbatim and complete.
2. **Human answers humanize magnitudes.** Tokens, bytes, and ages render for reading (`3.4M`, `2.1 GB`, `14m`); `--json` keeps exact values. Rendering never changes which answer a verb gives — that stays ADR 0019's law.
3. **Human output never truncates evidence.** Error text and stop reasons print whole; brevity comes from row limits, never an ellipsis inside content.
4. **One formatting helper renders every reading.** Alignment and humanization are one implementation in this repo, not a convention each verb re-earns.
5. **Color, if adopted, is semantic and optional**: state only, off when stdout is not a TTY, `NO_COLOR` honored.

## Consequences

Tickets implement per verb; review measures rendering changes against this bar; `--json` consumers see no change.

## Alternatives considered

A rendering dependency — rejected, bot stays zero-dependency and the helper is small. Leaving prose and pointing agents at `--json` — rejected, the human answer is the default answer and is read constantly in practice.
