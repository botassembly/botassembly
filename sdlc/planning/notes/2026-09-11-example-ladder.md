# The example ladder

Branch `ladder` off `origin/main`. It touches `examples/`, `sdlc/scripts/examples`,
`README.md`, and the site. It leaves `bot/` and `specification/` alone.

## The ruling

Ian ruled on 2026-09-11 that the first demo's paths were too wordy. The assembly sits
in its own folder, the data sits in its own folder, and the word "examples" never
appears in a command or a tree a visitor sees. `vtriage` becomes `triage`. A hello
world goes at the bottom of the ladder.

## The layout

`examples/` now holds four assemblies and two plain folders.

```
examples/
  hello/     one flow, one stage, a two-item checklist
  triage/    a skill, a checklist, a schema, CHOOSE, two gates, three hooks
  brief/     FANOUT, PARALLEL, LOOP, a flow-scoped subflow
  outline/   DESCEND, two skills, schema.md, an early-exit loop
  data/      the sample requests
  runs/      the published runs, one folder per assembly
```

`vtriage` was renamed to `triage` and `digest` to `brief`, whose flow was already
called `brief`. The sample requests moved out of each assembly's `requests/` folder
into `examples/data/`, and the sealed run moved from `examples/vtriage/runs/` to
`examples/runs/triage/`. Every `ASSEMBLY.md` dropped its `folders:` key, because
nothing opaque lives inside an assembly any more.

## Decisions

**The data folder is not an assembly.** `sdlc/scripts/examples` skips `data/` and
`runs/` by name and refuses any other folder that has no `ASSEMBLY.md`. A new folder
without a manifest now fails the check instead of being ignored.

**The visible command names the flow.** Ian's ruling wrote the command as
`bot run ./triage @data/note-urgent.txt`. That target runs the assembly agent, not the
flow: `specification/elements/invocation.md` says a run that names no flow runs the
assembly itself, and `bot check ./triage` proves it by printing one `assembly` row. The
command shipped is `bot run ./triage/triage @data/note-urgent.txt`. Ian can overturn
this by renaming the flows, which would give `./triage/queue` and similar, at the cost
of a folder name and a flow name that no longer agree.

**`@file` resolves against the working directory.** `readRequest` in
`bot/src/invocation.ts` resolves the path against the run's directory. Observed:
`bot run ./triage @data/nope.txt` from `examples/` refuses with `path-missing
data/nope.txt`, and the real file gets past the request read to the provider. The short
path works from `examples/`.

**The run README says what moved.** The sealed record's bytes name no old path, so
nothing in `record.jsonl` was touched. The run's own README now gives the new command
and states that the assembly was `examples/vtriage` and the request
`examples/vtriage/requests/note-urgent.txt` when the run happened.

**The old planning notes keep their old paths.** They record what was decided then.
This note records the rename.

## The proof

`sh sdlc/scripts/examples` exits 0 with four assemblies checked. `bot check` line
counts: `hello/greet` 1, `triage/triage` 5, `brief/brief` 10, `outline/plan` 5. Each
README pastes its own output, taken from `examples/` against a throwaway home whose
`default` is `google` / `gemini-3.5-flash-lite` / `low`. No model-backed stage ran.
`sdlc/scripts/lint` exits 0, `node --test docs/scripts/*.test.mjs` passes 22, and the
docs build completes with 31 pages.
