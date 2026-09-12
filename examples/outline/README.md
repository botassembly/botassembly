# outline

Turns a rough topic into a structured report outline: a section plan, a body expanded section by section to whatever depth the topic asks for, and a review that stops as soon as the outline is good.

## What it exercises

- **`DESCEND`.** `02-expand/subflows/expand/` is typed by `DESCEND.md` instead of `FLOW.md`, so every stage inside it has the flow itself in scope as a subflow. `01-section.md` writes its heading and, when the material divides, calls `expand` once per subsection. Each child is a full run of the same flow with the same checks, one level down. `max-depth: 3` is the longest unbroken chain of those self-calls; at the bottom the flow is simply not in its own stage's scope, which is what the prompt's last paragraph is for.
- **A subflow the agent calls as a tool.** `02-expand` does not fan out. It reads the plan, decides how many sections there are, and submits one `subflow` batch. The split is the agent's; the flow, its stages, and its gates are the author's.
- **Two skills in one slot.** `03-review/01-tighten` sees `$SKILLS/outline-style` and `$SKILLS/section-rubric`. They sit at two different scopes and the agent is told nothing about that.
- **`schema.md`.** `01-scope` writes markdown with validated frontmatter: `title` a string, `sections` an integer, `themes` a list, `questions` a boolean. The body of the template is a shape, not a validator.
- **A `LOOP` that exits early.** `03-review` may repeat four times and normally repeats once. Its gate clears first, then the question asks whether a reader would still call anything a fault.
- **Front matter that grades the budget.** `FLOW.md` gives the flow fifteen minutes, `02-expand` keeps that for the descent it drives, `01-scope` takes five, and `04-emit` takes two. `DESCEND.md` carries its own required `max-depth` beside a timeout of its own.

## Why each piece sits where it sits

**The descend flow sits in a stage folder.** `02-expand` is the only stage that has any business calling it, and a subflow belongs at the narrowest scope where it is useful. At the assembly root it would have been a tool on every stage, and `04-emit` would have been free to expand sections of its own. The self-call needs no scope of its own: `DESCEND.md` is the grant, not the placement.

**The two skills sit apart.** `outline-style` is at the assembly root because the descend flow writes headings too, and a style only one half of the assembly follows is not a style. `section-rubric` is in the review stage's own folder because it is the only stage that reviews. Skills are flattened into one list before the agent sees them, so the narrow placement costs the reader nothing.

**The gate is inside the loop, not after it.** It catches what a script can catch — a missing title, fewer than two sections, nesting past three levels, a leaf section with fewer than two bullets — and it clears before the loop's question is asked. Asking whether to go around again about work that just failed its gate would be asking about nothing. What is left over is judgement, and the loop's body is what asks for it.

**`04-emit` follows the loop.** Every sequence ends in a stage, never in a container. Remove it and `bot assembly check` refuses with `tail-container` and "End the sequence with a stage."

**`repeat: 4` is a budget, not a safety net.** A loop with a body that reaches its ceiling while the agent is still saying continue fails with `rejected`. Four leaves room for the outline to be wrong twice.

## The tree

```
outline/
  ASSEMBLY.md                          intelligence: default, retries: 1
  README.md
  skills/outline-style/SKILL.md        the house style, every stage sees it
  flows/plan/
    FLOW.md                            description, timeout: 900
    01-scope/     STAGE.md  schema.md              the plan, frontmatter validated
    02-expand/    STAGE.md                         calls the subflow once per section
                  subflows/expand/  DESCEND.md (max-depth: 3)  01-section.md
    03-review/    LOOP.md (repeat: 4)
                  01-tighten/  STAGE.md (## Checklist)  gate/01-rubric
                               skills/section-rubric/SKILL.md
    04-emit.md
```

## Check it

`bot assembly check` resolves the assembly without calling a model. Run it from the folder above, the one holding all four assemblies:

```console
$ bot assembly check ./outline/plan
01-scope  STAGE  input=request.txt  output=scope.md  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=300@stage,retries=1@assembly,local-context=ignore@default
02-expand  STAGE  input=scope.md  output=expand.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=900@stage,retries=1@assembly,local-context=ignore@default
03-review  LOOP  input=-  output=-  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=900@flow,retries=1@assembly,local-context=ignore@default
03-review/01-tighten  STAGE  input=expand.txt,tighten.txt  output=tighten.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=900@flow,retries=1@stage,local-context=ignore@default
04-emit  STAGE  input=review.txt  output=emit.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=120@stage,retries=1@assembly,local-context=ignore@default
$ echo $?
0
```

The resolved `provider`, `model`, and `reasoning` are whatever your home's `config.yaml` names under the intelligence `default`, so yours will differ. This paste was taken against a home whose `default` is `google` / `gemini-3.5-flash-lite` / `low`. Everything else in the output is the assembly.

Two lines are worth reading twice. `01-scope` shows `output=scope.md`: the schema chose the extension, and `schema.md` is why the next stage reads markdown rather than `.txt`. `03-review/01-tighten` shows `input=expand.txt,tighten.txt` — the loop's own input every repeat, plus the previous repeat's output from the second repeat on.

Five lines is the whole proof, and the descent is not in it. `bot assembly check` prints the entry flow's root stages, so neither `expand` nor any of its self-calls appears; that gap is filed as `sdlc/issues/2026-09-11-bot-check-does-not-list-subflow-stages.md`. The pre-flight does resolve the subflow even though it prints nothing of it. Empty the folder and the check exits 2 with `folder-empty`; drop `max-depth` from `DESCEND.md` and it exits 2 with `key-missing` and "Add the required key max-depth."

## Run it

Run this from the folder above. The `@data/...` path resolves against your working directory.

```sh
bot run start ./outline/plan @data/topic.txt
```

A rough topic goes in. One outline comes out on stdout. The record lands in your bot home, with one child run per section under `02-expand` and one more beneath any section that divided, each carrying its own depth.
