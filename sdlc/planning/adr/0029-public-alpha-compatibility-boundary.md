# ADR 0029 — The first public alpha sets the compatibility boundary

**Status:** accepted · **Date:** 2026-09-10 · **Ruled by:** Ian · **Supersedes:** ADR 0024's unexercised first-public-release boundary

## Decision

Version `0.0.1` is Bot Assembly's first public alpha. The runtime, specification, and examples match within that release. A later pre-1.0 release may change assembly and record contracts without migration. Version 1.0 is the first promised cross-version compatibility boundary.

Linux with Node 22.22 is the supported `0.0.1` platform because hosted and local checks prove it. macOS may work but is not verified. Windows is not supported.

## Consequences

Early alpha users may need to update assemblies and may need the matching older runtime to read an older record. The source release keeps the existing MIT license and Ian Maurer's copyright. The Bot package remains private because installation uses a clone and launcher rather than npm publication.
