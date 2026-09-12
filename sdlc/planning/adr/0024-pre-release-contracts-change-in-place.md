# ADR 0024 — Pre-release contracts change in place

**Status:** accepted · **Date:** 2026-09-04 · **Ruled by:** Ian · **Supersedes:** the pre-1.0 compatibility policy introduced by ticket 0158 and the record-generation migration policy recorded in the 2026-08-22 specification

## Context

The repository labels specification 0.1 as published and stable. Its record chapter already permits additive fields in one generation. The unfinished FANOUT attempt broke that rule by proposing generation 2 for additive events and fields. Ticket 0158 also promised pre-1.0 compatibility and migration support before Bot had any public release. Ian ruled on 2026-09-04 that Bot remains private development software and will become open source later. The premature compatibility promise increased the implementation and reader surface without protecting a user.

## Decision

Bot changes its code and specification together before the first public release. A change is complete only when the implementation, specification, conformance cases, help, and examples describe the same observable behavior.

The existing `record: 1` field identifies the current Bot record shape. It does not promise a family of supported generations. Additive event kinds and fields remain in record shape 1. Bot will not add pre-release migration code, frozen generation fixtures, or compatibility branches merely because the development contract changed. The specification's version, compatibility, conformance, and record-evolution sections will state this pre-release status in the same checkpoint that aligns their related implementation.

The first public release creates the first compatibility boundary. The release process will record that boundary and define the support policy before publishing.

## Consequences

An older local checkout may refuse a newer local record. Git retains the older implementation and specification. This cost is smaller than maintaining speculative compatibility code.

The `record: 1` marker remains useful because it lets a reader reject an unrelated file without guessing. Ian can remove the marker before release at the cost of losing that early shape check.
