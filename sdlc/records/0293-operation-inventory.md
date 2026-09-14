---
base: 65c14b90514fb951ab4487140ef6a0956ae483b9
head: f9b6e57a01c7403a2fd649af665b855d7fbf6239
---

# Operation inventory

`specification/elements/inspection.md`'s capabilities inventory sentence now names `auth.import`. The operation had joined `CLI_CONTRACTS` and the chapter sentence stayed at 24 names. A new test, `bot/tests/spec-operation-inventory.test.ts`, extracts the sentence's backticked names, the span from "The inventory contains" to the first backtick followed by a period, and compares the result with `CLI_CONTRACTS` in both directions. It also asserts the extraction is non-empty before either comparison, asserts the list holds 25 names with no duplicate, and asserts the list is sorted with `bytewise`.

Before the chapter edit, the two-direction test failed with `expected [ 'auth.import' ] to deeply equal []` and `expected 24 to be 25`. Deleting a name from the sentence during red-green work failed the same way in the other direction; adding an invented name, `auth.invent`, failed with `expected [ 'auth.invent' ] to deeply equal []`. The chapter edit adds `` `auth.import`, `` between `assembly.update` and `auth.list`, keeping the sentence's stated sort order. A `specification/CHANGELOG.md` paragraph beginning "Ticket 0293" records the omission and the new test. Production is unchanged at 18882 nonblank lines.

Design review accepted the draft with three text fixes: the extraction span's terminator, one line number, and the changelog opener. Independent code review accepted the revised draft with two further fixes: a trailing clause split out of the changelog sentence, and the non-empty guard moved ahead of both comparisons rather than one.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch, before the final rebase onto the 0291 record commit (which touched only `sdlc/` files): all three exited 0, all 143 conformance cases passed, vitest ran 1762 tests passed, and `node --test` ran 160 tests passed. Hosted runtime run `34883184228` and hosted docs run `34883184507`, both on commit `f9b6e57`, completed with conclusion success; the runtime run's `wsl` job shows skipped, the expected state for a push run.

coverage: not rerun for this test-only ticket; the 0291 record's run covers the same production tree.

**Decision Ian can overturn:** none.

- Origin: requirement A3 and proposed ticket 5 of `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`.
