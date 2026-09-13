---
flow: build
priority: 1
deps: []
---
# A current command reads a complete run record

## Outcome

`bot run events RUN` reads the complete root record or one referenced child record through the current command surface. Human Markdown and one versioned JSON document preserve the useful behavior of legacy `bot show` without preserving its spelling.

## Current facts

`bot run show` returns a bounded summary. It omits choices, gates, hooks, costs, and child records. `bot run record --raw` returns exact root bytes for forensic use. The README and guides still teach legacy `bot show` for a complete reading. ADR 0026 names `run events` as the current direction.

## Scope

Add `run.events` to the command contract, capability inventory, dispatch, help, specification, documentation, and conformance boundary. Support `bot run events RUN [--child REFERENCE] [--json|-j] [--home DIR]`. Preserve the legacy human rendering for root and child records. JSON returns one newline-terminated `bot.run.events` schema-version-1 document with `data: { run, child, events }`. `run` holds the selected root run identity. `child` is null for the root or the authorized child reference. `events` holds the complete parsed semantic event sequence. Keep `run record --raw` as the only exact-byte record command. Do not add `--follow` or JSON Lines; no current caller requires live following. Do not change record parsing, child confinement, or runtime behavior.

The held semantic record source remains at most 1,048,576 bytes and 10,000 segments. Human and JSON results must each remain below 2,097,152 UTF-8 bytes. A valid near-limit record can fail with integrity exit 5 when its rendered result exceeds that bound. Human errors remain within 2,048 bytes. The capability descriptor publishes operation `run.events`, command `run events`, output `bot.run.events` schema version 1, modes `markdown` and `json`, home `reads`, mutates `false`, network `never`, options `--child`, `--home`, and `--json` with alias `-j`, plus all four limits.

Migrate maintained full-record and child-record examples to `run events`. Keep the legacy route until 0217. Shared readers and renderers may serve both routes during the bridge.

## Acceptance

Focused tests start red on the missing descriptor and dispatch. Root and child human readings match the retained behavior. `--json` and `-j` emit the bounded version-1 document. Parsing completes before home access. Missing values, unknown or repeated options, duplicate home selection, duplicate JSON mode, and unsafe child syntax exit 2. Missing or ambiguous runs and absent or unrecorded children exit 1. Invalid, corrupt, unsupported, oversized, linked-component, or over-result-limit records exit 5 without partial output. Unexpected filesystem failures exit 4. A synchronous output failure returns exit 4 with a bounded diagnostic and never reports success. JSON errors use the common structured document. Human errors remain bounded. Child authorization retains the parent and child agreement checks. The command never contacts a provider. Capabilities list the exact descriptor and limits. README, guides, help, and active specification use the current command only where they teach complete root or child reading. Compatibility sections remain until 0217. The legacy command remains available until 0217.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: The command publishes a new name and reuses mature static reading behavior. Child confinement and failure compatibility need broad proof.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted 2026-09-11 at `976735da8bf31ca7bc94c632778a5818d1973e8c`. The first draft assigned JSON Lines to a finite command and left limits, failures, parser order, output failure, and child authorization implicit. The accepted revision uses one bounded versioned JSON document and defines those boundaries. Review raised state and timing from 0 to 1 because held-file replacement and child agreement need explicit proof. Routing remains level 3.
- Code review: accepted 2026-09-11 at `1b1bac79514fa5da838ecbec89fe98075cf88a34`. Independent review drove repairs for filesystem error classification, command-level boundary coverage, valid-path provider isolation, child human-rendering parity, one remaining published example, and isolated size accounting. The final review observed 62 relevant passing tests and no blocking finding.

## Size decision

- Starting production size: 19660 nonblank lines
- Ending production size: 19829 nonblank lines
- Simpler approach tried: Route the new name directly to the legacy command dispatcher and let the shared run-name reader treat every unusable `runs` path as an empty run set.
- Why insufficient alternatives were rejected: The legacy dispatcher cannot return the current command's versioned JSON document or typed exit 2, 4, and 5 failures. Treating unusable storage as empty reports a missing run when the Bot home or its `runs` entry is a file or cannot be inspected.
- Production code deleted: 0 nonblank lines. Ticket 0217 retains the legacy route until both replacement readers land.
- Accepted cost: 169 production lines add the parser, typed adapter, bounded finite renderings, child selection, output-failure handling, and storage classification. The combined branch currently holds 19,991 lines because ticket 0262 added 162 production lines between this ticket's initial implementation and remediation.
