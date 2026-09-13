---
flow: quickfix
priority: 10
---
# The adoption witness matches the propagated scripts

SDLC's canonical landings propagated new lifecycle script bytes
into this repository (commits dfbde07 and 0441a88, 2026-08-27)
and left the digest witness behind: CANONICAL_DIGEST in
bot/tests/project-script-adoption.test.ts still pins the previous
canon. The suite is red at base, every before gate faults on it,
and the channel auto-paused after seven consecutive faults.

The red to reproduce: the adoption test expects `tasks` to hash
4a86a9b1… and the propagated script hashes 3d92800c…. All five
entries are stale the same way.

The fix: update the five CANONICAL_DIGEST entries to the sha256
of the scripts now committed under `sdlc/project/`. Nothing else
changes. The scripts themselves are byte-identical to the
canonical set — verified on 2026-08-27 by cmp against the
registered sdlc checkout — so adopt them as they stand.

Boundary: the digest table in that one test file only. No script
byte changes, no other test changes, no manifest redesign. The
witness design that survives automatic propagation is a separate
ticket.
