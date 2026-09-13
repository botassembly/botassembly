---
flow: build
priority: 10
completed: 2026-09-05
---
# Operational validation stays structural

## Result

Bot now rejects structurally impossible run stories without maintaining a second production copy of the writer's detailed state machine. Six production validator modules were deleted. The remaining validator enforces record framing, one matching run start, stage starts before work and endings, unique container and run endings, legal terminal cause and exit pairs, outside-signal agreement, and no content after the run ending.

Operational consumers now validate the fields and artifacts that authorize their own action. Resume retains verified request and carried-output bytes and never reopens the donor path. Search rejects malformed session paths and token totals. Artifact readers require their exact terminal disposition and never fall back from a malformed newest result. Busy detection accepts the run root and normalized contained work directories while rejecting traversal and malformed paths. Live assembly management remains fail-closed. Child agreement, held-file protection, exact-name cleanup, root-lock handling, and stable search snapshots remain intact.

## Evidence and review

The red phase ported twenty structural cases from the external spike. Seven acceptance cases failed against the ticket 0006 validator, including all three honest historical writer shapes. The green phase accepted those shapes and kept impossible stories rejected.

Independent design review rejected two incomplete designs. The corrections defined every operational consumer boundary and fixed an incorrect claim about check hashes. Independent code review rejected two implementations. The remediation closed symlink and replacement races, path traversal, malformed-artifact fallback, invalid token totals, and malformed summary identities. The final review accepted the implementation after 145 focused tests and direct probes.

The final read-only audit inspected 1,927 retained runs. The production reader classified 1,922 as valid, four as incomplete, and one as invalid. The prototype produced the same classification for every run. No record accepted before this ticket became invalid.

## Cost and deferred work

Production source fell by 1,615 physical lines. The nonblank TypeScript source ratchet fell from 13,889 to 12,449. Detailed writer rules remain in the test oracle and conformance corpus.

This ticket did not add raw record access, change pruning selectors, correct LOOP endings, add streaming, implement FANOUT, redesign the CLI, or implement replay receipts.

## Checks

The primary complete gate passed all 176 test files and 1,081 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,449-line source ratchet, and `git diff --check` passed.
