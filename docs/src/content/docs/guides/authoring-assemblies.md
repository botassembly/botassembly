---
title: "Authoring an assembly"
description: "Build a workflow as a folder of markdown files and small scripts — the working tour of the assembly format."
sidebar:
  order: 2
---

This guide is for the teammate who *builds* the workflow. An
assembly is a folder of markdown files and small executable
scripts: nothing to compile, no build step, no application to ship.
The full contract is the [specification](/specification/overview/); this is
the working tour.

## The shape

This is `examples/triage`, the smallest assembly that carries every part
at once:

```text
triage/
  ASSEMBLY.md            # required: the manifest
  skills/
    priority-rubric/
      SKILL.md           # reference material a stage reaches at $SKILLS
  flows/
    triage/
      FLOW.md            # required per flow; needs a `description` line
      01-classify/       # a stage (folder form)
        STAGE.md
        schema.json      # judges the shape of the output
        before           # executable hook: prepares the input
      02-route/
        CHOOSE.md        # the folder is the control flow
        urgent/01-urgent.md
        routine/01-routine.md
      03-verify/
        STAGE.md
        gate/            # executables: judge the output, cheapest first
          01-blocker
          02-sections
```

A stage may also be one file, `01-classify.md`, when it needs no checks
or hooks of its own. `examples/hello` is one such stage and nothing else.

`ASSEMBLY.md` has YAML frontmatter for defaults (`provider`,
`model`, `reasoning`, `timeout`, `retries`, `local-context`) and a
body stating the assembly's purpose — every agent in every stage
reads that body. `local-context` is one of `ignore` (the default),
`announce`, or `use`, and decides what the working directory's own
`AGENTS.md` and `skills/` do for the agents. Stages run in the
order of their leading numbers, compared as numbers — `9-` runs
before `10-` — so number them.

Name the model choice your assembly needs. The home maps that portable name to
a provider, model, and reasoning level:

```yaml
---
intelligence: coder-quick
---
```

Define `coder-quick` under `intelligences` in the home's `config.yaml`.
A providerless row whose model is ambiguous names the candidate providers.

`FLOW.md` needs a one-line `description` — leave it out and `check`
answers `key-missing` with `Add the required key description.` It is
the line a delegating agent reads when it decides whether to call
this flow, so write it for that reader.

Every file that shapes the assembly is frontmatter and body:
`ASSEMBLY.md`, `FLOW.md`, every stage file, and the capitalized files
that make a folder a loop, a choice, or a parallel. Empty frontmatter
is fine; the fence is not optional. A file that opens straight into
prose is refused with `frontmatter-invalid` and
`Add fenced YAML frontmatter.`, so a stage with nothing to configure
still starts:

```markdown
---
---

Read the change and list what it touches.
```

An assembly holds no other assembly: a nested `ASSEMBLY.md`
anywhere below the root is refused at `check`.

## Stages

A stage's markdown body is its instruction. The agent gets your
instruction, the assembly's purpose, and an `$INPUT` directory
holding what the previous stage produced (the first stage gets the
request). It must write its answer to `$OUTPUT`. Frontmatter on
the stage overrides the assembly's defaults for that stage; the
precedence ladder is: command line, task file, stage, containers
(innermost first), flow, assembly, home config, built-in default.

A stage may also set `workdir: ./investigator` in its frontmatter to select an
existing directory under the caller's `--in` root. It is stage-only: `.`,
absolute paths, and paths containing `..` are refused. `bot` never creates,
cleans, retains, or removes this caller-owned directory; this is placement, not
sandboxing. The agent, local context, hooks, and gates all use it.

`intelligence: coder-hard` says what complete model choice this stage needs.
The home's flat `intelligences` table defines that name. Distinct effort levels
are distinct names, such as `coder-quick` and `coder-hard`. Assemblies carry
only names; homes carry provider, model, and reasoning values. The nearest
intelligence name on the command, task, stage, container, flow, or assembly
rung wins. If none is named, the executing agent uses the reserved `default`
row.

## Checks: how a stage earns its exit

Three kinds, all optional, judged in order — checklist, schema,
gate. A failure sends the agent back into the same session with
the reason; `retries` bounds how many times.

