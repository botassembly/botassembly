# The first public example

The examples program issue (`sdlc/issues/2026-09-11-no-public-examples-program.md`) asks for a public `examples/` folder, one runnable assembly per capability, every one executed by a check. This branch ships the first one and the check that holds it.

## What landed

`examples/vtriage` is the assembly the home page already showed. It sorts a one-line lab note into an urgent or a routine queue. In one small flow it uses a skill in a slot, a checklist, a JSON schema, a `CHOOSE` node, two gate scripts including a blocking exit 75, and the `before`, `success`, and `failure` hooks. It is a combined example, not a single-capability one, because it is the assembly the home page's proof came from and a reader who pastes the hero command has to land on something that works.

`examples/README.md` states the folder's rule: one folder per capability set, every example checked in CI, every example shipping a `bot check` proof in its own README.

## Decisions

**The intelligence is `default`.** The experiment named a model through the author's own home. A public example that names a provider is a public example most readers cannot run. `default` resolves against whatever the reader's `config.yaml` maps, so the example runs anywhere a home is configured and pins nothing.

**Sample requests live in an opaque folder.** `bot check` refused `requests/` as an unrecognized root entry, correctly — the assembly grammar is strict by default. `ASSEMBLY.md` now declares `folders: [requests]`, which makes the folder opaque: bot establishes it is a real directory and never reads it, and its contents stay out of procedure identity. This keeps the sample notes inside the assembly a reader copies out, and it demonstrates a real feature rather than working around one.

**The check is `sdlc/scripts/examples`, called from `lint`.** Three paths were open. A vitest file in `bot/tests/` was rejected: that suite tests the runtime, and an example is a repository artifact, not a runtime unit. A new `make check` line was rejected: `docs/scripts/root-check.test.mjs` pins `make -n check` to exactly `lint` then `test`, and the root Makefile is deliberately two lines. So the check is a script in the same folder as the other rungs, called from `lint` alongside the other repository-level checks, because `bot check` is static validation and calls no model.

**The check writes its own throwaway home.** CI has no bot home, so `default` would not resolve and every example would refuse. The script writes a temporary `config.yaml` mapping `default` to one catalogued model, the way `smoke/run.sh` writes its `smoke` intelligence. No model is called and no credential is read.

**The script fails on an empty folder.** A check that silently passes when it found nothing is not a check. Zero examples checked is exit 1.

**No documentation page yet.** The issue asks for a generated page per example under `docs/src/content/docs/`. That is the documentation-generation ticket, and it is not this branch. The example's own `README.md` carries the tree, the commands, and the `bot check` proof in the meantime.

## What the home page does now

The hero command is `bot run ./examples/vtriage/triage @examples/vtriage/requests/note-urgent.txt`. It was `bot run ./vtriage/triage @note-urgent.txt`, which pointed at nothing a reader had. The folder tree in `Fold.astro` gained the `examples/vtriage/` prefix and the request file. The first-assembly guide's "Where to go next" now names the folder.

## Left open

- Single-capability examples for `LOOP`, `PARALLEL`, `FANOUT`, and `DESCEND`. Each is its own ticket.
- A generated documentation page per example, and the record excerpt on it coming from a real run.
- `sdlc/scripts/examples` proves an example resolves. Nothing proves an example still produces the memo it claims; that needs a rung on the live smoke ladder, and it costs money.
