---
flow: quickfix
priority: 2
---
# The pinned lockfile carries no known advisory

`npm audit --package-lock-only` in `bot/` reports GHSA-2v37-7h3g-55p8
(high) against `nanoid@3.3.16`, an indirect development dependency:
a custom generator asked for size zero can loop forever. Confirmed
still pinned at that version in `bot/package-lock.json` on
2026-08-20. Nothing in this repository calls nanoid with a custom
generator, so the practical exposure is nil; the reason to move is
that a standing advisory makes every future audit unreadable.

Done, observably: `npm audit --package-lock-only` in `bot/` reports
no advisory at any severity, and the suite is green on the updated
lockfile.

Settled: update the pinned graph only as far as clearing the
advisory requires. If clearing it needs a major bump of the direct
dependency that pulls nanoid in, stop and fault rather than taking
the bump — a dependency major is its own ticket, not a quickfix.

Named for restatement: none expected. No shipped assertion pins a
dependency version.
