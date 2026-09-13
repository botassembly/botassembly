---
flow: quickfix
priority: 7
completed: 2026-09-06
---
# Every run id file contract names resume

## Result

Every maintained `--id-file` statement now names `bot run`, `bot run start`, `bot resume`, and `bot run resume`. The option's timing, path handling, failure behavior, and parsers did not change.

The canonical runtime and invocation chapters agree with the hand-authored implementation reference. The documentation generator copies the corrected canonical text into the site.

## Review and red-green evidence

The red publication proof failed because the runtime chapter omitted `bot run resume`. Design review then found that the first ticket draft omitted the hand-authored reference page. The amended ticket covered the two canonical sources, generated output, and independent reference.

Code review rejected a Bot test that depended on an ignored generated file and searched two copied sections together. The remediation kept tracked-source checks in the Bot suite and moved generated-page coverage to the generator test. That test creates the page, requires exactly two run-id sections, and checks each section independently. Final review accepted the result.

## Checks

Focused behavior and publication tests passed 55 tests across five files. Documentation generator tests passed three tests. Focused lint, syntax, specification, and diff checks passed. The complete root `make check` passed with 19 project tests, 204 Bot test files, 1,350 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the unchanged 15,104-line production ratchet.
