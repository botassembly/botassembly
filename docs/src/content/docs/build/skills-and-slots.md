---
title: "Skills and slots"
description: "Slots are the names an agent uses to reach its input, output, and scratch space. Skills are the reference material it reads on demand."
---

An agent works with two vocabularies: the places it reaches, and the material it may read.

## Slots

A slot is a name the agent uses to reach something without knowing where it is. Slots are environment variables. The runtime exports them into the agent's environment and into every process the agent starts.

The agent writes `$OUTPUT`, lists `$SKILLS`, and leaves working files in `$TMP`. It never types a path.

| Slot | What it is |
| --- | --- |
| `$PWD` | the caller-owned directory where this stage works |
| `$INPUT` | a directory holding the stage's input |
| `$OUTPUT` | the one file the stage's output is written to |
| `$TMP` | an empty scratch directory |
| `$SKILLS` | every skill the stage can see, flattened into one list |
| `$SUBFLOWS` | one folder per subflow call the stage has made |

`$INPUT`, `$OUTPUT`, and `$TMP` belong to the runtime. There is one set per stage and no two stages share them.

`$PWD` is the exception. The caller decides what it is. `bot run start --in DIR` selects the root. A stage with `workdir: ./investigator` uses that subdirectory instead. Several runs pointed at the same directory share it.

Whatever the caller's environment held under a slot name is overwritten for every process the run starts, so a slot always means one thing.

The whole contract is [slots](/specification/slots-and-skills/#the-slots).

## Skills

A skill is a capability the agent can reach for. A flow is a procedure: do this, then this, then this. A skill is the opposite shape. It is available at any point, and it describes how to do a kind of thing rather than what to do next.

A skill is a folder holding a `SKILL.md` and whatever it needs beside it. A skill may carry scripts, so a capability can be a deterministic tool rather than improvisation.

```text
skills/
  priority-rubric/
    SKILL.md
```

Each stage that can see a skill gets its own copy. A skill is there to be read during a run and not rewritten by it.

### What the agent is told

The agent is told a skill exists and what it is for, in one line. It reads the rest only when it decides the skill applies. That is what lets an agent be given a large capability without carrying all of it at once.

That only works if the agent is shown as little as possible. A skill belongs at the narrowest scope where it is useful.

### The five scopes

A `skills/` directory may sit at five places, and its position decides who sees it.

| Where it sits | Visible to |
| --- | --- |
| the assembly root | every flow and every stage |
| a flow folder | the stages of that flow |
| a container folder | the stages beneath that container |
| a stage folder | that stage alone |
| the working directory | that stage, and only under `local-context: use` |

Four of those belong to the assembly. The fifth belongs to the caller's working directory, and it is admitted only when the caller says so.

A container carries skills the way it carries options. What sits on a `LOOP`, `CHOOSE`, or `PARALLEL` folder belongs to everything beneath it. The agent making a choice does not read the choice folder's own skills. The stages it chooses between do.

Dotfiles and `README.md` are inert everywhere. They are notes for people, and nothing in them is read or run.

The whole contract is [skills](/specification/slots-and-skills/#skills).

## Next

[Sharing an assembly](/build/sharing/) hands the folder to a teammate.
