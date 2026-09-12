---
flow: build
priority: 9
completed: 2026-09-05
---
# Run output retrieves every accepted output

## Result

`bot run output RUN [STAGE] --raw` now retrieves accepted outputs of any size with bounded memory. The legacy `bot output` reader keeps its 1 MiB limit.

The command selects the accepted output through the existing record reader. It copies one fixed source snapshot into a private file, hashes every byte, and writes nothing to standard output until the snapshot matches the recorded SHA-256. Bot unlinks the private filename immediately after opening it. One held file descriptor owns acquisition, final verification, and delivery. Source changes, held-snapshot changes, and later pathname replacement cannot redirect unverified bytes into the output stream.

The command attempts descriptor closure and temporary-directory removal on every post-creation result. Cleanup failure overrides success and produces a bounded diagnostic. A standard-output failure may leave only a verified prefix. A closed downstream pipe remains a successful early stop after cleanup succeeds.

## Review and red-green evidence

The initial black-box test reproduced the gap. A 1,048,577-byte accepted output exited 1 with empty output. The implementation made root and named-stage large outputs return byte-for-byte while the legacy command continued to refuse them.

Independent design review required explicit mutation, storage, memory, output, and cleanup semantics before accepting the ticket.

Independent code review reproduced a critical flaw in the first implementation. That version closed the verified temporary descriptor and reopened its pathname. Replacing the file in that gap returned success with unverified replacement bytes. The corrected implementation keeps one unlinked descriptor through delivery. Deterministic tests prove that held-descriptor mutation fails before output and pathname replacement cannot change delivery. The reviewer accepted the remediation and the final documentation corrections.

## Cost and remaining work

Production TypeScript grew from 14,971 to 15,174 nonblank lines. The 203-line increase provides bounded acquisition, private verified storage, race tests, command integration, help, and specification coverage. Retrieval temporarily requires disk equal to the selected output. A cleanup failure can retain anonymous storage until process exit. Bot reports that failure and exits nonzero.

The runtime check is green. The repository documentation generator remains red on an unrelated pre-existing gap from ticket 0019 because `specification/elements/fanout.md` has no generated-documentation route. Ticket 0028 will restore that gate before more CLI work.

## Checks

The complete runtime suite passed all 201 test files and 1,331 tests with two workers, including 143 of 143 conformance cases. ESLint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, the 15,174-line source ratchet, exact dependency pins, and `git diff --check` passed.
