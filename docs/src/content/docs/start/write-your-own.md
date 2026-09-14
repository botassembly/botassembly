---
title: "Write your own"
description: "Write a two-stage assembly in four files, check it without calling a model, and run it."
---

A working assembly needs four files and no build step.

The shape comes from `examples/hello`, the smallest assembly the format allows: one manifest, one flow, one stage. This one adds a second stage, so you can see how a stage hands its answer to the next.

## The four files

Make a folder called `welcome` and create these files.

```text
welcome/
  ASSEMBLY.md
  flows/
    greet/
      FLOW.md
      01-welcome.md
      02-subject.md
```

`ASSEMBLY.md` is the manifest. Its frontmatter names the intelligence every stage uses. Its body states what the assembly is for, and every agent in every stage reads that body.

```md title="welcome/ASSEMBLY.md"
---
intelligence: default
---

Turns a joining note into a short welcome message with a subject line.
```

`FLOW.md` marks the `greet` folder as a flow. Its required `description` line says what the flow is for. A delegating agent reads that line when it decides whether to call the flow, so write it for that reader.

```md title="welcome/flows/greet/FLOW.md"
---
description: welcome a new teammate and give the message a subject line
---
```

Each stage file gives one agent its instructions. `$INPUT` is where the stage finds what it was given. `$OUTPUT` is where it must write its answer. The first stage gets the request.

`## Checklist` is a check. The agent must mark every item done, or skip an item and say why.

```md title="welcome/flows/greet/01-welcome.md"
---
---

Read the joining note in $INPUT. Write a welcome message to $OUTPUT: three sentences, plain language, no opinions of your own.

## Checklist

- The welcome is three sentences
- Every fact in the welcome appears in the joining note
```

The second stage receives the first stage's output. It has no checklist, so it seals whatever the agent writes.

```md title="welcome/flows/greet/02-subject.md"
---
---

Read the welcome message in $INPUT. Write to $OUTPUT the same message with one new first line: a subject of at most eight words, then a blank line, then the message unchanged.
```

The empty frontmatter fence is not optional. A file that opens straight into prose is refused.

Stages run in the order of their leading numbers, compared as numbers. `9-` runs before `10-`.

## Check it

```sh
bot assembly check ./welcome/greet
```

```text
flows/greet/FLOW.md  flow-definition  type=FLOW  flow=flows/greet  max_subflow_calls=10
01-welcome  STAGE  flow=flows/greet  input=request.txt  output=welcome.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=3600,retries=2,local-context=ignore
02-subject  STAGE  flow=flows/greet  input=welcome.txt  output=subject.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=3600,retries=2,local-context=ignore
```

Exit is `0`. Read the second stage's `input=welcome.txt`. That is the first stage's output arriving as the second stage's input, and nothing in your files said so. The runtime worked it out from the order.

Run this command after every edit. It calls no provider and spends nothing.

## Run it

```sh
echo "Priya Raman starts Monday on the support desk. She is joining from the Bristol office and sits with the billing team." | bot run start ./welcome/greet
```

The subject line and the message land on standard output. The record lands in your home.

```sh
bot run list
bot run events RUN
```

## What just happened

You wrote a procedure as files. The markdown bodies are the instructions. The checklist judges one stage's answer. The folder order is the control flow.

The run kept the request, a copy of the assembly, each stage's output and transcript, every check, and the token totals.

Next: [stages and checks](/build/stages-and-checks/) adds schemas, gates, and hooks. [Control flow](/build/control-flow/) turns folders into branches and loops.
