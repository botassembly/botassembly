# The schema

> **Stability: stable.**

A schema declares what a stage's output has to be. It is a file in the stage
folder, and its extension decides the output's format.

| File          | `$OUTPUT` is | The runtime                  |
| ------------- | ------------ | ---------------------------- |
| `schema.json` | JSON         | validates against the schema |
| `schema.md`   | Markdown     | hands it to the agent, validates its frontmatter |

A stage folder holds one schema. A stage with none writes text.

This is the second of the three checks ([gating](gates.md)).

## `schema.json`

JSON Schema, dialect **2020-12**. A `$schema` key naming a different dialect is
a malformed assembly, so a runtime never has to guess which rules a schema was
written against and two runtimes never disagree about one. There is no
`schema.yaml`: one carrier syntax for data means one parser, one refusal
surface, and no second way to write the same thing.

The output is parsed and validated. A file that does not parse, or that parses
and does not match, sends the agent back with the parser's or the validator's
complaint as the reason.

The agent is shown the schema, because a schema is an instruction. It is the
stage saying what the next stage needs.

## `schema.md`

A template rather than a validator — except for its frontmatter, which is data
and is validated. Each key the template's frontmatter names must appear in the
output's frontmatter, and a key may carry a **slim type** saying what its value
must be:

```markdown
---
verdict: str
confidence: float
reasons: list
blocking: bool
---

## What changed

## What is wrong with it

## What to do
```

The slim types are `str`, `int`, `float`, `bool`, `list`, and `date` — `date`
is a calendar date, `YYYY-MM-DD`, and nothing looser. A key with no value
accepts anything. Keys the template does not name are the output's own
business: they pass through unexamined, the way the body does. This is the
whole of the language — a namespace with types, not a schema notation folded
into frontmatter; an output whose frontmatter needs more than this is data, and
data takes `schema.json`.

An output missing a named key, or carrying a value of the wrong type, is sent
back like any schema failure. The frontmatter's bytes must be valid UTF-8 — it
is data, and a mis-encoded value that decodes to a replacement character passes
the very check meant to catch it — and the body's need not be, like [a prompt
body's](stage.md#the-prompt-and-the-configuration). The body is not validated:
the runtime hands the template to the agent as the shape to write in, and
whether the prose honors it is a question for [a gate](gate.md), which can read
markdown the way a person would and say what a parser cannot.

Markdown is what most stages produce, because most stages produce something a
person will read. A template lets those stages be specific about form without
pretending that prose has a syntax.

## Choosing between them

Use `schema.json` when a later stage or a script will read the output as data.
The validation is free and the failure message is precise.

Use `schema.md` when the output is prose with a known shape.

Use no schema when the output is prose and the shape does not matter.

## After `success`

A `success` hook does not rewrite the output ([hooks](hooks.md)). The output is
hashed the moment its checks pass, and what passed the checks is what is
sealed, always — so the promise that a `.json` file parses and matches cannot
be quietly broken on the way out. Any rewrite is drift, and drift is the
assembly being wrong: the run exits `2`, cause `fault`, and the record names
the file ([the record](record.md#hashes)).

## What the next stage sees

The extension the schema chose is the extension of the file that lands in the
next stage's `$INPUT` ([slots](slots.md)). A stage named `analyze` with a
`schema.json` puts `analyze.json` in front of whatever runs next, and that is
how the next stage knows it can pipe it through `jq`.
