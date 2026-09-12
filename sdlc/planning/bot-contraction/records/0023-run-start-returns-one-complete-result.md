---
flow: build
priority: 8
completed: 2026-09-05
---
# Run start returns one complete result

## Result

`bot run start TARGET [REQUEST]` now starts one run through the existing runtime path. Human mode preserves the legacy accepted-output and diagnostic behavior. `--json` or `-j` returns one bounded `bot.run.result` document for every run that reached `run_start`.

A started result names the run, starting timestamp, completion, exit, and cause. It includes the exact durable ending timestamp, terminal stage, bounded reason, opaque correlation, and accepted output when those facts exist. A nonzero started run remains a run result on stdout and preserves the run's exit. A malformed request or failure before `run_start` uses the common error document on stderr.

The runtime now carries facts it already creates through its return boundary. It returns the exact `run_end` object only after the writer durably appends it. A writer failure returns an honest incomplete result without an invented ending. The CLI does not reread or parse the record.

Accepted output always carries path, extension, byte count, and SHA-256. Complete UTF-8 or base64 content appears only when the complete newline-terminated result remains at or below 65,536 bytes. Larger or heavily escaped content keeps the descriptor and reports that content was not included. No truncated content looks complete.

`--correlation` accepts one nonempty opaque value through 256 UTF-8 bytes. Bot records it additively in shape-1 `run_start` and returns it. Reusing a value starts an independent run. It provides no uniqueness, replay, or receipt behavior.

## Review and red-green evidence

All initial route tests failed before implementation. The first green implementation shared request selection, invocation parsing, dependencies, and one `runCommand` call between the new and legacy spellings.

Independent design review removed usage from the result. Usage remains a reading of retained turn events. The design also required exact durable-ending agreement and a lossless bounded output rule.

Independent code review found three material defects. Unexpected failures after `run_start` were labeled as pre-start errors. Repeated fixed options silently selected a later value. Unexpected pre-start filesystem failures lost immediate causes such as `ENOENT`. Red tests now cover each boundary, and the implementation records an exact fault ending or an honest incomplete started result.

The complete suite then found accretive assertions in older capability tests. Those tests now validate their own command descriptors and compare the full answer with the compiled inventory. They no longer freeze unrelated future commands.

## Cost and deferred work

Production source grew from 14,541 to 14,771 nonblank lines. The 230-line increase provides the shared run operation, enriched runtime result, bounded structured renderer, correlation field, descriptor, dispatch, and help. Legacy run behavior remains separate only at rendering.

Usage, resume, wait, correlation filtering, output retrieval, caller migration, and legacy deletion remain separate work.

## Checks

The final complete gate passed all 198 test files and 1,301 tests, including 143 of 143 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 14,771-line source ratchet, specification checks, and `git diff --check` passed.
