---
flow: build
priority: 3
completed: 2026-09-09
---
# Fold small helpers into their owners

## Result

`help.ts` now owns its private help-formatting functions. `run-files.ts` now owns the one-mebibyte inspection limit. `record-events.ts` now owns and directly exports the diagnostic event constructors. The three one-importer helper files are gone.

Generated help bytes remain identical across the overview and all 31 command screens. The diagnostic event results and constructor registry order also remain identical. The public inspection export and the retained multi-owner modules did not change.

Seven comments still described a deleted per-file cap. Each now keeps only its useful ownership, reuse, harness, or behavior explanation. The draft claimed that two comments remained. Sol's design review checked current source and corrected the count to seven before implementation.

## Complexity and review

This was level 2 because three mechanical folds crossed help generation, run-file reading, and the event registry. Luna High implemented it. Sol Medium designed and reviewed it.

The first Luna turn stopped after the intentional helper deletions and did not answer two status requests. The primary agent interrupted that turn and resumed the same agent from the visible worktree state. Luna then completed the folds and verification. No code was lost or duplicated.

Sol found no code defect. Its cross-commit comparisons proved identical help bytes and event results. It also confirmed the public exports, retained modules, comment corrections, dead-code check, and cycle check.

## Checks

Deleting the helpers produced four expected TypeScript missing-module errors before the contents moved. The focused implementation suite passed 51 tests. Sol's wider focused review passed 102 tests across 12 files.

The primary agent temporarily reduced the inspection limit from one mebibyte to one byte. Four of six output-reader tests failed. Restoring the limit made all six pass.

The complete offline check passed 42 project tests, 211 runtime test files with 1,450 tests, all 143 conformance cases, and the coverage gate. The exact production-source total and ratchet are 16,051.

## Source

This manual ticket consumes draft 0215. Draft 0219 is next under Sol Medium.
