---
flow: build
priority: 5
completed: 2026-09-09
---
# The conformance corpus has no case collision

## Result

The wrong-case sentinel fixture now tracks only `Stage.md`. It still refuses with `sentinel-unknown` at the same path on case-sensitive and case-insensitive filesystems. The runtime and expected conformance result did not change.

The project lint gate now reads Git's NUL-delimited tracked paths and rejects distinct paths whose Unicode lowercase forms match. Diagnostics preserve spaces and escape newlines. Invalid UTF-8 path bytes and Git failures stop the gate with a clear error. The check does not add Unicode normalization policy.

## Complexity and review

This was level 1 with score 2. Contract and state scored 0. Reach scored 1 because the corpus and project lint changed. Proof scored 1 because the change needs a synthetic filesystem-independent collision check plus conformance. Cost of error scored 0.

Luna High implemented the ticket. The initial red commit was `7bfd4489`. The first implementation was `da3dd4c4`. Sol Medium review rejected tests that created colliding paths through the working tree because those tests would collapse on the target filesystem. Review also reproduced a missed Unicode case pair and a false collision between distinct invalid UTF-8 paths. Luna changed collision fixtures to populate the Git index directly, used Unicode lowercase without normalization, and made invalid UTF-8 fail clearly in `139306c6`.

The first complete check then found that the lint-integration test inherited the project's recursion sentinel and refused its own nested fixture. Luna removed only that sentinel from the child test environment in `b0ac9b49`. The production recursion guard remained unchanged. Sol Medium accepted the final delta.

## Checks

The focused checker suite passed 11 tests. The complete offline check passed 30 project tests, 211 runtime test files with 1,454 tests, all 143 conformance cases, and 97.07 percent line coverage. Lint and all 29 lint probes, type checking, Knip, cycle checks, pinned dependencies, the exact source ratchet, and `git diff --check` passed. The source ratchet stayed at 16,056 because production source did not change.

No live-provider test ran. The hosted runtime check for the landing supplies the final publication proof.

## Source

This manual ticket consumes draft 0205. Draft 0206 is next under Luna High with Sol Medium design and code review.
