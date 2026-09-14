---
base: d24091118353b5fd129d1dc0bb3844ce5309af00
head: 4fc5585ee22cc83448bc14a297a40b7e63640253
---

# Assembly hash in readings

`bot assembly check --json` now reports `data.hash`, the same string `run_start` records as `assembly_hash` for the same target, computed by the one existing function `prehashAssembly` in `bot/src/record.ts`. Check Markdown output is byte-identical to before: the five pinned transcripts stand unchanged, and no README or documentation page was edited. `bot assembly list` gains `hash` as a selectable `--fields` value outside the default set, through a new `ASSEMBLY_LIST_SELECTABLE_FIELDS` constant; the hash is computed only for the selected page and only when requested. A refused resolve reports `hash: null` at exit 0, proven defensive by a unit assertion because no command-line input reaches that branch. `assembly.check` became asynchronous; the change is contained, and a Pi-free test still pins it.

`specification/elements/inspection.md` gained the field vocabulary for `bot assembly list` (six default fields plus `hash`) and the hash sentence for `bot assembly check`. A `specification/CHANGELOG.md` paragraph beginning "Ticket 0294" records the change. The issue file `sdlc/issues/2026-09-14-no-reading-reports-an-assembly-hash.md` is removed. The ratchet rose from 18882 to 18899: 17 production lines against an estimate of 18904.

Red messages before the fix: `expected undefined to be '<hash>'` on the `run-start` agreement test, and `field-unknown ... expected 2 to be +0` on the list field test.

Design review rejected the first draft for an unnamed byte-exact transcript surface, an unhandled refused resolve, and an invented hash spelling; it accepted the revision, with two implementer notes for the author. Code review accepted the result with three non-blocking notes: `run_start` is read without asserting its kind, matching existing precedent; the refused branch is proven unreachable rather than exercised; and an internal `at` field added to the list row type cannot reach output.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, all 143 conformance cases passed, vitest ran 1769 tests passed, and `node --test` ran 160 tests passed. The lint rung failed once first, on the ticket's size line wording ("Estimated ending production size"), fixed in the wording commit that landed as `4fc5585`. Hosted runtime run `34884365533` and hosted docs run `34884365755`, both on commit `4fc5585`, completed with conclusion success; the runtime run's `wsl` job shows skipped, the expected state for a push run.

coverage: `make -C bot coverage` ran once in the foreground on this branch: 217 test files passed, 1769 tests passed, 143/143 conformance, and the v8 summary reported Statements 87.89% (9762/11107), Branches 81.64% (7525/9217), Functions 90.76% (2634/2902), Lines 92.83% (7653/8244).

**Decision Ian can overturn:** none.

- Origin: the issue filed 2026-09-14 and proposed ticket 6 of `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`.
