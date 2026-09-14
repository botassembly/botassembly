---
title: "Run the shipped example"
description: "Run the triage assembly that ships with the repository, read its answer, and find the record it left."
---

Four runnable assemblies ship in the repository. Running one end to end takes two commands, and it leaves a record you can read afterwards.

A run calls a model provider and costs money. Set up a credential first: [Providers, models, and credentials](/operate/providers-and-credentials/).

## Name the assembly and the flow

An assembly holds one or more flows. A flow is one procedure from start to finish. A run names both.

The four assemblies in `examples/` use these names.

| Assembly | Flow | What it does |
| --- | --- | --- |
| `hello` | `greet` | Turns a joining note into a three-sentence welcome for a new teammate. |
| `triage` | `triage` | Sorts an inbound customer request into an urgent or a routine queue and writes the routing memo. |
| `brief` | `brief` | Turns a week of short team notes into one digest with a title and a tag list. |
| `outline` | `plan` | Plans a report from a rough topic, section by section. |

Only `triage` repeats its own name. Typing the assembly name twice for the other three names a flow that does not exist, and `bot` refuses the folder.

A target that begins with `/`, `./`, or `../` is a path on disk. Anything else is a name the home already holds.

## Check before you run

Run this from `examples/`.

```sh
bot assembly check ./triage/triage
```

```text
flows/triage/FLOW.md  flow-definition  type=FLOW  flow=flows/triage  max_subflow_calls=10
01-classify  STAGE  flow=flows/triage  input=request.txt  output=classify.json  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=300,retries=1,local-context=ignore
02-route  CHOOSE  flow=flows/triage  input=-  output=-  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=120,retries=1,local-context=ignore
02-route/routine/01-routine  STAGE  flow=flows/triage  input=classify.json  output=routine.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=120,retries=2,local-context=ignore
02-route/urgent/01-urgent  STAGE  flow=flows/triage  input=classify.json  output=urgent.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=120,retries=2,local-context=ignore
03-verify  STAGE  flow=flows/triage  input=routine.txt,urgent.txt  output=verify.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=3600,retries=1,local-context=ignore
```

Exit is `0`. The first line is the flow definition. Each line after it is one node the run could reach, in the order you wrote them. `CHOOSE` marks a branch point, and both of its branches are listed because either could run.

The command returns 20 rows at a time. A larger assembly does not fall off the end silently. Bot then writes `More assembly stages remain. Continue with --after <cursor>.` to standard error, so it can arrive before the rows on your screen and stays out of a redirected file. Passing that cursor to `--after` returns the next page. `--limit N` changes the page size, up to 200.

## Run it

There are three ways to hand over the request.

```sh
bot run start ./triage/triage "our checkout has been down since Friday"
bot run start ./triage/triage @data/request-urgent.txt
cat data/request-routine.txt | bot run start ./triage/triage
```

`data/request-urgent.txt` and `data/request-routine.txt` ship beside the examples. The first names a deadline and takes the urgent branch. The second is a billing question and takes the routine one.

The routing memo lands on standard output. Piping it into another program works unchanged.

`--in DIR` sets the directory where the run starts work. It defaults to your current directory. Use a worktree or another intended directory when you do not want the current directory used.

## What the exit code means

| Exit | What happened | What to do |
| --- | --- | --- |
| `0` | The flow finished and the answer passed its checks. | Use the answer. `bot run output RUN --raw` gives it back any time after. |
| `1` | It ran and the work did not pass. | Read the record. `bot run list` prints the cause in one word beside the code. |
| `2` | The run was impossible. | Read standard error. If a record exists, it says where. |
| `128+n` | Something outside killed it. A run stopped by a signal exits `128` plus the signal's number. | Read the record like any other ending. |

[When it refuses or fails](/operate/when-it-refuses/) covers each of these in turn.

## Find the record

Every run leaves a self-contained directory holding the request, a copy of the assembly it ran, what each stage was told, what each stage produced, and what judged it.

```sh
bot run list
bot run events RUN
bot run output RUN --raw
```

`bot run list` prints one row per run. `RUN` is any unique prefix of a run's name.

[Reading a record](/operate/reading-a-record/) says which reading answers which question.

Next: [write your own](/start/write-your-own/).
