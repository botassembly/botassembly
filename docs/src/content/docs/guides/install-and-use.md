---
title: "Operating runs"
description: "Install the bot runtime, run an assembly someone else built, and read the record a run leaves behind."
sidebar:
  order: 1
---

An assembly is a folder. What the agents in it are told is markdown
you can open in any editor, and what judges their work sits in the
same folders, so the whole thing can be read, reviewed in a diff, and
kept in git like anything else your team versions. There is nothing
to stand up in order to use one — no service, no database, no
workflow engine holding the real definition somewhere a reader cannot
get at it; installing is a clone and a launcher on your PATH. What
ran is a folder too: every run leaves a directory holding the
request, the copy of the assembly it ran, what each stage was told,
what it produced, and what judged it, so you can open it, move it, or
read it a year later. The bet underneath all of this is that the
files outlive the program. If this runtime went away tomorrow, the
folders would still say exactly what the work was.

This guide is for someone who wants to *run* assemblies a teammate
built, without learning how they are made. Authoring is the other
guide: [Authoring assemblies](/guides/authoring-assemblies/).

## One-time setup

Install the runtime once, using the recipe in [Your first assembly](/guides/first-assembly/): clone, `npm ci --prefix bot`, `make install`. That is the only install recipe. It writes a launcher to `~/.local/bin/bot` that runs the CLI out of the checkout, so `git pull` is the upgrade path and moving the checkout means running `make install` again. `make -C botassembly uninstall` removes it.

That page also covers the two things a run cannot start without: a home that is mode `0700`, and an intelligence named `default` in the home's `config.yaml`. Do both before your first run.

## Credentials

Credentials are separate from all of that. They come from your environment, the way the model providers' own tools take them: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and the rest of the per-provider variables. Nothing goes in an assembly and nothing goes in `config.yaml`. Ask whoever manages your team's model access which ones you need.

If you sign in to your providers instead of holding keys, sign in through bot:

```sh
bot auth login anthropic
```

That runs the provider's own sign-in. `bot` prints the URL and you open it, so this works over ssh too. Pi keeps the result in `auth.json` under its resolved agent directory; the default is `~/.pi/agent/auth.json`. There is one such file per machine, so you sign in once and everything you run afterwards uses it. `bot auth list` lists every provider and where its credential comes from, and `bot auth logout <provider>` takes one back out. Nothing there ever prints a credential.

Older Bot credential files remain preserved but inactive. Commands that need authentication warn once when that retired file exists. Use `bot auth import SOURCE` to copy one compatible retired file into an empty Pi store. A provider key in the environment keeps working as it did, and a stored Pi login wins over the environment for its own provider. `bot auth --help` describes the login, logout, import, and list commands.

Everything bot keeps lives in the home, which it manages for you. It is where installed assemblies and run records live: `${XDG_DATA_HOME:-~/.local/share}/bot` unless `BOT_HOME` says otherwise, so a machine has one home by default. You never need to look inside the home; the CLI answers every question about it.

You can point a command at a different home. `--home DIR` overrides both of those for one command. Running, reading, and managing commands accept it. `bot auth list`, `bot model list`, and `bot capabilities` refuse it. Credentials and the models they reach belong to the machine. Capabilities describe the installed `bot` program. `--home DIR` follows the complete command name, as in `bot run list --home ./bot-home`.

