---
base: 886e047c21339713295e7ffd28de84d8f8774f7f
head: 2e7052572c0c5ebaa4cfc77cfbe0f392d3d9eae7
---

# Add a supported checklist-mark reader

`bot run checklist` now reads checklist marks from one bounded semantic root record. Human and version-1 JSON output preserve record order, exact attempt identity, item number, decision, historical evidence nullability, and optional reason. Independent exact selectors narrow stage, retry, or repeat. The reader accepts structurally valid incomplete records. It rejects malformed marks and damaged records without partial output.

Help, capabilities, the command matrix, the specification, conformance notes, the changelog, and the documentation reference publish the command. Legacy `bot explain` remains unchanged. The size-decision checker now recognizes current drafts and completion records while retaining the historical contraction roots.

Independent design review first rejected an underspecified public shape and string validation. Implementation then exposed the stale size-decision roots. A second design review accepted that workflow repair without changing the level-3 score. Sol Medium implemented the ticket. Independent Sol Medium code review accepted it with no findings.

The primary local `make check` passed with 81 repository tests, 1,552 runtime tests, 143 conformance cases, all static checks, and the exact source ratchet. GitHub Actions runtime run `34539293414` and documentation run `34539293456` passed on commit `2e70525`.

## Size decision

- Starting production size: 16350 nonblank lines
- Ending production size: 16549 nonblank lines
- Simpler approach tried: reuse the existing run-check command's record selection and rendering path.
- Why insufficient alternatives were rejected: run check requires a check name, joins attempt selectors, supports raw captures, and validates a different event shape. Sharing its private query and mode rules would couple two public contracts and make either command harder to change safely.
- Production code deleted: none. Ticket 0247 owns deletion of the legacy reader after retained callers move.
- Accepted cost: 199 nonblank production lines for one local parser and reader that owns exact independent selection, mark compatibility, inert Markdown, structured output, and command-specific errors.
