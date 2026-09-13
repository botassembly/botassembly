---
flow: build
priority: 8
completed: 2026-09-05
---
# Run output returns the verified bytes

## Result

`bot run output RUN [STAGE] --raw` now returns the bytes accepted by the existing output reader. The noun-based route delegates run selection, semantic record validation, seal selection, held-file authorization, and SHA-256 verification to the same implementation as `bot output`.

Without a stage, the run must have completed successfully. A stage selects its latest sealed output under the existing rules. Capability discovery and generated help report a raw-only, network-free, home-reading command with the existing 1 MiB output limit.

Malformed flags fail before home resolution. The new and legacy spellings share one inspection-result writer, so their accepted bytes, diagnostics, and exits agree.

## Review and red-green evidence

Independent design review found that the first ticket promised every output omitted from `bot.run.result`, while the retained output reader refuses files above 1 MiB. The ticket and CLI matrix now state that limit. Verified streaming remains separate work.

Initial parity tests failed because `run.output` did not exist and malformed requests fell through to the legacy run parser. The implementation added a compiled raw route and reused the existing reader. Focused tests passed root and named-stage output, binary bytes, missing and changed output, ambiguous selection, the exact size boundary, malformed options, capabilities, and help.

Independent code review rejected a fabricated cross-command test. Real `bot run start` and `bot run resume` executions now each produce a descriptor-only 70,000-byte result. `bot run output --raw` retrieves each retained output byte-for-byte using the returned run identity and agrees with its path and hash. The reviewer accepted the remediation.

## Cost and deferred work

Production source grew from 14,887 to 14,971 nonblank lines. The 84-line increase provides the route, parser, compiled capability, help, and shared inspection-result writer. A small limits module gives the reader and capability descriptor one owner for the 1 MiB boundary.

Accepted output above 1 MiB still requires verified streaming before the CLI can retrieve it. Other run artifacts, retained summaries, wait, caller migration, and legacy deletion remain separate work.

## Checks

The complete suite passed all 200 test files and 1,318 tests with two workers, including 143 of 143 conformance cases. Reduced concurrency avoided competing with other project work and changed no test coverage. ESLint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 14,971-line source ratchet, specification checks, and `git diff --check` passed.