- **Checklist** — a `## Checklist` section in the stage body. The
  agent must mark every item done, or skipped *with a reason*; a
  bare skip is an error and is not a mark.

  This is the checklist `triage` puts on its first stage:

  ```markdown
  ## Checklist

  - The priority follows the rubric at $SKILLS/priority-rubric/SKILL.md
  - The trigger phrase appears verbatim in the request
  ```

  Plain list items, one per line, under a heading that reads exactly
  `## Checklist` — nothing declares it, no frontmatter key, no
  separate file. Do not write `- [ ]`: the agent marks items with a
  tool, not by editing your file, and the brackets would just become
  part of the item's text. Everything up to the next heading is the
  list, and the heading is part of the prompt, so the agent reads its
  checklist along with its instructions.
- **Schema** — one schema file in a stage folder. `schema.json` when
  the output is data a later stage or a script will read: it must
  parse and validate. `schema.md` when the output is prose with a
  known shape: the agent is handed the template and its frontmatter
  is what gets validated.
- **Gate** — an executable `gate` (or a `gate/` folder, run in
  name order, cheapest first). Exit 0 passes. Anything a failing
  gate prints becomes the reason the agent reads. The gate gets
  the output path as `$1` and the stage's slots (`$OUTPUT`,
  `$INPUT`, `$TMP`) in its environment.

Write gates as real judges: check the shape, count what must be there,
grep for the sections the answer must carry. A complete gate is small.
This is `triage/flows/triage/03-verify/gate/02-sections`, whole:

```sh
#!/bin/sh
# Refuse a memo that lost a required section. The gate's own words are
# what reaches the agent on a send-back and the terminal on exhaustion.
set -eu
for heading in "## Queue" "## Why" "## Action"; do
	if ! grep -qF "$heading" "$1"; then
		echo "The memo is missing its $heading section. Add it."
		exit 1
	fi
done
```

Exit 0 and the stage seals; anything else, and whatever the gate
printed goes back to the agent as the reason. The record keeps every
gate's output either way.

Name a gate or a hook by its role alone — `gate`, `before` — with
no extension: the shebang on its first line names the language, so
the suffix carries nothing. An extension is allowed and ignored,
there for whoever reads the folder.

## Hooks

