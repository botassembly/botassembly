---
flow: quickfix
priority: 3
---
# The changelog covers every day the specification changed

`specification/CHANGELOG.md` states its own rule in its opening: a
ticket that changes `specification/` writes its entry here, in the
same commit. Nothing enforced it until 2026-08-18, and the file
shows the hole — its dated headings run 2026-08-18, then 2026-08-10.
Ten commits changed the specification in between and none wrote an
entry, so the changelog currently claims the specification sat still
from the tenth to the eighteenth. That is false, and a reader has no
way to know it.

`sdlc/scripts/spec` gates this from 2026-08-18 forward: a branch
that changes `specification/` without touching the changelog is
refused. That stops the hole growing. It does not fill the one
already there. This ticket fills it.

The commits with no entry, newest first, with the specification
files each one changed:

| Commit    | Date       | Specification files |
| --------- | ---------- | ------------------- |
| `8214a72` | 2026-08-16 | `elements/inspection.md` (scratch-only prune) |
| `89a63ca` | 2026-08-14 | `elements/inspection.md` (retained request inspection) |
| `95153d6` | 2026-08-13 | `elements/gate.md` (neutral gate retry frame) |
| `d08d248` | 2026-08-13 | `elements/record.md` (resolved stage slots) |
| `9af6ca4` | 2026-08-12 | `elements/inspection.md`, `elements/record.md` (portable stage workdirs) |
| `08dfa0d` | 2026-08-12 | `conformance/accept/container-workdirs/workspace/*` |
| `537cfdd` | 2026-08-12 | `elements/stage.md` (container workdir rules) |
| `4097413` | 2026-08-12 | `conformance/accept/container-workdirs/assembly/*` |
| `038e427` | 2026-08-12 | `elements/record.md` (runtime provenance) |
| `9cef459` | 2026-08-12 | `elements/invariants.md`, `elements/invocation.md`, `elements/record.md`, `elements/runtime.md` (continued sealed runs) |

Done, observably: the changelog carries a dated heading for
2026-08-16, 2026-08-14, 2026-08-13, and 2026-08-12, each in the
file's existing newest-first order and voice, each paragraph naming
what changed and the ticket that ruled it, with the element files
linked as neighbouring entries link them. No heading claims a day on
which the specification did not change.

Settled choices:

- Write the entries from the records, not from the diffs.
  `sdlc/records/` for this window carries each ticket's `head` SHA,
  so every commit above can be attributed to the ticket that ruled
  it — which is what the file's convention asks for. The likely
  records are 0019 and 0027 (workdirs and slots in the record), 0037
  (the retry frame), 0040 and 0041 (the inspection verbs and the
  readable request), and 0042 through 0044 (sealing, scratch
  lifetime, and reclaiming scratch). Confirm each against its head
  SHA rather than taking that list as given.
- A commit whose record cannot be identified still gets its entry,
  written from the diff and saying plainly that the ruling ticket is
  unknown. A missing paragraph is worse than an unattributed one.
- Group by real date, newest first, one paragraph per ticket. This
  is the file's existing shape and the 2026-08-18 entry already
  demonstrates late recording ("Recorded here late: ticket 0142…").
- The specification itself does not change. This ticket writes
  history only, so `sdlc/scripts/spec` sees a changelog-only diff.

Named for restatement: none. No test asserts changelog content.
