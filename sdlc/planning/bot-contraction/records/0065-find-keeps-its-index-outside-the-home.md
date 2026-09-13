---
flow: build
priority: 5
completed: 2026-09-08
---
# `bot find` keeps its index outside the home

## Result

`bot find` stores its disposable SQLite index under `${XDG_CACHE_HOME:-~/.cache}/bot/find`. A SHA-256 digest of the resolved lexical home path selects one cache file. Separate copied-home paths therefore use separate indexes. The cache directory is owner-only.

Each cache records the home directory's device and inode plus a digest of every already-held complete record or session source. A changed directory identity rebuilds the internal schema. A changed source digest refreshes its rows even when a replacement keeps the same path, size, modification time, device, and inode. The internal schema is version 2, so older external indexes rebuild.

One SQLite transaction serializes concurrent refresh. A search leaves the home byte-exact and works when its whole source tree is read-only. An old in-home `find.sqlite` remains byte-exact and supplies no results. Status still counts only home bytes. Prune remains unchanged. Orphaned external-cache cleanup remains a later gap.

## Review and checks

Commit `fca0bdc6` preserves the red proof. The focused suite reported 6 passing tests and 8 failures against the in-home implementation. The failures covered home mutation, XDG placement, copied paths, a read-only home, a legacy in-home index, and the existing index-path assertions.

Commit `da1d9005` supplied the original green implementation. The focused find suite passed all 14 tests. Independent Sol review rejected it because device and inode alone could accept stale rows after filesystem identity reuse. The reviewer reproduced the replacement failure four times.

Commit `0d512e5c` supplied the remediation. It hashes the source text already held for indexing and performs no additional source read. The replacement proof now forces the cached device and inode to match the new home while keeping source paths, sizes, and modification times unchanged. The fully read-only proof asserts mode `0555` on every fixture directory and `0444` on both files before search.

The remediated focused find suite passed 10 consecutive runs with 14 tests each. The combined find, specification-publication, and conformance run passed 30 tests and all 143 static conformance cases. Typecheck, full ESLint, all 29 custom lint-rule cases, the exact source ratchet, and `git diff --check` passed. Independent Sol re-review accepted the remediation without findings. The full root check passed 19 project tests, 210 test files with 1,451 tests, and all 143 conformance cases. Line coverage reached 97.07%.

No live-provider test ran.

## Size decision

- Starting commit: `035c83c2`, the current main baseline after manual ticket 0064
- Starting production size: 16022 nonblank lines
- Ending production size: 16056 nonblank lines
- Net increase: 34 nonblank lines
- Simpler approach tried: move the index and trust path, size, modification time, device, and inode.
- Why insufficient alternatives were rejected: keeping the index inside the home makes every search mutate the durable tree and prevents search on a read-only home. Trusting only filesystem facts lets inode reuse preserve stale rows. Independent review reproduced that failure.
- Production code deleted: none. The existing index still supplies the search behavior and moves to a different owned path.
- Accepted cost: 34 maintained production lines for shared XDG path derivation, path-keyed placement, cache identity, held-source digests, schema rebuilding, and serialized refresh. Search-cache cleanup stays outside status and prune.

## Source

This manual ticket consumes draft 0203. Draft 0204 is next under Sol Medium.
