# There is no public examples program

The repository has a conformance corpus under `specification/conformance/` and a smoke suite under `smoke/`. The corpus proves a runtime accepts and refuses the right assemblies. Smoke proves the runtime works end to end. Neither is something a reader can copy and run, and neither shows a capability being used for its purpose.

The only assembly a reader can see is `docs/src/content/docs/specification/example.md`. One example carries every capability the specification defines.

This is a program, not a single change. It decomposes into one ticket per example, plus one ticket for the CI wiring and one for the documentation generation. File them as the shape settles; do not promote this issue as one ticket.

## What the program builds

A public `examples/` folder at the repository root. One runnable assembly per capability:

- Skills and slots: a stage that reaches `$SKILLS` and writes `$OUTPUT`, with a `skills/` folder placed so scope is visible.
- Gates: a stage whose checklist, schema, and gate each run, including one send-back and one recovery.
- Hooks: the `before`, `success`, and `failure` hooks around one stage, with the failure hook actually reached.
- `LOOP.md`: a repeat bounded by its `repeat` ceiling.
- `CHOOSE.md`: a chooser with a body picking among named alternatives.
- `PARALLEL.md`: named branches running at once, each contributing one file to the next stage's `$INPUT`.
- `FANOUT.md`: one subflow per checked list item.
- `DESCEND.md`: a flow whose stages call it again.

Then two or three combined examples that show a repeatable, reliable agent end to end, using several capabilities together rather than demonstrating one.

## The conditions

Every example runs under the conformance or test suite in CI. An example that is not executed by a check is documentation pretending to be code, and it rots.

Every example gets a documentation page under `docs/src/content/docs/`, generated from its files and its record where generation is possible and written where it is not. The page shows the folder tree, the stage text, and the record excerpt, and the excerpt comes from a real run.

Bugs found while building an example become their own issues here. Do not repair the runtime inside an example ticket.

## Why it matters

The plan notes that tests and examples define behavior but do not prove demand, and that operator use should be audited before new inspection commands are filed. A public examples program is the cheapest source of that evidence: it exercises every capability the way a reader would, and what it finds awkward is what an operator will find awkward.

## Progress

The `home` branch shipped the first example and the CI condition. `examples/vtriage` is a combined example: a skill in a slot, a checklist, a schema, a `CHOOSE` node, two gates including a blocking exit 75, and the three hooks. `examples/README.md` states the folder's rule. `sdlc/scripts/examples` runs `bot check` on every flow of every example against a throwaway home, and `sdlc/scripts/lint` calls it, so `make check` fails when an example stops resolving. The home page hero and the first-assembly guide now point at it. Decisions are in `sdlc/planning/notes/2026-09-11-first-example.md`.

Still open: single-capability examples for `LOOP`, `PARALLEL`, `FANOUT`, and `DESCEND`; the generated documentation page per example; a live rung that proves an example still produces its output.

The `ladder` branch restructured the folder so a visitor sees short paths. `vtriage` is
now `triage` and `digest` is now `brief`. The sample requests moved to `examples/data/`
and the sealed run to `examples/runs/triage/`, so no assembly declares `folders:` any
more. A new `examples/hello` sits at the bottom of the ladder: one flow, one stage, a
two-item checklist, and nothing else. `examples/README.md` lists the four in order.
`sdlc/scripts/examples` skips `data/` and `runs/` and fails any other folder that has
no `ASSEMBLY.md`; it checks four assemblies and exits 0. The visible command is
`bot run ./triage/triage @data/note-urgent.txt`, run from `examples/`. Decisions are in
`sdlc/planning/notes/2026-09-11-example-ladder.md`.
