---
base: 1b680452a1744d5621e75a2af7adf77aac795661
head: f6ab7d3e6885e3b1d002f98eee1fee0fce809bbd
---

# Run summaries report verified consumption

Bot's shared run summary now totals valid token consumption across the selected root and its recursively authorized descendants. `tokensStatus` distinguishes a complete total from a verified partial prefix. Readable incomplete runs retain numeric prefixes, including zero. Unavailable or invalid roots retain null. Malformed turns make a total partial, and unsafe addition makes the total null.

The reader follows only unique `subflow_call` authorizations whose child path exactly matches the recorded stage, defaulted repeat, retry, and call. Duplicate, conflicting, malformed, false-start, hostile, missing, unreadable, invalid, unsupported, or disagreeing child evidence contributes nothing and makes the ancestor partial. Child agreement checks identity, flow, request descriptors and bytes, and the recorded ending. It opens request bytes only after the basename matches `request.<extension>` with one through 247 ASCII letters or digits. It never scans directories for children. Count mode reads no descendant fact.

Provider starts reconcile only with a later turn carrying the exact stage identity, provider, and model. An omitted repeat differs from an explicit repeat of `1`. Historical turns remain countable. Unmatched starts and `unreconciled` events make the result partial. Public usage detail and selected-record readers remain scoped to the selected record even though the shared summary total covers the authorized tree.

Human and JSON run lists now preserve exact retained start and end timestamp strings. Duration is the nonnegative safe-integer millisecond difference between their parsed instants. An unsafe difference produces null while preserving both strings. Shared semantic classification rejects an ending before its accepted start. Equal and later endings remain valid.

Independent design review rejected the first design until it defined known missing consumption, incomplete-child prefixes, writer-owned authorization, all five token counters, historical timestamp spellings, and the public usage boundary. Independent code review rejected the first implementation because child agreement could open non-request artifacts, provider reconciliation conflated omitted repeat with repeat 1, unsafe durations were published, and the proof omitted accepted cases. The repaired implementation restricted request opens before filesystem access, preserved exact stage identity, returned null for unsafe durations, and added recursive, authorization, integrity, confinement, overflow, projection, and public-reader evidence. Both reviews accepted the corrections.

The implementation commit is `f6ab7d3e6885e3b1d002f98eee1fee0fce809bbd`. The complete local gate passed 143 repository and documentation tests, 1,672 runtime tests across 209 files, all 143 conformance cases, static checks, isolated public examples, the repository scanner, and the 18,267-line production-size check under Node 22.22.3. Hosted runtime run `34787207414` passed on the implementation commit. Hosted documentation run `34787207509` built the site and passed its nested same-commit complete check.

Whole-run summaries now validate each authorized descendant record and retained request, so large trees cost more filesystem reads. Edited historical trees have no new arbitrary descendant cutoff. Partial totals remain verified lower bounds rather than billing guarantees because providers own the recorded token facts. Historical root-only totals can increase when valid descendants exist, and exact human timestamps occupy more space.
