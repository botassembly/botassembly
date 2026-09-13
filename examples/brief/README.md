# brief

Turns a week of short team notes into one digest: a summary per note, a title and a tag list beside it, and a combined digest the assembly loops on until it is complete.

## What it exercises

- **`FANOUT` over a checked list.** `01-list` writes a JSON object whose `notes` array holds one `{id, input}` entry per line, and `schema.json` is what makes the list checked. `02-summarize` runs the `summarize` subflow once per entry, three at a time. The next stage finds one file per note, named after the note's id.
- **`PARALLEL` over one input.** `04-frame` hands the same bullet list to three branches at once. `title`, `tags`, and `bullets` each write their own file, nothing is merged, and the loop after it addresses each by name.
- **`LOOP` with a bounded exit.** `05-assemble` repeats at most three times. Its body is the question, so the loop ends when the agent says the digest is complete and fails with `rejected` if it never does.
- **A gate inside the loop.** `01-draft/gate/01-complete` refuses a digest missing a section or a bullet. The gate clears before the loop's question is asked, so the agent is never asked whether to go around again about work that just failed.
- **A flow-scoped subflow.** `summarize` sits in `flows/brief/subflows/`, so only this flow's stages can call it. The assembly root would have handed it to every stage as a tool.
- **Front matter at four levels.** The assembly sets the intelligence and one retry, `FLOW.md` sets a ten-minute timeout every stage inherits, each short branch cuts its own timeout to 120 seconds, and `01-draft` raises its own retries to 2. A container carries its own key instead: `repeat` on `LOOP.md`, `width` on `PARALLEL.md`.

## Why each container sits where it sits

`FANOUT` is the strictest. It is a numbered folder in the root sequence of a named entry flow, one ordinary JSON stage precedes it, one ordinary stage follows it, and it is never first, last, or nested. That is why `01-list` exists and why `03-collect` exists: the fan-out could not be the flow's first entry and could not be followed by `04-frame`, because a parallel stage is not an ordinary stage.

Every sequence ends in a stage, never in a container. That is why `06-emit` follows the loop. A flow's output is its last stage's output, and a flow ending in `05-assemble` would be a loop with nobody to hand the result to.

A branch cannot directly be a parallel stage, and a loop holds no loop. Neither bites here, and both are why the tree is flat rather than nested.

`bullets` looks like a branch that does nothing. It is what carries the summaries past the parallel stage: only the immediately preceding node's outputs reach the next stage, so a digest that needs the bullets needs a branch that writes them.

## The tree

```
brief/
  ASSEMBLY.md                          intelligence: default, retries: 1
  README.md
  flows/brief/
    FLOW.md                            description, timeout: 600
    subflows/summarize/                FLOW.md  01-condense.md
    01-list/      STAGE.md  schema.json          the checked list
    02-summarize/ FANOUT.md                      items: notes, subflow: summarize, width: 3, max-items: 3
    03-collect.md                                one bullet per note
    04-frame/     PARALLEL.md (width: 3)  title.md  tags.md  bullets.md
    05-assemble/  LOOP.md (repeat: 3)  01-draft/STAGE.md  01-draft/gate/01-complete
    06-emit.md
```

## Check it

`bot assembly check` resolves the assembly without calling a model. Run it from the folder above, the one holding all four assemblies:

```console
$ bot assembly check ./brief/brief
01-list  STAGE  input=request.txt  output=list.json  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=300@stage,retries=1@assembly,local-context=ignore@default
02-summarize  FANOUT  input=list.json  output=<item>.txt  options=
03-collect  STAGE  input=<item>.txt  output=collect.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=300@stage,retries=1@assembly,local-context=ignore@default
04-frame  PARALLEL  input=-  output=-  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=600@flow,retries=1@assembly,local-context=ignore@default
04-frame/bullets  STAGE  input=collect.txt  output=bullets.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=120@stage,retries=1@assembly,local-context=ignore@default
04-frame/tags  STAGE  input=collect.txt  output=tags.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=120@stage,retries=1@assembly,local-context=ignore@default
04-frame/title  STAGE  input=collect.txt  output=title.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=120@stage,retries=1@assembly,local-context=ignore@default
05-assemble  LOOP  input=-  output=-  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=600@flow,retries=1@assembly,local-context=ignore@default
05-assemble/01-draft  STAGE  input=bullets.txt,tags.txt,title.txt,draft.txt  output=draft.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=600@flow,retries=2@stage,local-context=ignore@default
06-emit  STAGE  input=assemble.txt  output=emit.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=120@stage,retries=1@assembly,local-context=ignore@default
$ echo $?
0
```

The `provider`, `model`, and `reasoning` values come from whatever your home's `config.yaml` maps the name `default` to, so yours will differ. This paste was taken against a home whose `default` is `google` / `gemini-3.5-flash-lite` / `low`. Everything else is the assembly.

Three lines are worth reading twice. `02-summarize` shows `output=<item>.txt`, one file per list item, which is why `03-collect` reads a directory. `05-assemble/01-draft` shows `input=bullets.txt,tags.txt,title.txt,draft.txt` — the three branches every repeat, plus the previous repeat's own output from the second repeat on. And `timeout=600@flow` on the containers is `FLOW.md`'s key reaching everything under it.

The subflow's stage does not appear. `bot assembly check` prints the entry flow's nodes, and it still resolves `summarize`: empty it and the check exits 2 with `folder-empty`.

## Run it

Run this from the folder above. The `@data/...` path resolves against your working directory.

```sh
bot run start ./brief/brief @data/notes-week.txt
```

Three notes go in. One digest with a title, three bullets, and a tag list comes out on stdout; the record lands in your bot home, with one child run per note under the fan-out and one entry per repeat of the loop.
