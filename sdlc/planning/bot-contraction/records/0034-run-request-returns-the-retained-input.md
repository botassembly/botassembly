---
flow: build
priority: 10
completed: 2026-09-06
---
# Run request returns the retained input

## Result

`bot run request RUN --raw` now returns the exact retained root request, including requests larger than 1 MiB. The command validates the structurally accepted record, normalized run-owned path, recorded byte count, and first held-descriptor hash before stdout. It streams the same fixed extent in a second bounded-memory pass and requires the delivery hash for exit 0.

The command reuses request selection with the legacy reader and reuses the noun output command's parser and delivery shell. Legacy `bot request RUN` retains its bytes and 1 MiB ceiling. The implementation adds no temporary copy or generalized artifact subsystem.

Capabilities, generated help, the inspection specification, conformance, the CLI matrix, the retirement ledger, and the changelog now publish the implemented command.

## Review and red-green evidence

All six noun-command tests initially failed because `run.request` did not exist. Independent design review rejected the preserved experiment's private-copy subsystem and accepted reuse of the current held-descriptor path.

Independent code review found that shared delivery faults blamed `run output` and that code had been compressed to satisfy a file-line gate. Remediation added request-specific fault evidence, restored readable formatting, made legacy inspection use the shared selector, and added a real run with a 1,048,577-byte request. Re-review accepted the result.

## Size decision

- Starting production size: 15082 nonblank lines
- Ending production size: 15106 nonblank lines
- Simpler approach tried: reuse the existing output command parser, structural run selection, and held-descriptor delivery path
- Why insufficient alternatives were rejected: the legacy request reader holds the whole file under a 1 MiB limit; removing that limit would change the retained command, while a private copy or generalized artifact layer would duplicate the held descriptor
- Production code deleted: shared parsing and delivery replaced 21 physical lines while adding request selection and routing
- Accepted cost: the noun command adds 24 net nonblank production lines and one optional recorded-byte check to the shared delivery path

## Checks

Focused request and delivery tests passed. Type checking, lint, all 29 custom lint cases, documentation generation, the size-decision check, the 15,106-line ratchet, exact dependency pins, cycle detection, and `git diff --check` passed. The complete root `make check` passed with 202 test files, 1,341 tests, and 143 of 143 conformance cases.