If the home is missing, the command names the missing folder. It does not pretend the home is empty. A command that puts something there, a run or an install, creates it. Homes and run directories bot creates are owner-only. One that already exists keeps whatever permissions it has, and `bot run` faults with exit `5` when that is not mode `0700`. The full contract is [the home](/specification/structure/#the-home) in the specification.

## Getting an assembly

Install from a repository (a `#subdir` names one assembly inside a repo
that holds several). The four shipped examples live in one repository, so
each is named that way:

```sh
bot assembly install https://github.com/botassembly/botassembly#examples/triage
```

Or from a folder on disk:

```sh
bot assembly install ./triage
```

When the assembly is the current directory, `bot assembly install .` and `bot assembly install ./` use that directory's name. `link` exposes later source edits to the next run. `install` makes a fixed copy. `update` refreshes that copy. Repeating `install` for the same name refuses and keeps the first copy.

Install takes a copy, so what you point it at has to be an assembly.
Point it at something that is not one and it refuses in two lines and
leaves the home exactly as it found it — nothing half-installed to
clean up:

```text
assembly-unknown  ./data
  Name an assembly; what is there is not one.
```

See what you have:

```sh
bot assembly list
```

```text
triage  installed  from https://github.com/botassembly/botassembly#examples/triage  updated 2026-09-11T17:55:02.000Z
```

When the team ships a new version:

```sh
bot assembly update triage
```

To take one out:

```sh
bot assembly remove triage
```

Never symlink or copy folders into the home by hand — `install`,
`link`, and `remove` are the verbs, and `list` always tells you the
truth about what is there and where it came from. A linked folder
that has moved, been deleted, or stopped being an assembly is listed
with `BROKEN` on the end of its line, and `link` puts that same word
on the line it prints when you make the link, rather than reporting a
clean link over a target that is not one.

## Running

An assembly holds one or more flows. Name both, give the request,
and read the answer on stdout. `triage` holds one flow, also called
`triage`, which sorts an inbound customer request and writes the routing
memo:

```sh
bot run start triage/triage "our checkout has been down since Friday"
```

Three ways to hand over the request:

```sh
bot run start triage/triage "one-line request"             # an argument
bot run start triage/triage @data/request-urgent.txt        # a task file
cat data/request-routine.txt | bot run start triage/triage  # piped stdin
```

`data/request-urgent.txt` and `data/request-routine.txt` ship beside the
examples. The first names a deadline and takes the urgent branch; the
second is a billing question and takes the routine one.

`--in DIR` sets the root directory where the run starts work. It defaults to your current directory. Use a worktree or another intended directory when you do not want the current directory used. Absolute paths outside the working directory remain reachable when the operating system permits access. `bot` is not a sandbox; read [Trust boundary](/reference/trust-boundary/) before running an assembly you did not write. A stage may select an existing relative `workdir` beneath that root. `bot` neither creates nor cleans this caller-owned directory. Options like `--intelligence`, `--timeout`, `--retries`, and `--local-context` override the assembly's own defaults for one run. `--local-context` decides how the agent receives the working directory's own `AGENTS.md` and `skills/`: `ignore` reads none of it and is the default, `announce` names what is there and leaves the reading to the agent, and `use` puts it in front of the agent.

stdout is exactly the answer, so piping into another program is unchanged. A successful run writes nothing to stderr, not even progress, so a long flow is a quiet terminal until it answers. stderr carries the terminal diagnostics only: `blocked:`, `exhausted:`, `fault:`, and refusal lines.

Nothing bounds a run as a whole: no deadline, no cost budget, no disk
quota. What is bounded, and what supervising an expensive run means, is
[Limits and cost](/reference/limits/).

The exit code is honest:

| Exit code | When | What to do |
| --------- | ---- | ---------- |
| `0` | The flow finished and the answer on stdout passed its checks. | Use the answer; `bot run output RUN --raw` gives it back any time after. |
| `1` | It ran and the work did not pass. | Read the record: `bot run list` prints the cause in one word beside the code. |
| `2` | The run was impossible. | Read stderr; if a record exists, it says where. |
| `128+n` | Killed from outside: a run stopped by a signal exits `128` plus the signal's number, the way any program does. | Read the record like any other ending. |

Five endings arrive at `1`:

- The agent said it could not do the job.
- Its retries were spent with a check still saying no, or with an
  answer it never gave — a choice not made, a loop's question left
  open.
- The assembly's own machinery said no: a hook that ran cleanly and
  exited non-zero, or a loop that used up its repeats with the agent
  still asking to continue.
- A gate reported an external blocker — exit `75`, with output
  saying what stood in the way.
- The agent's clock ran out.

`2` usually means nothing ran and there is no record at all: the
assembly or the invocation was wrong, and the reason is on stderr. A
fault of the same kind can also turn up late — a provider that is not
configured, a gate or hook that cannot be executed or that runs out
of its own clock, a disk that fills — and then the code is still `2`,
but a record does exist, and it says where.

Whatever happened, the record names the ending in one word. That word is what `bot run list` prints beside the code.

Before running something new, you can ask what would happen:

```sh
bot assembly check triage/triage
```

`bot assembly check` reads the assembly, refuses it if it is malformed, and prints the stages in the order they would run with every option resolved. It exits `0` when the assembly is well formed and `2` when it is not. It calls no model, so it says nothing about whether your credentials work or a provider is reachable. It also walks only the entry flow's root sequence, so stages inside a subflow and stages a `DESCEND` flow reaches by calling itself are not printed and their options are not resolved.

## Reading what happened

Every run leaves a record. The CLI reads it back:

```sh
bot run list                              # one row per run, newest last, tokens in the last column
bot run events 2026-09-11T17-55           # the record, event by event, closing with what it cost
bot run show 2026-09-11T17-55 -j          # the bounded structured summary
bot run output 2026-09-11T17-55 --raw     # what the run answered, byte for byte
bot run session 2026-09-11T17-55 01-classify  # one stage's transcript
bot run checklist 2026-09-11T17-55       # checklist marks and their evidence
bot home show                            # the selected home
```

`bot run events` is the full record reading. It prints the run event by event: prompt construction, every provider turn with its token split and stop reason, each checklist mark, the checks that passed and the ones that did not, the alternative a `CHOOSE` picked and the reason it gave, every gate by path with its verdict, every hook with its exit, and the token totals per stage and for the run.

`bot run show RUN -j` is the bounded structured summary, for a script rather than a reader. It carries identity, stage, repeat, attempt, state, exit, cause, and a scratch path per stage, and nothing more. It does not carry the choice, the gates, the hooks, or the cost. Read `bot run events` for those.

`bot run output RUN --raw` is how you get an answer back after the fact. It writes the sealed bytes and nothing else, no trailing newline and no formatting, so `bot run output <run> --raw | jq .` gives `jq` the file the run produced. Only a run that finished at `0` has an answer. One that is still going says `This run has not finished.`, and one that ended any other way says so with its code and cause. Either way you can name a stage, `bot run output <run> 01-classify --raw`, and get what that stage sealed, which is how a run that stopped early still tells you how far it got.

A run directory is readable on its own: the record, the request, the copy of the assembly the run took when it started, the prompt each stage was given, the inputs, the outputs, the transcripts, and what every check printed. Copy it, archive it, read it a year later. It is JSONL and markdown, and answering "what was asked, what ran, what judged it, what it cost" needs no runtime at all. What it is not is a re-runnable environment. It holds no runtime, no provider, no tools from your PATH, and nothing of the working directory the run was pointed at.

In `bot run list`, a run that is still going shows `running`, and one that stopped without finishing shows `crashed`. Remove retained run directories through normal filesystem administration after you have confirmed that they are no longer live.

## When something refuses

A refusal is two lines: a code and the path at fault, then a
sentence saying what to fix. It means nothing ran and no record was
written — fix the named thing and try again. `--json` gives the same
refusals as JSON lines if a script is reading them.

A run that started and then ended badly is different: it writes one
stderr line naming its cause and the reason — `refused: The request
cannot be reviewed.`, `fault: Provider is not configured:
openai-codex` — and it is in `bot run list` with that cause beside its
exit code. `bot run events` on it names the file or the layer that broke.