Executables beside the stage, all optional: `before` rewrites the
files in `$INPUT` before the agent starts (normalize an upload,
fetch a registry entry); `success` runs after the output passes
every check and before it seals, reading `$OUTPUT`; `failure` runs
after a stage fails, with `$CAUSE` (one word) and `$REASON` (path
to the failing check's output). A hook's exit code counts: `before`
exiting non-zero fails the stage before the agent runs, and
`success` exiting non-zero fails a stage whose output had passed
every check. `failure` runs after the fact: its exit, timeout,
inability to execute, output overflow, or hash-recheck drift is
diagnostic evidence only and cannot replace the failed stage's
ending. The sealed output cannot be altered — bytes that change
after checks pass end the run as drift.

## Containers

Fixed control flow lives in a folder with one of three files in it,
and the folders nest — with two exceptions: a loop anywhere inside
a loop is refused, however many folders sit between them, and a
branch or alternative may not itself directly be a parallel:

- **`CHOOSE.md`** — the body names the alternatives; a chooser
  agent picks exactly one branch, with its reason recorded.
- **`PARALLEL.md`** — every branch runs with the same input; the
  next stage receives every branch's output side by side.
- **`LOOP.md`** — the branch repeats; each repeat receives the
  loop's input plus the previous repeat's output.

Containers are for control flow you know while authoring.

### Containers in practice

`examples/brief` puts all three of these in one flow, next to a fan-out. It reads three notes, summarizes each one through `FANOUT`, produces a title, a tag list, and the bullets at once through `PARALLEL`, and then loops on the combined digest until a gate and the loop's own question both accept it. Its `README.md` says why each container sits where it does — which placements the tail rule and the fan-out's limits forced — and carries the `bot assembly check` output for the whole flow.

## Fan-out

A fourth sentinel handles the case the three containers cannot: one piece of work per item of a list whose length nobody knows until the run produces it. `FANOUT.md` runs one authored subflow for every item in a checked JSON list. The preceding stage produces the list; the producing agent never calls the subflow itself.

This is `examples/brief`, which summarizes every note in a week of team
notes:

```yaml title="flows/brief/02-summarize/FANOUT.md"
items: notes
subflow: summarize
width: 3
max-items: 3
```

The sentinel has no body and exactly those four keys. `items` names a top-level array in the preceding stage's JSON output. `subflow` names an in-scope subflow whose final node is an ordinary stage. `width` limits how many children run at once. The bounds are `1 <= width <= max-items <= 32`, so a fan-out runs at most 32 items.

The limits on placement are strict. The `FANOUT.md` folder is a numbered folder in the root sequence of a named entry flow. One ordinary JSON stage must precede it and one ordinary stage must follow it. It cannot be first, last, nested inside another container, or placed in a subflow. Its folder holds only `FANOUT.md` and an optional `README.md`.

Each array entry has exactly `id` and `input`. `bot` sorts items by the bytes of their ids and gives the successor one `<id>.<extension>` file per item. A fan-out succeeds only when every child succeeds. It never hands a partial set to the next stage. `FANOUT.md` is provisional and may change before 1.0. The full contract is [fan-out](/specification/graph/#fanoutmd).

`bot assembly check` does not walk into the subflow a fan-out selects, so the fan-out row's `options=` field is empty and the child stages never appear.

## Limiting what a stage can reach

By default a stage's agent gets the unrestricted tool set. The stage-only `access` key narrows it:

```yaml
access:
  read: [INPUT, PROJECT_DATA]
  write: [OUTPUT]
  edit: []
  bash: [git, python3]
```

`access` is a mapping with up to four operation keys: `read`, `write`, `edit`, and `bash`. Any other operation is refused. Each takes an array of names with no duplicates. An empty array denies every name for that operation, and `access: {}` denies every operation. Omitting `access` keeps the unrestricted default.

The file operations name managed slot exports, not paths. The runtime slots are `INPUT`, `OUTPUT`, `TMP`, `SKILLS`, and `PWD`, and a declared assembly slot contributes its own uppercase export. `SUBFLOWS` is available only where subflows are in scope. Naming a slot that is not available at that stage is refused.

A bash name authorizes direct dispatch by that name. It does not prove the executable is installed, and it is not a sandbox: a command you allow can do anything that command can do.

`access` belongs to `STAGE` only. A control sentinel carrying it is refused. The full contract is [access](/specification/structure/#access).

## Skills

A `skills/` folder in the assembly holds reference documents the
agents may read. Each stage that can see a skill gets its own copy
of it, so a skill is there to be read during a run and not rewritten
by it. Dotfiles and `README.md` are inert everywhere — notes for
humans, and nothing in them is read or run.

## The development loop

You do not have to install or link anything to start. Point the
command at the folder — a target beginning with `/`, `./`, or `../`
is a path rather than a name in the home, and the last segment is
still the flow:

```sh
bot assembly check ./triage/triage
bot run start ./triage/triage @data/request-urgent.txt
```

Once you are running it often, link the checkout so the name works
from anywhere:

```sh
bot assembly link ~/code/triage
bot assembly check triage/triage             # validates, no model call
bot run start triage/triage @data/request-urgent.txt
bot run output <run> --raw                   # the answer again, byte for byte
bot run events <run>                         # the whole record, event by event
bot run session <run> 01-classify            # read what the agent saw
```

A link is read fresh every time, so an edit is live for the next run
— but only the next one. A run copies the whole assembly when it
starts and executes that copy from beginning to end, so editing a
later stage while an earlier one is working changes nothing about
the run in flight. Save, then start a run.

`bot assembly check` is the fast loop: it refuses malformed assemblies with
a named fault and prints the stages in execution order. It calls no
model, so it says nothing about whether a provider is configured or
a model is reachable. If your link's target moves or stops being an
assembly, `bot assembly list` lists it with `BROKEN` rather than going
quiet.

When the assembly is ready, push it to the team repository; teammates
run `bot assembly install ...#triage` and get a copy.

Two rules that keep everything honest: the record never lies (what
ran, what was judged, what it cost. All of it stays on disk, and `bot run events` reads
it), and secrets never go in any assembly file — credentials live
in your environment or in the machine's own credential file, which
only `bot auth login` and `bot auth logout` write.
