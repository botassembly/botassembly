---
flow: build
priority: 2
deps: []
---
# Reject unavailable subflows before input

## Outcome

Bot rejects a requested subflow that is not in the caller's resolved scope before it expands, reads, hashes, or retains that request's `input-file`. The refusal remains one ordinary `subflow_call` result. Valid subflows keep accepting ordinary absolute and slot-expanded file paths under the operator's authority.

## Current facts

- `runSubflowChild` resolves the requested flow first, but currently normalizes and retains the request before checking whether the lookup succeeded.
- A model-selected unavailable flow can therefore make Bot read and copy a readable file into `$SUBFLOWS/<call>/input.<extension>` even though no child starts. A missing path returns its filesystem error instead of the more fundamental scope refusal.
- Ian selected trusted execution and external containment. This defect concerns operation ordering and unnecessary data retention. It does not justify path confinement or a file allowlist.
- Each batch call already has a stable number, and sibling calls settle independently.

## Scope

- In `runSubflowChild`, branch on an unavailable flow immediately after lookup and depth calculation. An unavailable file request returns before path expansion or input normalization. An unavailable inline request may normalize its already-present text only to preserve its existing parent-event evidence. Neither path creates retained files or invokes a child.
- Preserve `call`, requested `flow`, calculated `depth`, `started: false`, and the existing `Subflow <name> is not in scope.` reason.
- An unavailable file disposition carries no `input`, `child`, `exit`, `cause`, or output facts. An unavailable inline disposition preserves its existing text, size, and hash descriptor in the parent event. Neither creates the per-call answer path `$SUBFLOWS/<call>` nor the retained child path `stages/<stage>/<repeat>/<retry>/subflows/<call>`.
- Preserve call numbering and independent settlement for valid siblings in the same batch.
- Preserve the current input behavior for a valid in-scope subflow, including inline input, slot expansion, and readable absolute paths outside `$PWD`.
- Update the subflow and record chapters so “every call lands” describes calls whose input crossed the boundary. An unavailable file request is recorded before input admission and therefore has no invented input or retained files. An unavailable inline request keeps its recorded descriptor without creating child files. Preserve tolerant reading of older `started: false` file events that carry an input descriptor.
- Update generated specification pages, witnesses, and the specification changelog where required.
- Do not add path confinement, authored access, command filtering, new record fields, Pi changes, or a new containment claim.

## Acceptance

Start with failing focused tests. An unavailable subflow requested with a readable file uses a selected-path `readFile` tripwire that remains at zero, while a valid-flow positive control proves the tripwire fires. The refusal creates neither exact per-call path, does not invoke child execution, and records only the bounded not-in-scope disposition. An unavailable subflow requested with a nonexistent file reports the same not-in-scope reason rather than `ENOENT`. An unavailable inline request preserves its text, size, and hash in the parent event while creating neither child path.

A mixed batch proves an unavailable file request does not disturb valid siblings and preserves call numbers and event order. A valid in-scope subflow still reads an absolute input file outside `$PWD`, retains its input, starts its child, and returns normally. Existing inline-input, slot-expansion, unreadable-input, FANOUT, signal, and record-shape suites remain green.

A focused stopped valid-flow case preserves the separate existing ordering: with a nonexistent `input-file`, input admission fails before the stopped-run disposition can replace that filesystem error. This ticket does not hoist or otherwise alter `stopped(input)` handling.

Run focused suites continuously, then the complete local gate. Independent code review must inspect operation order and negative artifact assertions. The implementation and completion commits pass hosted checks.

## Dependencies

None. Ticket 0273 established the trusted-execution boundary and removed path admission policy.

## Risk facts

The code change is small, but a weak test could prove only the returned message while missing the unwanted read or retained copy. The regression proof must instrument the selected source read, include a valid-flow positive control, observe both exact absent per-call paths, and use readable and nonexistent source paths. Moving the stopped-run check is outside this ticket because its cleanup and reporting semantics differ from unavailable scope.

## Size decision

- Starting production size: 17962 nonblank lines
- Ending production size: 17962 nonblank lines
- Simpler approach tried: Change only the returned reason after input normalization.
- Why insufficient alternatives were rejected: The file would still be read and retained before refusal.
- Production code expected: Reorder the existing unavailable-flow branch. No new policy module or abstraction is warranted.
- Accepted cost: Focused regression tests and precise specification wording remain.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: None.
- Final level: 3
- Reasons: One local ordering change affects a stable record contract and needs filesystem-side negative proof.
- Selected model: `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: Repository-wide reassessment on 2026-09-13 confirmed that unavailable subflows touch model-selected file input before scope refusal.
- Design review: rejected once by the formal reviewer and once by supplemental extra-eyes review. The reviews required a deterministic no-read witness with a positive control, exact absent artifact paths, a stopped-valid-flow ordering guard, preservation of unavailable inline evidence, alignment of the record chapter's input claim, and corrected complexity scoring.
- Code review: accepted. The extra-high reviewer ran 86 tests across 14 focused files and found no blocking code or test defect. One stale specification paragraph still promised a retained request for every file call; the repair limited that promise to admitted inputs and started children.
- Completion: implementation commit `de44ebbf64ed6ce92fe0eb417b0df53c9a6c3699` passed the complete local gate and both hosted workflows before archival.
