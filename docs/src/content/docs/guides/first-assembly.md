---
title: "Your First Assembly"
description: "Clone, paste a four-file assembly, check it, run it, and read the record."
sidebar:
  order: 0
---

An assembly is a folder of markdown files that tells agents what to do, stage by stage. This guide builds a small reading list, checks it without contacting a provider, and then shows the run and inspection commands.

## Install

Linux with Node 22.22 or newer is the supported platform, because the checks prove it there. macOS may work and is not verified. Windows is not supported. You also need `git` and `~/.local/bin` on your `PATH`. This is the one install recipe, and every other page on the site points back at it:

```sh
git clone https://github.com/botassembly/botassembly.git
cd botassembly
npm ci --prefix bot
make install
```

`make install` writes a `bot` launcher to `~/.local/bin/bot` that runs the CLI out of the checkout. Pass `BINDIR=` to write it somewhere else, as in `make install BINDIR="$HOME/bin"`. `git pull` in the checkout is the upgrade path, followed by `npm ci --prefix bot` and `make install`. `make -C botassembly uninstall` removes the launcher. The install refuses to replace a `bot` that this project did not write.

## Make the home

`bot` keeps installed assemblies and run records in one directory, the home. The default is `~/.local/share/bot`. `make install` does not create it; it writes the launcher and nothing else. Create the home yourself and make it mode `0700`, here or wherever `BOT_HOME` or `--home` points:

```sh
export BOT_HOME="$HOME/.local/share/bot"
mkdir -p "$BOT_HOME"
chmod 700 "$BOT_HOME"
```

The mode is not optional. Read-only commands may accept a group-readable or world-readable home, but the first `bot run start` stops before it calls anything:

```text
fault: Installation identity validation failed: The Bot home is not a private owner-only directory.
```

That is exit `5`. `chmod 700` on the home repairs it.

## Choose an intelligence

A run needs one intelligence named `default` in the home's `config.yaml`. Without it every `bot run start` is refused as `intelligence-unresolved`. `bot model list` reports a provider and model together from Pi's built-in and locally configured catalog and contacts no provider. Pi is the open-source agent SDK the runtime builds on; `bot` bundles it and never calls a provider except through it. Ask for one provider's catalog, then write the file:

```sh
bot model list openai-codex
${EDITOR:-vi} "$BOT_HOME/config.yaml"
```

Write this shape, replacing the provider and model with the pair you copied:

```yaml
intelligences:
  default:
    provider: openai-codex
    model: gpt-5.6-luna
    reasoning: low
```

`model` and `reasoning` are required in every row. `provider` is optional. The runtime accepts exactly six reasoning values: `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Any other value is refused as `value-invalid` against `config.yaml` with the line `Give reasoning a valid value in intelligence default.`

`bot home show` prints the home it found. Review `config.yaml` once before you go further.

For a real run, authenticate with `bot auth login openai-codex`, or provide the provider's documented key in the environment. `bot auth list` shows credential status without printing secrets.

## The assembly

Make a folder called `reading-list` and create these four files. The layout is one manifest, one flow, and one markdown file per stage:

```text
reading-list/
  ASSEMBLY.md
  flows/
    digest/
      FLOW.md
      01-summarize.md
      02-title.md
```

`ASSEMBLY.md` is the manifest. Its frontmatter names the intelligence every stage uses, and its body states the assembly's purpose.

```md title="reading-list/ASSEMBLY.md"
---
intelligence: default
---

Turns an article into a short summary with a title, for a shared reading list.
```

`FLOW.md` marks the `digest` folder as a flow. Its required `description` line says what the flow is for.

```md title="reading-list/flows/digest/FLOW.md"
---
description: summarize an article and give it a title
---
```

Each stage file gives one agent its instructions. The first stage finds its input in `$INPUT` and writes its answer to `$OUTPUT`. The `## Checklist` is a gate. The agent must mark every item done, or skip it with a reason.

```md title="reading-list/flows/digest/01-summarize.md"
---
---

Read the article in $INPUT and write a summary of it to $OUTPUT: three to five sentences, plain language, no opinions of your own.

## Checklist

- The summary is three to five sentences
- Every claim in the summary appears in the article
```

The second stage receives the first stage's output. A stage with no checklist seals whatever the agent writes.

```md title="reading-list/flows/digest/02-title.md"
---
---

Read the summary in $INPUT. Write to $OUTPUT the same summary with one new first line: a title of at most eight words, then a blank line, then the summary unchanged.
```

