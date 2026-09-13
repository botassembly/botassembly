# A worked example

> **Stability: stable.**

One assembly, five steps, one subflow, and what each one sees.

```text
review/
  ASSEMBLY.md
  skills/
    house-style/
      SKILL.md
  subflows/
    oracle/
      FLOW.md
      01-answer.md
  flows/
    change/
      FLOW.md
      01-read.md
      02-assess/
        PARALLEL.md
        risk/
          STAGE.md
          schema.json
          gate.sh
        cost.md
      03-recommend/
        LOOP.md
        01-draft.md
        02-critique/
          STAGE.md
          gate.sh
      04-decide/
        CHOOSE.md
        escalate.md
        patch.md
      05-report.md
```

## The home

The home configuration defines the complete choices used by this example:

```yaml
intelligences:
  default: { provider: anthropic, model: claude-opus-5, reasoning: high }
  oracle-hard: { provider: anthropic, model: claude-opus-5, reasoning: max }
```

With `review/` installed under the same home's `assemblies/` directory, this
configuration and the tree above pass `bot assembly check review/change` together.

## The assembly

```markdown
---
intelligence: default
---

This assembly reviews proposed changes to a codebase and says what should
happen to them.
```

The assembly's name is its folder: `review`.

The body reaches every stage. `skills/house-style/` reaches every stage too, as
`$SKILLS/house-style/` ([skills](elements/skills.md)).

## Starting it

```sh
bot run start review/change --in ../worktrees/482 "the auth change in #482 looks wrong"
```

The agent works in `../worktrees/482` rather than wherever the runtime was
started; that becomes its `$PWD` ([slots](elements/slots.md#pwd)). The request
lands as one file.

## `01-read.md`

```markdown
---
retries: 1
---

Read the change in the working directory and describe what it does. Do not
judge it yet.

## Checklist

- Every file the change touches has been read
- The commit message has been read
```

`$INPUT` holds `request.txt`. There is no schema, so `$OUTPUT` is text, and the
checklist is the only thing gating the exit. An agent that stops with an item
still `todo` is sent back once ([the checklist](elements/checklist.md)).

Out comes `read.txt`.

## `02-assess/` — two branches at once

`PARALLEL.md`:

```markdown
---
width: 2
---
```

Both branches receive `$INPUT/read.txt`.

`risk/STAGE.md` writes JSON, because a later stage reads it as data:

```json
{
  "type": "object",
  "required": ["severity", "reasons"],
  "properties": {
    "severity": { "enum": ["critical", "high", "low"] },
    "reasons": { "type": "array", "items": { "type": "string" } }
  }
}
```

`risk/gate.sh` catches what the schema cannot:

```sh
#!/bin/sh
if [ "$(jq -r '.reasons | length' "$1")" -eq 0 ]; then
	echo "A severity was given with no reasons. Say what makes it that severe."
	exit 1
fi
```

`cost.md` is a single file, so it has no schema and writes prose.

Out come two files named after the branches: `risk.json` and `cost.txt`.

## The oracle — delegation

`subflows/oracle/` sits at the assembly root, so every stage can call it
([subflows](elements/subflow.md)). `FLOW.md`:

```markdown
---
description: Answers one hard question, carefully.
---
```

`01-answer.md`:

```markdown
---
intelligence: oracle-hard
---

Answer the question in your input. Say what you are unsure of.
```

The `risk` agent, unsure whether a lock change is safe, calls it:

```json
{ "calls": [{ "flow": "oracle", "input": "Can this lock be taken twice by one process?" }] }
```

The child is a complete run of its own — fresh session, its own record, gates
and all. The answer lands at `$SUBFLOWS/1/output.txt`; the tool result names
its size and how it ended. The `risk` agent reads it and finishes its own JSON.

## `03-recommend/` — a loop that ends when the agent says so

`LOOP.md`:

```markdown
---
repeat: 3
---

Is this recommendation ready to act on? Another repeat is only worth it if you
have something specific to change.
```

`01-draft.md` sees:

```text
$INPUT/risk.json
$INPUT/cost.txt
```

and on the second and third repeats also `$INPUT/critique.txt`, the previous
repeat's last stage ([loop](elements/loop.md)).

`02-critique/` reads the draft, and its `gate.sh` requires the critique to name
at least one concrete change. When it passes, that agent is asked the question
from `LOOP.md`. Answering continue runs `01-draft.md` again with the critique in
front of it; answering stop ends the loop.

Say it continues once and stops on the second time round. The loop passes along
that second repeat's critique under the loop's own name: `recommend.txt`
([loop](elements/loop.md)).

## `04-decide/` — one of two

`CHOOSE.md`:

```markdown
---
---

- `escalate` — a person has to look at this before anything else happens
- `patch` — the change can be fixed where it stands
```

An agent reads `$INPUT/recommend.txt` and names one ([choose](elements/choose.md)). The
one it names runs; the other does not.

## `05-report.md` — the tail

```markdown
---
---

Write the disposition: what was decided, and what happens next. A person acts
on this file without reading anything else.
```

Every sequence ends in a stage, never in a container
([graph](elements/graph.md#the-last-entry-of-a-sequence-is-a-stage)), so the
decision cannot stand last. `$INPUT` holds the chosen alternative's output
under its own name — `escalate.txt` or `patch.txt`, so this stage knows which
way the decision went without being told ([choose](elements/choose.md)) — and
turns it into the file the run answers with.

## What the run produces

The flow's output is the output of `05-report.md`. It goes to stdout, and the
run exits `0`.

## Reading it afterward

```sh
bot run events <run>
bot run session <run> 03-recommend/02-critique --repeat 2
```

The first is what happened, including recorded tool calls. The second is the
transcript of one stage of one repeat ([inspection](elements/inspection.md)).
