---
flow: build
priority: 3
completed: 2026-09-09
---
# The source snapshot is a plain read

## Result

Bot now recursively lists its trusted `src` tree, includes regular `.ts` files plus `package.json`, sorts their relative path bytes, and reads each file whole. It keeps the existing `bot-runtime-tree-v1` prefix and 12-byte entry frame. Stable trees therefore keep the same digest meaning.

Bot no longer imposes its own file-count, total-byte, or path-length quota on its installed program. It no longer uses normalized-name rejection, link checks, no-follow or nonblocking opens, double stats, positional chunks, or short-read race detection for this trusted read. Hashing work now grows with the installed program. Concurrent mutation can produce a sequential mixture or an ordinary read failure. The accepted same-account trust boundary makes that cost appropriate.

Run records, child reuse, capabilities, checkout identity, lockfile identity, Node identity, provider-adapter identity, historical record reading, and public exports remain unchanged. Active specification and command documentation now describe the sequential observation and removed quotas.

## Complexity and review

This was level 3 because the change removed source-reading defenses while preserving an exact durable digest and its consumers. Sol Medium designed and implemented it. Luna High and a separate Sol Medium agent reviewed the same commit independently.

Both reviewers found the same low-severity error in the promoted ticket. It said the old module had 160 physical lines. Two direct measurements showed 161. Sol corrected only that number. The independent Sol reviewer accepted the remediation. Neither reviewer found a code or contract defect.

Luna's review encountered a Vitest coverage-directory race. The standalone coverage rerun passed. The new open issue records the exact missing path and the investigation lever. This infrastructure event does not change the ticket's acceptance.

## Checks

Three new tests failed against the old reader for the exact file, byte, and path quotas. The other 13 focused tests passed. After the change, 48 focused integration tests passed.

The primary agent changed the digest prefix from v1 to v2. Four of seven provenance tests failed against the independent expected frame. Restoring v1 made all seven pass.

The complete offline check passed 42 project tests, 211 runtime test files with 1,451 tests, all 143 conformance cases, and the coverage gate for 102 production modules. Static checks, exact pins, dead-code detection, and cycle detection passed. The module fell from 150 to 94 nonblank lines. The exact production-source total and ratchet fell from 16,051 to 15,995.

## Source

This manual ticket consumes draft 0219. The remaining drafts wait on their recorded release conditions.