## Check it before you run it

Ask what would happen without calling a model. The folder and flow form the target; a target beginning with `./` is a path:

```sh
bot assembly check ./reading-list/digest
```

It prints one line per stage, in execution order, with every option resolved and the rung it came from after the `@`:

```text
01-summarize  STAGE  input=request.txt  output=summarize.txt  options=intelligence=default@assembly,provider=openai-codex@assembly,model=gpt-5.6-luna@assembly,reasoning=low@assembly,timeout=3600@default,retries=2@default,local-context=ignore@default
02-title  STAGE  input=summarize.txt  output=title.txt  options=intelligence=default@assembly,provider=openai-codex@assembly,model=gpt-5.6-luna@assembly,reasoning=low@assembly,timeout=3600@default,retries=2@default,local-context=ignore@default
```

Exit is `0`. A malformed assembly exits `2` and prints a code, the file at fault, and the repair. Delete the `description` line from `FLOW.md` and you get this:

```text
key-missing  flows/digest/FLOW.md
  Add the required key description.
```

`bot assembly check --json` prints one bounded `bot.assembly.check` JSON document with the resolved stages in its data. Run `bot assembly check` after every edit. It contacts no provider and spends nothing.

Two things it does not tell you. It says nothing about whether your credentials work or a provider is reachable. And it walks only the entry flow's root sequence: the stages inside a subflow, and the stages a `DESCEND` flow reaches by calling itself, are not printed and their options are not resolved. A fan-out row shows an empty `options=` field because the options resolve inside a flow this command does not walk.

## Run it

After authentication, save an article as `article.txt` and run the assembly:

```sh
cat article.txt | bot run start ./reading-list/digest
```

The titled summary lands on standard output. Exit `0` means the flow finished and its checks passed. Nothing is written to standard error on a successful run, so a long flow is a quiet terminal until it answers. Standard error carries the terminal diagnostics only: `blocked:`, `exhausted:`, `fault:`, and refusal lines.

## What it costs

A run is billed by the provider you configured, per token. The runtime adds nothing and caps nothing. Your total depends on the model, request length, number of stages, and how many times a check sends a stage back. `bot model list` prints the input and output prices reported for models your machine can call. Every event record carries the token split per stage and for the run, so you can price later runs from your own observed use.

`config.yaml` names a provider and a model, and which names it accepts is what
your machine can reach rather than a fixed list. `bot model list` after install is
that machine's own answer, and `bot auth list` names every provider a credential can
be added for. The rules for the file are [the home](/specification/structure/#the-home).

## Read the record

Every run leaves a self-contained record. List runs first, then read one by any unique prefix of its name:

```sh
bot run list
bot run events RUN
```

`bot run list` is a table of one row per run with its assembly, flow, times, state, exit, cause, and tokens. `bot run events RUN` is the full record reading. It prints the run event by event: prompt construction, every provider turn with its token split and stop reason, each checklist mark, `check output passed` and `check checklist passed`, the alternative a `CHOOSE` picked and the reason it gave, every gate by path with its verdict, every hook with its exit, and the token totals per stage and for the run.

Two bounded readings sit beside it:

```sh
bot run show RUN -j
bot run output RUN --raw
```

`bot run show RUN -j` is the bounded structured summary. It carries identity, stage, repeat, attempt, state, exit, cause, and a scratch path per stage, and nothing more. It does not carry the choice, the gates, the hooks, or the cost. Read `bot run events` for those. `bot run output RUN --raw` copies the accepted answer byte for byte.

The [inspection reference](/reference/inspection/) describes requests, checks, sessions, logs, and the other readings.

## What just happened

You wrote an assembly. Its markdown files define the procedure, and its checklist judges one stage's output. The run records the request, a copy of the assembly, each stage's output and transcript, the checks, and the token totals. [Structure](/specification/structure/) fixes the assembly shape, [gating](/specification/gating/) fixes the checklist contract, and [the record](/specification/record/) defines the retained evidence.

## Where to go next

`examples/` in the repository holds four runnable assemblies in a ladder. `examples/hello` is the smallest one the format allows. `examples/triage` puts a skill, a checklist, a schema, a chooser, two gates, and the three hooks in one small flow. CI checks every one of them. [The worked example](/specification/example/) walks one real assembly end to end, every part of the format in place. [Authoring assemblies](/guides/authoring-assemblies/) covers stage folders with gates and hooks, schemas, containers, access limits, skills, and the development loop.
