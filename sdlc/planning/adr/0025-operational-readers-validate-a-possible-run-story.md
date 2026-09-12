# ADR 0025 — Operational readers validate a possible run story

**Status:** accepted · **Date:** 2026-09-04 · **Ruled by:** Ian

## Context

The record writer appends facts in a controlled order. Several readers currently validate JSON shape but do not prove that the complete sequence could have been written by Bot. External modification can therefore append facts after `run_end`, duplicate terminal facts, or create endings without their required starts. Operational commands can then infer state from an impossible story.

Raw bytes still matter when a record is damaged. A diagnostic command must not hide the evidence that explains why validation failed.

## Decision

One structural validator classifies a bounded record as valid, incomplete, or invalid before operational commands use it. It enforces record framing, one matching `run_start`, known timestamped events, usable stage identities, starts before attempt work and endings, unique container and run endings, legal terminal cause and exit pairs, matching outside-signal facts, and no content after `run_end`. A possible prefix remains incomplete.

The structural validator does not repeat the writer's detailed rules for paths, check order, hooks, controls, container aggregation, workspace layout, or artifacts. Writer and conformance tests own those rules. Each operation validates the fields and retained artifacts it relies on. A missing or malformed action-authorizing fact makes that operation refuse safely.

A malformed interior line makes the record invalid. One partial final line before a terminal ending makes the record visibly incomplete. A partial line after a terminal ending makes the record invalid because content followed `run_end`.

Raw record access streams readable file bytes without semantic endorsement through `bot show RUN --raw`. It opens one regular file through the held-file boundary, fixes the snapshot size from that descriptor, and does not chase later appends. A valid parent must carry one exact started child authorization before raw child access bypasses child validation. Structured and human summaries refuse to infer an outcome from invalid bytes.

Live assembly management remains fail-closed when a live record is unreadable, structurally invalid, or missing a usable assembly identity. The operation cannot prove that its target is idle.

## Consequences

Bot keeps two intentional read paths. The raw path preserves evidence. The validated path protects decisions. The validator adds no cryptographic seal and does not claim that an accepted record came from a trusted machine.

New event kinds extend the writer, specification, and writer conformance oracle. They extend the structural validator only when they change its small event vocabulary or structural rules.
