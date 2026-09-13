---
flow: quickfix
priority: 4
---
# An interrupted install's staging is named and reclaimable

`bot install` stages into a temporary directory beside the target,
`mkdtemp(join(dirname(target), ".bot-install-"))`
(`bot/src/management.ts:146`), and renames it into place when the
copy is whole. A SIGKILL between those two moments leaves the
staged tree behind forever. Nothing names it and nothing reclaims
it: `bot status` walks for stranded copies with
`STRANDED = /^\.bot-(?:old|update)-(?<of>.+)$/u`
(`bot/src/inspection.ts:263`), which does not match
`.bot-install-`, and the visible-entry listing hides it. The bytes
sit in the home, invisible, until someone reads the directory by
hand.

The asymmetry is the defect: an interrupted *update* is a
first-class thing the home can tell you about, and an interrupted
*install* is not, though both are the same accident.

Done, observably: after an install is killed mid-copy, `bot status`
names the staged tree, its bytes, and the assembly name it was
being installed under, the same way it names an update's leftovers
today — including for a nested name, and including when nothing
else in that home is stranded.

Settled choices:

- Naming is the whole of this ticket. Reporting the tree is what
  makes it recoverable by hand; automatic deletion is not in scope,
  because a `.bot-install-` directory may belong to an install that
  is still running, and proving otherwise is prune's problem, not
  status's. Draft ticket 0053 owns prune's side and already carries
  "the stray-scratch sweep deletes a live install's staging" — do
  not repair that here.
- An install's staging has no assembly standing beside it yet, so
  the `installed` fact a stranded update reports is false for one
  of these by definition. Report it honestly rather than omitting
  the row.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/stranded-update-tree.test.ts`. Its four assertions pin
the current stranded vocabulary and the shape of a status line;
restatement is authorized in that file, bounded to widening what
counts as stranded. The assertions on bytes, on whole-path naming
inside a nested assembly, and on a hidden name inside an assembly's
own tree staying the assembly's business keep full strength. If a
refusal names another file, add it in an addendum.
