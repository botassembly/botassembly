---
title: "Reading a record"
description: "The readings a finished run supports, and which question each one answers."
---

A finished run answers questions about itself through a handful of reading commands. Each one answers a different question.

A record is the ordered list of everything a run did. It is a `record.jsonl` file inside the run's own directory, and it is written as the run goes. A session is one stage's transcript with its agent.

## Which reading answers what

| You want | Command |
| --- | --- |
| which runs exist | `bot run list` |
| the answer the run produced | `bot run output RUN --raw` |
| everything that happened, in order | `bot run events RUN` |
| a bounded summary a script can parse | `bot run show RUN -j` |
| what one stage's agent saw | `bot run session RUN STAGE` |
| the checklist marks and their evidence | `bot run checklist RUN` |
| the request the run was given | `bot run request RUN` |
| what one named check printed | `bot run check RUN NAME` |
| the retained record bytes | `bot run record RUN --raw` |

`RUN` is any unique prefix of a run's name. Every command here accepts `--home DIR`, changes nothing, and contacts no provider.

## `bot run list`

One row per run with its assembly, flow, exact times, state, exit, cause, and verified tokens. A run still going shows `running`. One that stopped without finishing shows `crashed`.

The token column sums the root run and its uniquely authorized descendants. `tokensStatus` says `complete` or `partial`. A partial value is the verified prefix, and it can be lower than what the provider actually charged.

## `bot run events`

`bot run events RUN` prints the run event by event: prompt construction, every provider turn with its token split and stop reason, each checklist mark, the checks that passed and the ones that did not, the alternative a branch picked and the reason it gave, every gate by path with its verdict, every hook with its exit, and the token totals.

The record is append-only, so a run in progress reads the same way a finished one does. The lines that exist are the lines that happened, and the last one is where the run is now. `bot run events` on a live run is a status display.

## `bot run show`

`bot run show RUN -j` is one structured document for a script rather than a reader. `data` carries the run's own facts, one row per stage, and one row per subflow call. A stage row holds identity, stage, repeat, attempt, state, exit, cause, and a scratch path. A subflow row holds the calling stage, the attempt, the call, the subflow, the item, whether it started, the child, the exit, and the cause. Beside `data` sit a `summary` of what was counted and omitted and a bounded `warnings` array.

It does not carry the choice, the gates, the hooks, or the cost. Read `bot run events` for those.

## `bot run output`

`bot run output RUN --raw` writes the sealed bytes and nothing else, with no trailing newline and no formatting, so `bot run output RUN --raw | jq .` gives `jq` the file the run produced.

Only a run that finished at `0` has a whole-run answer. One still going says `This run has not finished.` One that ended another way says so with its code and cause.

Name a stage to get what that stage sealed.

```sh
bot run output RUN 01-classify --raw
```

That is how a run that stopped early still tells you how far it got.

## What the run directory holds

A run directory is readable on its own. It holds the record, the request, the copy of the assembly the run took when it started, the prompt each stage was given, the inputs, the outputs, the transcripts, and what every check printed.

Copy it, archive it, read it a year later. It is JSONL and markdown. Answering what was asked, what ran, what judged it, and what it cost needs no runtime at all.

It is not a re-runnable environment. It holds no runtime, no provider, no tools from your `PATH`, and nothing of the working directory the run was pointed at.

Remove retained run directories through normal filesystem administration, after confirming they are no longer live.

## What these commands will not invent

Finding nothing is an answer, and it says which nothing on standard error: no home at that path, a home holding no runs, a name matching no run, a run with no record, a stage the run does not have.

A command that names one run and cannot read that run's record has found nothing. It prints no part of the reading it could not finish. A reading that stops early looks exactly like a run that stopped early, so a partial reading would be `bot` inventing an ending.

Bot is not an operating-system sandbox. Inspection reports retained runtime evidence. It does not provide containment. `bot run events` reports retained direct tool calls. Bot does not watch the filesystem or claim a complete list of changes.

## Limits

Every reading is bounded, so a large record cannot exhaust the reader.

| Reading | Bound |
| --- | --- |
| `bot run show` | at most 1,000 combined rows, each complete form under 1 MiB, cells clipped at 480 bytes |
| `bot run checklist` | each cell is limited to 480 bytes and the semantic record stays under the 1 MiB reader limit |
| `bot run events` | source at most 1,048,576 bytes and 10,000 segments, result under 2,097,152 bytes |
| `bot run session` | 100 messages per page, 1 through 500 permitted, rendered output under 1,048,576 bytes |
| `bot run list` | typed filters and a continuation cursor |

`--raw` on `bot run session` returns the exact retained bytes and does not combine with pagination.

`bot assembly check` exits `0` when the assembly is well formed and `2` when it is not, which is the code a run of that assembly would have produced.
