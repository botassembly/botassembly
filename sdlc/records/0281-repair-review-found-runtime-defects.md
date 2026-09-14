---
base: f1d4297de21c4e1e2e4e51dcb4259078350a4bf4
head: b4ad8f41b5ce8161a87731208a165519ee711e2d
---

# Assembly checking states arriving input honestly and the child reader reads what the writer wrote

The child-agreement reader now reads a retained child request through `boundedHeldRunFile(…, REQUEST_MAX_BYTES)`, the same 4 MiB ceiling the writer already admits. A child born with a legal request between 1 MiB and 4 MiB now verifies, and its ancestor reports complete tokens instead of `partial` forever. A request above 4 MiB still refuses.

`bot assembly check` now states arriving input honestly. A check row's `input` field holds the files that arrive together, and a new `possible_inputs` field holds the union when a depth variant or a choice changes what could arrive. The root-child merge keeps the same distinction as `child_possible_inputs`, alongside the existing `child_outputs`. No emitted `input` array is a shape the check itself would refuse as a collision. `CHOOSE` now renders as an alternative: the stage after a choice reports the bytewise-first branch in `input` with every branch in `possible_inputs`, where it previously reported all branches as if they arrived together. A `PARALLEL` still keeps every branch file in `input`, because they do arrive together.

The raw output latch now clears in `ordinaryProcessOutput`, on every ordinary call, not only once per process. An ordinary command that follows a raw command in the same process drains its queue instead of inheriting the raw latch. The raw command's own exit path, exit code, and diagnostic are unchanged.

The two eslint complexity overrides left over from ticket 0272's deleted files are gone, and `check-lint-rules.mjs` now fails if any `files:` pattern resolves to no real path, with the virtual probe targets declared as the one exception. The unused clock parameters threaded through `inspectRunList` and `inspectRuns`, the unreferenced `inspectRequest` reader, and the two valueless `--intelligence` guards in `check.ts` are deleted; a valueless `--intelligence` with no resolvable row now refuses with `intelligence-unresolved`, matching `specification/elements/invocation.md`. `child_options` is now gated on difference like its siblings, and `childDepth` in `subflow-runtime.ts` moved below the early return that could not use it.

Independent design review accepted the contract after one rejection. The rejected design overstated the `--raw` behavior, proposed clearing the latch in a place that would move raw commands onto the ordinary exit branch, left the `possible_inputs` rule unstated, gave a scope bullet no acceptance test, left the overlap with ticket 0282 unstated, and kept the dead `inspectRequest`. Independent code review accepted the implementation after one rejection. The rejected implementation was missing a `possible_inputs` fold at the child merge, left the bytewise-first rule for the post-choice stage unstated, built stdout lazily where the ordinary path needed it built eagerly, and had no test proving the human-rendered output changed the same way the JSON row did.

The complete local gate passed: `make check` exited 0 with 210 test files and 1,707 tests, all 143 conformance cases, and static checks. The ratchet moved from 18,483 to 18,524 nonblank lines.

Hosted runtime run `34841312929` passed on commit `b4ad8f4`.

Three findings from the review stay open. The check and descendant-walk performance findings, M7 and L11 in `sdlc/planning/notes/2026-09-14-review-recent-work.md`, are unchanged: `bot assembly check` is still superlinear on recursive assemblies and `bot run list` still walks descendants quadratically. Neither was in this ticket's scope. The private-file boundary findings, M3 and M4 in the same note, are also unchanged; they become a specification honesty paragraph in ticket 0282 rather than a code change here.
