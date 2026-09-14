---
title: "Stages and checks"
description: "Write a stage, then add a checklist, a schema, a gate, and hooks to judge what it produced."
---

A stage is one unit of work given to one agent. It reads its input, does one job, writes its output, and ends with an honest exit code. Three kinds of check judge what it produced.

## Two forms of a stage

A stage is a single markdown file when it needs nothing else.

```text
01-classify.md
```

A stage is a folder when it carries checks or hooks of its own. The folder holds `STAGE.md` and the files beside it.

```text
01-classify/
  STAGE.md
  schema.json      judges the shape of the output
  before           executable: prepares the input
```

Every file that shapes an assembly is frontmatter and body. `ASSEMBLY.md`, `FLOW.md`, every stage file, and the capitalized files that make a folder a branch, a loop, or a parallel. Empty frontmatter is fine. The fence is not optional. A file that opens straight into prose is refused with `frontmatter-invalid` and the sentence `Add fenced YAML frontmatter.`

An assembly holds no other assembly. A nested `ASSEMBLY.md` anywhere below the root is refused.

## What a stage's agent receives

The agent gets your instruction, the assembly's purpose from `ASSEMBLY.md`, and an `$INPUT` directory holding what the previous stage produced. The first stage gets the request. The agent must write its answer to `$OUTPUT`.

## Options and where they resolve

Frontmatter on a stage overrides the assembly's defaults for that stage. A rung is one place a value can be set. The rungs, nearest first: command line, task file, stage, containers innermost first, flow, assembly, home configuration, built-in default. The nearest one that sets a value wins.

`ASSEMBLY.md` may set `intelligence`, `timeout`, `retries`, and `local-context` for everything below it. A stage may set those and `workdir`.

`intelligence: coder-hard` says which complete model choice this stage needs. The home's `intelligences` table defines that name. Distinct effort levels are distinct names, such as `coder-quick` and `coder-hard`. Assemblies carry only names. Homes carry the provider, model, and reasoning values. [Providers, models, and credentials](/operate/providers-and-credentials/) holds the table's rules.

`workdir: ./investigator` selects an existing directory under the caller's `--in` root. It is stage-only. `.`, absolute paths, and paths containing `..` are refused. `bot` never creates, cleans, retains, or removes that directory. This is placement, not containment.

`local-context` decides what the working directory's own `AGENTS.md` and `skills/` do for the agent. `ignore` reads none of it and is the default. `announce` names what is there and leaves the reading to the agent. `use` puts it in front of the agent.

## Three checks

Three kinds of check, all optional, judged in that order: checklist, schema, gate. A failure sends the agent back into the same session with the reason. `retries` bounds how many times.

### Checklist

A `## Checklist` section in the stage body. The agent must mark every item done, or skip an item with a reason. A bare skip is an error and is not a mark.

This is the checklist `triage` puts on its first stage.

```markdown
## Checklist

- The priority follows the rubric at $SKILLS/priority-rubric/SKILL.md
- The trigger phrase appears verbatim in the request
```

Plain list items, one per line, under a heading that reads exactly `## Checklist`. Nothing declares it. There is no frontmatter key and no separate file.

Do not write `- [ ]`. The agent marks items with a tool, not by editing your file, and the brackets would become part of the item's text.

Everything up to the next heading is the list. The heading is part of the prompt, so the agent reads its checklist along with its instructions.

### Schema

One schema file in a stage folder.

`schema.json` when the output is data a later stage or a script will read. The output must parse and validate.

`schema.md` when the output is prose with a known shape. The agent is handed the template, and its frontmatter is what gets validated.

### Gate

An executable named `gate`, or a `gate/` folder run in name order, cheapest first. Exit 0 passes. Anything a failing gate prints becomes the reason the agent reads.

The gate gets the output path as `$1`. It gets the stage's slots in its environment: `$OUTPUT`, `$INPUT`, and `$TMP`.

Write gates as real judges. Check the shape, count what must be there, search for the sections the answer must carry. A complete gate is small. This is `triage/flows/triage/03-verify/gate/02-sections`, whole.

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

Exit 0 and the stage seals. Anything else, and whatever the gate printed goes back to the agent as the reason. The record keeps every gate's output either way.

Name a gate or a hook by its role alone, with no extension. The shebang on the first line names the language, so a suffix carries nothing. An extension is allowed and ignored.

## Hooks

Executables beside the stage, all optional.

`before` rewrites the files in `$INPUT` before the agent starts. Use it to normalize an upload or fetch a registry entry.

`success` runs after the output passes every check and before it seals. It reads `$OUTPUT`.

`failure` runs after a stage fails. It gets `$CAUSE`, one word, and `$REASON`, the path to the failing check's output.

A hook's exit code counts. `before` exiting non-zero fails the stage before the agent runs. `success` exiting non-zero fails a stage whose output had passed every check.

`failure` runs after the fact. Its exit, timeout, inability to execute, output overflow, or hash drift is diagnostic evidence only. It cannot replace the failed stage's ending.

The sealed output cannot be altered. Bytes that change after checks pass end the run as drift.

## Next

[Control flow](/build/control-flow/) turns folders into branches, loops, and fan-out. [Explore an assembly](/build/explore/) shows what a real folder resolves to, option by option.
