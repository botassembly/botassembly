# ADR 0026 — One CLI serves people and programs

**Status:** accepted · **Date:** 2026-09-04 · **Ruled by:** Ian · **Supersedes:** ADR 0019's noun-or-verb hierarchy, flat-reading pattern, preserved-spelling promise, one-screen help rule, and command vocabulary

## Context

Bot currently exposes many flat commands with unrelated output conventions. People can read most answers, and programs can parse parts of them, but callers must remember which command emits JSON, JSON Lines, exact bytes, prose, or no output. Replacement automation and dashboard clients need a stable, composable interface. Bot must remain useful without either one.

## Decision

Bot organizes commands under five nouns: `run`, `assembly`, `auth`, `model`, and `home`. `capabilities` reports the supported command and contract surface. The CLI remains complete without a dashboard.

Human readings use Markdown by default. `--json` and `-j` select one versioned JSON value for finite answers. Each snapshot starts with `schemaVersion`, `kind`, and `data`. Lists also carry `page` and `summary`. Follow streams use JSON Lines. `--raw` writes exact artifact bytes and cannot be combined with rendered output. Standard output contains only the requested result. Progress and diagnostics use standard error. A successful JSON command carries warnings and truncation facts inside its result and writes no human warning to standard error.

Failures use one structured shape with a stable code, the failed operation, the immediate typed cause, and relevant identity. Lists accept typed filters, bounded limits, stable keyset cursors, field projection, and counts when the owning data can answer them without reading every detail. Repeatable filters and encoded and decoded cursors have published byte limits. Every emitted cursor remains safe to reuse as one command-line argument. A count retains numeric totals rather than the rows it counts. Filters apply before rendering and before expensive detail reads when possible. An empty valid list exits 0.

Human Markdown treats retained text as data. It renders controls visibly, escapes table and HTML syntax, and publishes cell, line, and document byte limits. Machine and human warnings share one bounded set and report the exact omitted count.

Global home selection follows one documented precedence: explicit `--home`, then `BOT_HOME`, then the platform default. Capability metadata states network behavior as `never`, `conditional`, or `requested`. `model list --live` owns requested provider catalog access. `capabilities --json` never contacts a provider.

Run mutations return one complete structured result. `--id-file` remains an explicit local supervisor channel that publishes the run id at start without contaminating standard output. A caller may supply `--correlation ID` when it starts or resumes a run. Bot records and returns that identifier as opaque metadata and can filter runs by it. The identifier does not provide uniqueness, replay, or idempotency. Durable replay remains deferred until a real caller proves that Bot must own it. `run events --follow --json` emits one complete event per line. `run record --raw` owns forensic record bytes.

The new surface may land with one temporary outer dispatch table for supported old spellings. Exact legacy JSON roots have live consumers, so the table routes old invocations to retained legacy renderers while both surfaces share the same readings. The table owns no rendering, validation, or domain behavior itself. The same change creates its deletion work item. A mechanical check rejects new supported callers that use old spellings. Bot deletes the table and legacy renderers after the old platform services stop and supported source contains no old caller. The 2026-09-11 ticket-sequence decision supersedes the pre-release deadline. Ticket 0217 now waits for evidence instead of a release date.

**2026-09-09 clarification:** Ian withdrew the public-release deadline on 2026-09-06. Deletion now follows verified migration or retirement of every retained current caller. Archived callers do not create replacement work. The one-CLI decision remains accepted.

## Consequences

The common parser and renderer require some shared infrastructure as commands move. Each migrated command must provide a useful vertical behavior. Capability discovery and other command migrations do not ride inside the first reading merely to build the shared infrastructure early.

The temporary translation table creates short-lived code. Its deletion condition and no-new-callers check keep that code from becoming an accidental compatibility promise.
