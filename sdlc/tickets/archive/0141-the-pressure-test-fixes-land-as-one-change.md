---
flow: build
priority: 4
---
# The pressure-test fixes land as one change

The 2026-08-25 pressure test produced 35 confirmed findings; the ruled fixes are already implemented and fully green on branch `pressure-test-fixes` at origin (5 commits on top of main, head `61bcdf7`: 928 tests across 143 files, conformance 140/140, ratchet 10146). This ticket lands that branch on main as one change. It subsumes the five draft tickets 0140–0144 that described the pieces individually; the branch is one coherent, already-verified change and splitting it buys nothing.

The five guarantees the branch delivers, each ruled by Ian on 2026-08-25:

1. **The tail rule says one thing everywhere.** The intelligence-named-container exemption was migration debris from 0123: an intelligence is configuration only and grants no grammar exceptions. graph.md's tail section and refusals.md's `tail-container` row are restored to the unconditional rule, the `validateTail` exemption is removed, the `intelligence-container-resolve` accept case is replaced by a `tail-container-intelligence` refuse case, and the CHANGELOG records the ruling in the same change.
2. **A task file's request keeps its extension.** The expression in bot/src/invocation.ts that flipped `request.md` to `request.txt` when the task named an `intelligence:` is removed; the `intelligence-task-resolve` corpus expectation is deliberately corrected to the task file's own extension, as invocation.md and slots.md state; a test pins the coupling.
3. **A nearer model flag is never discarded silently.** A command-line model flag against a farther intelligence refuses loudly (`intelligence-unresolved`) instead of being ignored. Full removal of the flag is 0128's contract step; this closes only the silent-discard window until then.
4. **A checklist heading is recognized at any level.** A heading at any level 1–6 whose trimmed text is exactly `Checklist` — case-sensitive, no extra words, no fuzzy matching — is a checklist. Tests pin `#` through `######` as recognized and lowercase/extra-word variants as not.
5. **The wind-down path cannot reorder, swallow, or displace.** Tap detach becomes a barrier that waits for in-flight appends before `stage_end`; the seal path re-reads the tmp-ceiling fault flag so an idle-harness breach still faults the run; a `$TMP` teardown failure is recorded as a new `tmp_teardown` diagnostic event and never displaces a settled result. Spec (record.md, runtime.md) and CHANGELOG updated in the same change.

## What done looks like

- Main contains the branch's changes (merge or clean replay — builder's choice), with every spec edit, corpus edit, and CHANGELOG entry riding in the same landing.
- The full gate ladder is green on the result: unit suite, conformance corpus, ratchet.
- The five behaviors above each hold observably: the tail rule stated identically in graph.md (both sections), refusals.md, example.md, and inspection.md; extension preserved; nearer flag refused; heading levels 1–6 recognized and near-misses not; the three wind-down tests present and passing.

## Boundary

- No new behavior beyond the branch. If the branch no longer applies cleanly to main, resolve conflicts in favor of the guarantees above — do not drop a piece to make the merge easy.
- Corpus edits stay exactly the branch's deliberate ones: one accept case removed, one refuse case added, one expectation corrected.
- 0128 (vocabulary contraction) is separate work and now waits on this ticket, since the branch was authored against pre-0128 main.
