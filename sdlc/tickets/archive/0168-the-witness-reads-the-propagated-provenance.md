---
flow: build
priority: 5
waits-on: ["botassembly/sdlc/0207"]
---
# The witness reads the propagated provenance

The adoption witness pins the five project scripts' digests
inside bot/tests/project-script-adoption.test.ts, so every
automatic propagation of canonical bytes reddens this repository
until a quickfix repoints the table (0167 was that quickfix on
2026-08-27). Once the sdlc propagation hook ships a provenance
manifest beside the scripts, the witness should read it.

Done, observably:

- The adoption test compares each script under `sdlc/project/`
  against the propagated provenance manifest: sha256 and
  executable bit per script, all five present, nothing extra.
- Fork detection survives: a local script edit without a matching
  manifest change fails the test, exactly as the inline table
  failed it.
- An automatic propagation that updates scripts and manifest
  together leaves the suite green with no local commit.
- The inline CANONICAL_DIGEST table is gone.

Boundary: that one test file. No script byte changes. The waits-on
names the sdlc ticket that ships the manifest; this ticket cannot
go green before it lands and propagates.
