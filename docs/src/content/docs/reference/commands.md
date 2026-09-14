---
title: "Command reference"
description: "Every bot command in one table, with the arguments it takes, what it answers, and how it exits."
---

`bot` has twenty-six commands. Each one appears once below.

`bot <command> --help` describes one command. `bot capabilities` reports the structured command surface this build implements.

## The commands

| Command | Answers or does |
| --- | --- |
| `bot assembly check <target>` | whether an assembly is well formed, and what would run |
| `bot assembly install <source>[#subdir]` | copies an assembly into one home |
| `bot assembly link <path>` | links a working tree into one home |
| `bot assembly list` | which assemblies the home holds |
| `bot assembly remove <name>` | removes one assembly from the home |
| `bot assembly update [<name>]` | fetches installed assemblies again |
| `bot auth import <source>` | copies one retired credential map into empty Pi authentication |
| `bot auth list` | which provider credentials are stored |
| `bot auth login <provider>` | signs in through the provider's own flow |
| `bot auth logout <provider>` | removes one provider's stored credential |
| `bot capabilities` | the structured command surface this build implements |
| `bot home busy <directory>` | whether a live run holds that exact directory |
| `bot home show` | which home was selected |
| `bot intelligence list` | which intelligences the home's configuration names |
| `bot model list [provider]` | which models this machine can call |
| `bot run check <run> <name>` | one named recorded check |
| `bot run checklist <run>` | the checklist marks one run retained |
| `bot run events <run>` | the complete root or authorized child event sequence |
| `bot run list` | which runs exist |
| `bot run output <run>` | what the run answered |
| `bot run record <run>` | the retained root record |
| `bot run request <run>` | the request the run retained |
| `bot run resume <run>` | starts a new run from an old one |
| `bot run session <run> <stage>` | one stage's transcript |
| `bot run show <run>` | one bounded structured reading of a run |
| `bot run start <target>` | starts a run |

## Naming the assembly and the flow

A target names an assembly and a flow as one argument.

```sh
bot run start ./triage/triage @data/request-urgent.txt
```

A target beginning with `/`, `./`, or `../` is a path on disk. Anything else is a name the home holds. The last segment is the flow either way.

Given an assembly and no flow, `bot assembly check` validates the whole assembly and reports the assembly agent first, then every reachable flow definition and node.

## Giving a request

There are three ways, and `bot run start` takes exactly one of them.

| Form | Example |
| --- | --- |
| a string | `bot run start triage/triage "our checkout is down"` |
| an `@` task file | `bot run start triage/triage @data/request-urgent.txt` |
| piped input | `cat request.txt \| bot run start triage/triage` |

Every request source has an inclusive 4 MiB limit. `bot` checks an argument and a complete task file before home access, checks the parsed task body separately, and stops reading standard input as soon as byte 4,194,305 arrives.

The grammar is [the three ways to give a request](/specification/running/#the-three-ways-to-give-a-request).

## Shared options

| Option | Applies to | Effect |
| --- | --- | --- |
| `--home DIR` | running, reading, and managing commands | names one home for this command |
| `--in DIR` | `run start`, `run resume`, `assembly check` | the root directory where the run starts work |
| `--intelligence NAME` | `run start`, `assembly check` | overrides the assembly's model choice for one run |
| `--timeout SECONDS` | `run start`, `assembly check` | overrides the stage timeout |
| `--retries N` | `run start`, `assembly check` | overrides the send-back budget |
| `--local-context MODE` | `run start`, `assembly check` | `ignore`, `announce`, or `use` |
| `--id-file PATH` | `run start`, `run resume` | writes the new run's name to a file |
| `--correlation TEXT` | `run start`, `run resume` | bounded opaque metadata carried into the record |
| `--limit N` | `assembly check`, `run list`, `run session`, `auth list`, `model list` | how many rows or messages one page returns |
| `--after CURSOR` | `assembly check`, `run list`, `run session` | the next page, from a cursor a previous page printed |
| `--offset N` | `auth list`, `model list` | the zero-based row this page starts at |
| `--json` or `-j` | most commands | one structured document instead of human output |

Every listing pages, and none of them truncates silently.

| Command | Page size | Maximum |
| --- | --- | --- |
| `bot assembly check` | 20 rows | 200 |
| `bot run list` | 20 rows | 200 |
| `bot run session` | 100 messages | 500 |
| `bot auth list` | 50 rows | 200 |
| `bot model list` | 50 rows | 200 |

When `bot assembly check` has more to show, it writes `More assembly stages remain. Continue with --after <cursor>.` to standard error. The rows go to standard output, so the notice can appear before them on a terminal and is absent from a redirected file. Its JSON `page.next` carries the same cursor, and `page.complete` is `false`. `--raw` on `bot run session` returns the exact retained bytes and does not combine with pagination.

`bot auth list`, `bot model list`, and `bot capabilities` refuse `--home`. Credentials and the models they reach belong to the machine, and capabilities describe the installed program.

An assembly may declare its own long options, which arrive as named input slots. Those are [declared slots](/specification/running/#declared-slots).

`--id-file` writes the new run's name where a caller can read it. The rules are [Run id file](/specification/running/#run-id-file).

Which file or flag each option resolves from is [options and where they resolve](/specification/running/#options-and-where-they-resolve).

## Resuming a run

`bot run resume RUN` starts a new run from an old one. It never resumes the donor process and it never restores the donor's environment. It carries the stages that already succeeded and runs everything after them fresh.

The command derives the assembly, optional flow, and retained request from the donor run. It accepts `--home`, `--in`, declared slot paths, `--id-file`, bounded opaque `--correlation` metadata, and `--json` or `-j`.

A donor request may contain at most 4 MiB. `bot` refuses a larger historical donor before creating any new run artifact. Raw request inspection stays available without that limit.

Which donor runs are accepted, and what a carried prefix is, is [resuming a run](/specification/running/#resuming-a-run).

## Exit codes

| Exit | Meaning |
| --- | --- |
| `0` | the command succeeded, or the run finished and passed its checks |
| `1` | the run ran and did not pass, or a reading found nothing |
| `2` | the request or the assembly was impossible |
| `3` | a continuation conflicts with the state it continues |
| `4` | an unexpected filesystem or synchronous output failure |
| `5` | an integrity, installation, or confinement fault |
| `126` | reserved: found but not executable |
| `127` | reserved: not found |
| `128+n` | a signal ended the run; `n` is the signal's number |

A malformed or oversized cursor is a bad argument and exits `2`. Exit `3` is for a cursor that parses and then no longer matches what it continues, such as a home whose membership changed under it.

[When it refuses or fails](/operate/when-it-refuses/) works through each of these.

## Output conventions

Line-oriented commands write to standard output, one record per line, in a stable field order, so `grep`, `cut`, `awk`, and `jq` work on them without a parser per command. Diagnostics go to standard error.

`bot run output` and `bot run request` stream retained files unchanged.
