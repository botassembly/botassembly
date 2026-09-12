---
flow: build
priority: 7
completed: 2026-09-10
---
# Model selection is proved on every invocation path

## Result

The checked-in coverage map now accounts for every production route that can construct or use a model. It separates direct gating routes from LOOP, PARALLEL, subflow, FANOUT, DESCEND, and resume routes that reach shared execution. It also maps normal and scripted construction, explicit and providerless selection, refusal timing, prompt continuations, and the record fields that preserve the selected bundle.

New real-runtime tests prove that separate starts reread current home configuration while an earlier record keeps its original choice. Resume rejects an intelligence override and uses the current selection only for fresh work. The assembly entry agent records its full selected bundle. A providerless unique model keeps the authored provider absent from the ladder while provider events identify the provider that Bot selected. Child tests prove that parent command and task choices do not cross the child boundary. Production code and public behavior did not change.

## Complexity and review

The accepted design scored 5 and level 2. Luna High implemented it with high reasoning. Separate Sol Medium agents reviewed the design and code. Design review added scripted construction, providerless selection, the complete prompt route map, and a negative resume-override witness. It also corrected record timing and lowered the initial assignment from Sol Medium to Luna High.

Code review required two remediations. The first replaced a child assertion that lacked a real task-level choice, added child provider-operation assertions, strengthened absent-model refusal evidence, and corrected several claims. The second corrected four remaining citation ranges. The final reviewer accepted with no findings.

## Checks

Focused runtime tests passed 18 cases across three files. All ten documentation script tests passed. The primary root `make check` under Node 22.22.3 passed 53 project tests, 213 runtime test files with 1,470 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.11%. The production source ratchet remains 15,995 of 15,995 nonblank lines.

One primary check overlapped the reviewer's full test run in the same worktree. ESLint observed a disposable test directory while the other run removed it. Focused tests had passed, no product assertion failed, the disposable directory cleared, and separate complete checks by the reviewer and primary agent then passed. Future verification in a shared worktree must not overlap.

Hosted runtime run `34463104620` passed on exact published implementation head `feadfdf02fec7d1f8b07384b81524e7b650c3683`.

## Source

This manual ticket started from published commit `8dd3258bf6ed5161b333c8b3ede1149ace1df39e`. Commits `ef5e0b09` through `ed83b93b` record the design, reviews, implementation, and first remediation. Commit `58f744bc` contains the accepted implementation. Commit `feadfdf0` records final review acceptance and is the exact hosted implementation head. This ticket completes source draft 0227. Draft 0228 is next.
