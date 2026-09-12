---
flow: build
priority: 10
completed: 2026-09-04
---
# Operational readers require a possible run story

## Result

Bot now parses bounded JSONL and classifies the current shape-1 event sequence as valid, incomplete, or invalid before any operational reader trusts it. The event registry and exhaustive field validators share one typed vocabulary. The sequential state model enforces current writer order, attempt ownership, retries, checks, hooks, controls, containers, signals, terminal propagation, directory identity, and trusted artifact paths. The detailed contract lives in `record-state-and-bounds.md` and the record specification.

All operational consumers use the shared result. Valid records expose accepted facts and their terminal outcome. Incomplete records expose a possible prefix without an inferred outcome. Invalid records expose no event-derived facts to summaries, resume, search, management, or automatic cleanup. Search reads record and session content from stable held snapshots and removes stale sources after truncation or invalidation. Exact cleanup of a selected dead invalid run still requires its selected name, lock, process-group evidence, and ownership proof.

The current `show --json` command provides a narrow forensic path until the later CLI change. It returns every successfully parsed complete JSONL line, diagnoses the first rejected line and rule, exits `1`, and does not endorse an outcome. It omits malformed and unterminated bytes.

Child traversal now checks the child directory identity, `via: subflow`, flow, normalized request path, recomputed inline descriptor, retained request bytes, and final outcome. Missing, changed, unreadable, linked, or non-file requests fail traversal. The held-file boundary rejects links that it observes, replacement detected before or after open, and a changed held leaf. The local-account trust boundary excludes a same-account adversary that races replacement of an intermediate directory during the open. Artifact disagreement does not change the parent record's semantic classification.

The root run-lock compromise path now stores the machinery fault before it aborts active work. The active stage and run end as `fault/2`, retain the compromise reason, and emit no outside-signal fact. Real outside signals retain their conventional exits and sequential matching requirements.

The implementation also removed the unused in-memory migration graph. Record shape `1` remains the current pre-release shape. Numeric unsupported values receive `bad-version`. Missing, null, and string record fields are semantic invalidity with parsed forensic lines retained. The reader keeps the 1 MiB whole-file and 10,000-line caps.

## Evidence and review

Focused red tests reproduced the original post-`run_end` acceptance and root-cancellation mislabeling. Successive independent reviews supplied mutation matrices for event shapes, signal order, open-stage outcomes, check and hook dispositions, retry cycles, control calls, CHOOSE, LOOP, PARALLEL, terminal identity, stable reads, cleanup, child artifacts, writer-owned paths, request suffixes, workdir agreement, branch names, and hash-drift ownership. Each accepted writer sequence and rejected impossible sequence gained a focused regression. Final integration tests bind the writer's `assembly` identity to a run without `flow` and numbered identities to a named-flow run across starts, carried work, and terminal facts. The current-record fixture follows the same mode. The tests also corrected a stale expectation that exposed an expanded subflow source path instead of the normalized retained request. Other red tests caught `1-.md`, numbered branch values, sequential stages masquerading as PARALLEL siblings, repeated flow/stage executable paths, deeper invented drift paths, and equal drift hashes. A table pins entry-flow, top-level-subflow, flow-local, stage-local, recursively flow-local, and recursively stage-local executable paths beside unnumbered-owner, non-flow-prefix, and extra-component rejections. Graph parsing and record reading share the 1-through-9-digit sequence-name predicate. Drift identifies an exact active output or exact stage-owned executable layout across every supported flow scope.

The final read-only audit inspected 1,928 entries under `/home/ian/.local/share/bot/runs`. It classified 926 records as valid, 1 as incomplete, and 1,000 as historically invalid, and skipped 1 non-record entry. The invalid records retain three earlier writer shapes: 738 first fail because they predate `gate_start`, 200 first fail because they predate the recorded root workdir, and 62 first fail because they carry the older mark shape. The validator did not weaken the current contract to accept them.

## Cost and deferred work

Production source grew from 12,046 to 13,889 nonblank TypeScript lines. The 1,843-line increase buys one shared semantic boundary, stable operational reads, and focused writer-contract matrices. Separate small modules own event shapes, story state, attempt transitions, control semantics, container reconciliation, child artifacts, and root settlement.

This ticket does not add streaming, remove the whole-file caps, add evidence excerpts, paginate sessions, correct the separate LOOP cause design, implement FANOUT, add cryptography or migrations, redesign CLI nouns, replace the index, or redesign general cancellation and process supervision.

## Checks

The identity-mode group passed 87 tests across eight files. The complete changed reader, writer, operational, and conformance set passed 353 tests across 52 files. Two independent final reviews accepted the design, code, tests, and documented boundaries after adversarial counterexamples were added and repaired. The primary integration check then passed all 179 test files and 1,112 tests, including 142 of 142 conformance cases. Project lint and all 29 lint-rule probes passed. Type checking, unused-code inspection, cycle detection, exact dependency-pin checks, the exact 13,889-line source ratchet, the specification gate, and `git diff --check` passed.
