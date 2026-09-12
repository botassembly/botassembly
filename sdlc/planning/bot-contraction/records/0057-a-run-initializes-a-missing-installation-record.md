---
flow: build
priority: 10
completed: 2026-09-08
---
# A run initializes a missing installation record

## Result

A first start or resume now creates the home's private installation identity through the existing atomic initializer. Concurrent first runs use and record one published winner. Existing identities retain their exact bytes and metadata. Malformed and insecure records still refuse before provider contact, run-directory creation, `run_start`, or id-file publication.

`bot home init` is gone from routing, capabilities, help, production rendering, current specifications, and generated references. `bot home show` remains read-only and reports an absent record as uninitialized. The stored document and every recorded identity field keep their existing shapes.

The implementation preserves the existing ownership, mode, link, replacement, synchronization, interruption, finalization, and concurrency protections. Source draft 0213 combined this startup repair with an undefined storage contraction. Design review split that contraction out. A separate held draft will require exact specification guarantees before any protection can leave.

## Review

Independent design review rejected the source draft, then accepted ticket 0057 after the startup and storage outcomes were split and start, resume, malformed-state, command-removal, and retained-test requirements became exact.

Independent code review rejected the first implementation because a test-only `home.init` branch remained in production code and no run-level proof preserved an existing identity file. The implementer removed that branch, tested initialization directly, and added the missing byte-and-metadata proof. The same reviewer accepted the remediation. The primary gate then found one unused test import. The implementer removed it, and the same reviewer accepted the final diff.

## Checks

The focused red proof produced five expected failures. Missing start and resume returned exit 5, concurrent first use could not proceed, and `bot home init` still succeeded.

After remediation, 94 focused tests passed across seven files. Type checking, generated-specification checks, Bot lint, and `git diff --check` passed.

The first root `make check` attempt reached the complete runtime suite and failed only because this worktree checked out the five lifecycle scripts as mode `0700` under the machine's restrictive mask. Git records them as `0755`. The existing permission issue already describes this test assumption. The primary normalized those five worktree files to `0755` without changing Git content.

With Node 22.22.3, `umask 022`, and the five lifecycle scripts normalized to `0755`, root `make check` passed. It ran 19 project tests, 208 runtime test files with 1,408 tests, and 143 of 143 conformance cases. Coverage reported 96.39 percent of production lines. The source ratchet passed at 15,634 of 15,634 nonblank lines.

A later full run against the completed record hit two unrelated load-sensitive failures in `warning-rerun.test.ts` and `subflow-local-signal.test.ts`. Both files passed immediately together with seven of seven tests. The next complete run passed all 1,408 runtime tests. The warning rerun has prior evidence. The child-signal cleanup failure is one new sighting and remains a finding until it repeats or a cause is proved.

No live-provider test ran.

## Size decision

- Starting production size: 15,644 nonblank lines
- Ending production size: 15,634 nonblank lines
- Production code deleted: 10 net nonblank lines
- Reason: the public initialization command and its result path became unnecessary when every first run began using the existing initializer.
- Accepted cost: callers can no longer initialize an unused home explicitly. No observed caller used that command.

## Source

This manual ticket came from draft 0213. The final design intentionally excludes storage contraction.
