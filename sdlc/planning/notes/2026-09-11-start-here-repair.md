---
project: botassembly
date: 2026-09-11
status: unfolded
---

# Start Here repair

The four Start Here pages contradicted each other and the runtime. This note records what was changed and the choices behind it. Every command below was run against the installed `bot` with `BOT_HOME` pointing at a scratch home. No model-backed stage was run.

## Decisions

**One install recipe, in first-assembly.** `README.md` and `guides/first-assembly.md` already agreed: clone, `npm ci --prefix bot`, `make install`. `guides/install-and-use.md` said `make -C botassembly/bot install` then `make -C botassembly install`. Reading `bot/Makefile`, its `install` target is exactly `npm ci`, so the two recipes are the same work spelled two ways. The README spelling wins because it is what a reader lands on first from GitHub. `install-and-use.md` now names it in one sentence and links to first-assembly. The README and the runtime do not disagree, so nothing needed noting against the runtime.

**The home mode is now a step of its own.** A home created with `mkdir -p` under a default umask is 0775. `bot config` and `bot check` accept it. `bot run` faults with exit 5 and `Installation identity validation failed: The Bot home is not a private owner-only directory.` Reproduced. The guide now creates the home with `chmod 700` and prints the fault text so a reader recognises it.

**`config.yaml` is a required step, not an aside.** Without an `intelligences.default` row every run is refused `intelligence-unresolved`. The guide says so before the assembly is written.

**Reasoning values come from the runtime, not the pages.** `bot/src/model.ts` defines six: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. first-assembly listed four and omitted `minimal` and `max`, while `specification/example.md` uses `max`. All six are now stated. A bad value is refused `value-invalid` against `config.yaml` with `Give reasoning a valid value in intelligence default.` The refusal text does not enumerate the valid values, so the list is documented rather than quoted.

**`bot check` is taught before `bot run`.** The guide now shows the real two-line output for its own assembly, the real `key-missing` refusal for a `FLOW.md` with its `description` removed, and the blind spot: check walks only the entry flow's root sequence, so subflow stages and a self-calling `DESCEND` flow are neither printed nor option-resolved, and a fan-out row's `options=` field is empty for that reason.

**The stderr promise is gone.** Both pages claimed each stage names itself on stderr. It does not, with or without a terminal. Both pages now say a successful run writes nothing to stderr and that stderr carries only `blocked:`, `exhausted:`, `fault:`, and refusals.

**One CLI spelling, with one deliberate exception.** Start Here now uses `bot run list`, `bot run show RUN -j`, and `bot run output RUN --raw`. The exception is `bot show`. It is the only reading that carries the choice a `CHOOSE` made, the gates by path with their verdicts, the hooks with their exits, and the token totals. `bot run show -j` carries identity, stage, repeat, attempt, state, exit, cause, and a scratch path, and nothing else. Both pages now teach `bot show` as the full record reading and say plainly what the bounded one leaves out. `bot session`, `bot logs`, `bot status`, and `bot prune` have no noun form and stay as they are.

**The 404 links are fixed.** `first-assembly.md` linked `../../../../../specification/README.md`, `.../elements/gates.md`, and `.../elements/record.md`, which escape the content collection. They now point at `/specification/structure/`, `/specification/gating/`, and `/specification/record/`. `install-and-use.md`'s `/specification/structure/#home` was also wrong; the generated anchor is `#the-home`.

**FANOUT and `access` are in the authoring guide.** Each is a short section with the real limits, citing the specification page it comes from: `/specification/graph/#fanoutmd` and `/specification/structure/#access`. The old paragraph telling authors to hand-roll fan-out with a subflow-calling stage is gone, because the runtime has the control.

**The worked example is linked into Start Here, not copied.** The specification pages are generated at build time from `specification/*.md`. A copy in `guides/` would be a second source to keep in step with the repo for no gain. The sidebar entry points at the generated `/specification/example/` page.

**Install and Use keeps its name.** The reorder puts it fourth. Renaming it "Operating runs" was offered on the condition that `reference/inspection.md` be merged in. That merge belongs to the nav restructure in the information architecture study, and doing it here would have moved a Runtime Reference page that this change was not scoped to touch.

## Sidebar order

Your First Assembly, The Worked Example, Authoring Assemblies, Install and Use, Principles.

## Left open

`principles.md` was not changed. Nothing in it contradicts the runtime.

The twelve runtime issues from the hands-on experiment still stand. This change documents around three of them (the 0700 home, the missing stderr progress, the thin `bot run show -j`) rather than fixing them. If the runtime later prints stage progress on stderr or widens the bounded summary, the "Run it" and "Read the record" sections of first-assembly and the "Reading what happened" section of install-and-use are the places to revisit.
