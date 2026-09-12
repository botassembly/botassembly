---
flow: build
priority: 4
---
# Delete bot find's per-query recount

`recount` (`bot/src/find-index.ts:255-265`) audits the index on every query. It picks one sampled run, re-extracts its sources, and compares the raw entry count against the rows the same call's `refresh` just wrote. On mismatch it re-replaces the sources and reports a drift flag, plumbed through `indexReading` (`find-index.ts:267-276`) into the query output. Roughly 30 lines plus the flag's plumbing.

The refresh already rebuilds any changed source, and the schema-version drop already covers a format change. The self-audit re-does per query the work the same call just did.

## Done when

- `recount` is gone and no query re-extracts sources after `refresh`.
- The drift flag is gone from `indexReading` and from the JSON index reading. Tests over the reading are updated.
- Query results are unchanged. The existing suite stays green.

## Boundary

The schema-version drop in `initialize` stays. `refresh` and its change detection stay. `hits` and the output shapes stay, apart from the removed drift field.
