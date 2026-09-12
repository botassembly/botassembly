---
flow: build
priority: 8
opens: sdlc/scripts/prepare sdlc/scripts/install sdlc/scripts/README.md
---
# prepare installs through the project's own script

`sdlc/scripts/prepare` is one long script that is byte-identical across
sdlc, queue, and botassembly except for a single section — `2b`, the
dependency install — which differs in all three. The script labels that
section itself: "The knob is the script (sdlc ADR 0008): these lines are
botassembly's own, not the template's."

This repository's block is the one that most obviously does not belong
in shared machinery: it installs into `$TREE/bot`, a subdirectory no
other project has.

Every other project-specific step already goes through an indirection
that `prepare` implements and uses. Its `gate()` resolves
`$REPO/sdlc/scripts/<name>`, runs it in the prepared tree, and refuses
cleanly when the file is missing or not executable. `lint` and `test` are
called that way. The install is the one step that bypassed it and inlined
the project's own command instead.

That bypass is why one script has three versions, and three versions is
how a repository ends up running machinery nobody compared: on
2026-08-11 the `doctor` copies had drifted far enough that one of them
scanned a path that does not exist and reported the repository clean.

sdlc ADR 0013 is the decision this implements.

## Behavior

`prepare` makes the tree ready by calling the project's own install
script, resolved the same way `lint` and `test` are resolved and run in
the prepared tree, instead of running an install command of its own.

The hard choices, settled:

- **Absent means skip.** A project that needs no install writes no file
  and `prepare` continues. This differs from `lint` and `test`, whose
  absence is a fault, because the green precondition cannot be judged
  without them and a tree with nothing to install is ordinary. A file
  that exists but is not executable is **not** absent — that is a
  fault, because it is a project that meant to say something and
  failed to.
- **A failing install keeps today's outcome exactly:** tear down the
  tree that was made, report on stderr naming the directory it failed
  in, and exit 1 so the dispatcher reads it as a fault rather than a
  refusal.
- **Install runs before the green check**, because `lint` and `test`
  cannot run without it.
- **The effect does not change.** After this ticket, prepared trees have
  the same `bot/node_modules` they have today, and `prepare` no longer
  knows that a `bot/` subdirectory exists.

The lines cannot move untouched, though: section `2b` uses `$TREE` and
other variables belonging to `prepare`, which a separately invoked
script does not see. The design chooses how install learns where to
work — `prepare` passing it, or install deriving it from its own working
directory — and defends the choice.

## Proving it

**Nothing in this repository currently tests the lifecycle scripts.**
There is no root `tests/` directory; the suite is `make -C bot test`
over `bot/tests/`, and nothing there mentions `prepare`. So no existing
test pins this behaviour and none needs restating.

That also means a new test must live where this project's own `test`
script will actually run it — under `bot/tests/`, reachable from
`bot/Makefile`'s test target. A test placed at a root `tests/` path
would never execute and would prove nothing.

The design should say how it proves the behaviour given that, including
whether proving it here is worth the coupling of a shell-script test
inside bot's suite, or whether the honest answer is that this
repository relies on the sdlc side's coverage of the same change.

## Who else does this

sdlc and queue carry the same change as their own tickets, filed at the
same time: sdlc 0066 and queue 0062. There is no ordering between the
three — each repository's `prepare` is its own file today, and each
moves its own block into its own script. Nothing breaks if one lands
first and another never does. To make the later shared-copy step cheap,
the `prepare` this ticket leaves behind should match the template's text
exactly.

The single shared copy of `prepare` is a later step and is not this
ticket. It cannot happen until all three have landed, because a shared
script cannot carry three different install blocks.

## Notes on authorization

`sdlc/scripts/README.md` is opened because it documents the lifecycle
scripts and their contracts; adding `install` to that table is part of
this change.

This repository ratchets `bot/src`, which this change does not touch, so
no raise is expected. If the design finds it needs one, say why in the
design commit rather than assuming the allowance.
