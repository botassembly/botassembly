---
flow: build
priority: 8
completed: 2026-09-10
---
# `bot run show` is a supported one-run reading

## Result

Bot now provides `bot run show RUN [--json|-j] [--home DIR]` as a read-only and network-free one-run summary. One held root-record snapshot supplies the run, stage, and subflow model. A later lock observation distinguishes running and crashed work. Ordered stage-repeat scratch observations report current paths without opening child records or trusting child-controlled paths.

JSON and human output use the same ordered prefix of at most 1,000 combined rows. Each complete result remains below 1 MiB. Retained source text, human cells, physical rows, warning count, and warning subjects have explicit byte limits. Typed failures distinguish bad requests, missing selections, record-integrity faults, and outside access failures. Legacy `bot show` and all smoke callers remain unchanged for draft 0230.

## Complexity and review

The accepted design scored 8 and level 3. Sol Medium implemented it after an independent Sol Medium design review. The design needed two remediations. They made subflow attempt identity, consumed-field validation, record-fault classification, observation order, warning accounting, stage outcomes, exact child paths, and warning order explicit.

Code review needed two remediation rounds. The first found unbounded root timestamps and derived child paths, wrong warning order, repeated scratch observations, collapsed runs-directory failures, and missing hostile proof. The second found oversized constructed warning subjects, record-race tests that changed the file after the read, and partial output-shape assertions. Red-green fixes closed every finding. The final independent reviewer accepted exact implementation commit `028dfc815647ded616840a7fc0de1184184a1576` and found no new issue.

## Checks

The final focused review passed 64 tests. The primary implementation check under Node 22.22.3 passed 53 project tests, 215 runtime test files with 1,523 tests, all 143 conformance cases, and the coverage gate. Line coverage was 97.15%. Ten documentation script tests passed, and the documentation build produced 24 pages.

The closure check exposed two unrelated existing test races. One documentation worker removed a temporary source fixture after another worker listed it. A clean rerun passed all 53 project tests. That rerun then missed an escaped descendant's process-id file under full-suite load. The exact process test passed all 11 cases immediately in isolation. Both findings have open issue records and one current-plan gap. The next closure `make check` passed all 53 project tests, 215 runtime files with 1,523 tests, and 143 conformance cases without interruption.

Hosted runtime run `34478841571` passed in 7 minutes 46 seconds on exact published head `7176c6f7b7472b93589750e4ce225985212ea0fc`. Hosted documentation run `34478841395` built the site and uploaded its artifact. Its deploy job reached the known GitHub Pages 404 because Pages remains disabled. This external setting did not invalidate the build.

## Source

This manual ticket started from published commit `e12b922c7c45d48a13da8196ad024308d2695958`. Commits `6607791d` through `277e48a9` record the design and its acceptance. Commits `c8a3d379` and `62e726c4` contain the first implementation. Commits `88b0a9ca` and `028dfc81` contain the two code-review remediations. Commit `7176c6f7` records final review acceptance and is the exact hosted implementation head. Production source rose from 15,995 to 16,350 nonblank lines. This ticket completes source draft 0228. Draft 0230 is next.
