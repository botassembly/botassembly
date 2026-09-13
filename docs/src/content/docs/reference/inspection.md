---
title: "Inspecting a run"
description: "The bot commands for reading a record and a session after a run."
sidebar:
  order: 3
---

*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*

Bot is not an operating-system sandbox. Inspection reports retained runtime
evidence; it does not provide containment.
`bot run events` reports retained direct tool calls. Bot does not watch the filesystem or claim a complete list of changes.

A run leaves two things behind: a record, which is specified, and one session
per stage, which is the runtime's own ([the record](/specification/record/),
[the session](/specification/record/)). Inspection is the interface for reading both.
Everything here reads retained state. Assembly management and authentication have their own reference pages.

It is a command-line interface, and it obeys the conventions of one. Its
line-oriented commands write to stdout, one record per line, in a stable field
order, so that `grep`, `cut`, `awk`, and `jq` all work on them without a parser
being written for each. `bot run output` and `bot run request` stream retained
files unchanged. Diagnostics go to stderr. Every command here works in one
home, and `--home DIR` names it ([the home](/specification/structure/#the-home)).

Exit is `0` when something was found and `1` when nothing was. `bot assembly check` is
the exception: `0` when the assembly is well formed, `2` when it is not, which
is the code a run of that assembly would have produced
([refusals](/specification/refusals/)).

Finding nothing is an answer, and it says which nothing on stderr: no home at
that path, a home holding no runs, a name matching no run, a run with no
record, a stage or a repeat the run does not have, no tool call to report, no
tool call matching what was asked for. Exit is still `1`. Silence and exit `1` are what a crash
looks like, and a person cannot tell them apart.

A command that names one run and cannot read that run's record has found
nothing: it exits `1` and prints no part of the reading it could not finish. A
reading that stops early looks exactly like a run that stopped early, and
[the record](/specification/record/) is where that distinction lives, so a partial reading
would be bot inventing an ending. The listing is the place a fault is reported
beside the runs it did not touch.

## The commands

| Command                     | Answers                                        |
| --------------------------- | ---------------------------------------------- |
| `bot assembly check <assembly>` | whether an assembly is well formed             |
| `bot assembly list`         | which assemblies the home holds                |
| `bot home busy <directory>` | whether a live run holds that exact directory  |
| `bot model list [provider]` | which models this machine can call             |
| `bot auth list`             | which provider credentials are stored          |
| `bot run start <target>`    | start a run                                    |
| `bot run list`              | which runs exist                               |
| `bot run show <run>`        | one bounded root-run, stage, and subflow reading |
| `bot run checklist <run>`   | the checklist marks retained by one root run     |
| `bot run events <run>`      | the complete root or authorized child event sequence |
| `bot run session <run> <stage>` | one bounded rendered page or the exact raw session bytes |
| `bot run output <run>`      | what the run answered                          |
| `bot run request <run>`     | the request the run retained                   |
| `bot run record <run>`      | the retained root record                       |
| `bot run check <run> <name>` | the retained check recordings                 |

### `bot run show`

`bot run show RUN [--json|-j] [--home DIR]` is the supported bounded one-run reading. It reads one held root-record snapshot, derives stage and subflow rows from that snapshot, samples liveness once when needed, and then checks the derived stage-repeat scratch directories. It never opens a child record and never contacts a provider.

Markdown and the newline-terminated `bot.run.show` JSON document retain the same combined record-order prefix of at most 1,000 rows. Both complete forms stay below 1 MiB. Source text above 4,096 bytes becomes unavailable or fails when it is an identity. Markdown makes retained text inert, clips cells at 480 bytes, and keeps physical rows within 4,096 bytes. The first 20 warnings and summary omission counts describe the shared reading.

### `bot run checklist`

`bot run checklist RUN [--stage PATH] [--retry N] [--repeat N] [--json|-j] [--home DIR]` lists the checklist marks retained in one root record. Each selector works alone or with the others and compares exactly. The command preserves record order. It reads no child records or assembly files, changes nothing, and contacts no provider.

Markdown reports Stage, Repeat, Retry, Item, Decision, Evidence, and Reason. It makes retained text inert and limits each cell to 480 bytes. The newline-terminated version-1 `bot.run.checklist` JSON document carries those same seven fields. Missing repeat, historical evidence, and optional reason become `null`. The semantic record stays under the 1 MiB reader limit. Bad records fail without partial output. A valid record with no selected marks exits `1` and writes a diagnostic to stderr.

### `bot run events`

`bot run events RUN [--child REFERENCE] [--json|-j] [--home DIR]` reads the complete semantic event sequence from one root record or one child that the parent record authorizes. Human mode preserves the established full-record reading. JSON returns one newline-terminated `bot.run.events` schema-version-1 document with the root run identity, a nullable child reference, and the parsed events. `bot run record --raw` remains the exact-byte root-record command.

The semantic source stays at most 1,048,576 bytes and 10,000 segments. Each result stays below 2,097,152 UTF-8 bytes. Request failures exit 2 before home access. Missing selections exit 1. Record, child-confinement, child-agreement, and output-limit failures exit 5. Unexpected filesystem and synchronous output failures exit 4. The command changes nothing and contacts no provider.

### `bot run session`

`bot run session RUN STAGE [--repeat N] [--limit N] [--after CURSOR] [--raw] [--home DIR]` reads one retained stage session. Rendered pages preserve format-3 direct entries and format-4 transactions. Pages default to 100 messages and permit 1 through 500. Version-1 and version-2 cursors preserve their continuation meaning. Raw mode returns the exact retained bytes and does not combine with pagination.

Encoded cursors stay within 8,192 bytes before decoding. Decoded cursors stay within 6,144 bytes before parsing. Rendered stdout stays within 1,048,576 bytes. Each source pass starts with at most 4,194,304 bytes and scans at most 1,000,000 physical lines. A rendered source line stays within 1,048,576 bytes. Raw input stays within 1,048,576 bytes and 10,000 physical lines. Request failures exit 2 before home access. Cursor conflicts exit 3. Missing selections exit 1. Path and integrity failures exit 5. Unexpected filesystem and synchronous output failures exit 4. The command changes nothing and contacts no provider.

### `bot run list`

`bot run list` reads bounded summaries for the home's top-level runs. It does
not read sessions or detailed artifacts. Markdown and version-1 JSON support
typed filters and continuation without changing the home.

### `bot assembly check`

Validates an assembly and reports what would run, without calling a model. It
takes the same assembly, flow, request, slots, and shared options as `bot run`,
so that everything it reports is resolved the way the run would resolve it,
but not run-only options such as `--id-file`. The request is optional here:
validation needs no request, and giving one only adds the task-file rung to
what is resolved.

It resolves the graph, reads every sentinel, checks that every alternative named
in a `CHOOSE.md` exists, resolves every option to its rung, and prints the
stages in the order they would execute. A malformed assembly is refused here
exactly as it would be at run time, with the same code and the same path
([refusals](/specification/refusals/)).

`--json` writes one newline-terminated `bot.assembly.check` document. Its
`data.stages` array carries the resolved stages in execution order:

```json
{
  "schemaVersion": 1,
  "kind": "bot.assembly.check",
  "data": {
    "target": "02-assess/risk",
    "stages": [{ "stage": "02-assess/risk", "type": "STAGE" }]
  },
  "page": { "limit": 20, "next": null, "through": null, "complete": true },
  "summary": { "returned": 1, "matched": 1, "warningCount": 0, "warningsOmitted": 0 },
  "warnings": []
}
```

Every option carries the rung it came from, and `from` is one fixed word per
rung ([the eight rungs](/specification/running/#options-and-where-they-resolve)):
`command`, `task`, `stage`, `container`, `flow`, `assembly`, `home`, `default`.
That is the field that makes "why did this use that model" answerable before
the run rather than after it.

A value an [intelligence](/specification/structure/#intelligences) supplied
carries the rung where that name was authored. The intelligence name and its
resolved provider, model, and reasoning are reported together, so what ran does
not depend on what the table says later.

A single-file stage is `type` `STAGE` like the folder form — the form shows in
`files`, which lists only the file itself.

An authored stage `workdir` appears as written. It is absent when the stage uses
the flow's inherited working directory.

`input` is every name that may appear in `$INPUT`. For the stage after a
`CHOOSE`, that is one name per alternative and exactly one of them will be
there — which one depends on which alternative ran, and that is not statically
knowable, so the list names them all rather than guessing.

`files` lists the recognized files in the stage's folder — the sentinel first,
the rest in name order ([invariant 41](/specification/invariants/)), the entries of a
`gate/` folder as `gate/01-lint.sh` — so a reader can see that a gate exists
without opening the directory. A single-file stage lists only itself.

Two option details: `provider` appears only when some rung set it — it has no
built-in default, so a line for it would otherwise claim a resolution that
never happened — and a container's own frontmatter is rung `container` on its
own line, the same word its contents see. A stage's line also carries
`skills`: the flattened names it would see, narrowest override applied, in
name order — which is what makes the scope rules assertable without a model.

A container emits its own line and then the lines for what is inside it. Its
line carries `stage`, `type`, `options`, and its own key — `repeat` or `width` —
and no `input`, `output`, or `files`, because a container produces nothing of
its own. A `LOOP` lists its contents once, since how many repeats there will be
is not knowable without running, and a `CHOOSE` lists every alternative, because
any of them could be the one that runs.

Given no flow — `bot assembly check review` — it validates the whole assembly exactly as
any invocation would, and reports the assembly agent as the one stage that
would run: `stage` is `assembly`, `type` is `ASSEMBLY`, `files` lists
`ASSEMBLY.md`, `output` is `assembly.txt` (no schema — text), and a `scope`
field names the flows and root subflows the agent could call, in name order
([running the assembly](/specification/running/#running-the-assembly)).

Everything this does is deterministic, which is what makes it the backbone of
[the conformance corpus](/specification/conformance/).

### `bot run list`

`bot run list` reads bounded summaries for the home's top-level runs. It does
not read sessions or detailed artifacts. Markdown and version-1 JSON support
typed filters and continuation without changing the home.

### `bot assembly check`

Validates an assembly and reports what would run, without calling a model. It
takes the same assembly, flow, request, slots, and shared options as `bot run`,
so that everything it reports is resolved the way the run would resolve it,
but not run-only options such as `--id-file`. The request is optional here:
validation needs no request, and giving one only adds the task-file rung to
what is resolved.

It resolves the graph, reads every sentinel, checks that every alternative named
in a `CHOOSE.md` exists, resolves every option to its rung, and prints the
stages in the order they would execute. A malformed assembly is refused here
exactly as it would be at run time, with the same code and the same path
([refusals](/specification/refusals/)).

`--json` writes one newline-terminated `bot.assembly.check` document. Its
`data.stages` array carries the resolved stages in execution order:

```json
{
  "schemaVersion": 1,
  "kind": "bot.assembly.check",
  "data": {
    "target": "02-assess/risk",
    "stages": [{ "stage": "02-assess/risk", "type": "STAGE" }]
  },
  "page": { "limit": 20, "next": null, "through": null, "complete": true },
  "summary": { "returned": 1, "matched": 1, "warningCount": 0, "warningsOmitted": 0 },
  "warnings": []
}
```

Every option carries the rung it came from, and `from` is one fixed word per
rung ([the eight rungs](/specification/running/#options-and-where-they-resolve)):
`command`, `task`, `stage`, `container`, `flow`, `assembly`, `home`, `default`.
That is the field that makes "why did this use that model" answerable before
the run rather than after it.

A value an [intelligence](/specification/structure/#intelligences) supplied
carries the rung where that name was authored. The intelligence name and its
resolved provider, model, and reasoning are reported together, so what ran does
not depend on what the table says later.

A single-file stage is `type` `STAGE` like the folder form — the form shows in
`files`, which lists only the file itself.

An authored stage `workdir` appears as written. It is absent when the stage uses
the flow's inherited working directory.

`input` is every name that may appear in `$INPUT`. For the stage after a
`CHOOSE`, that is one name per alternative and exactly one of them will be
there — which one depends on which alternative ran, and that is not statically
knowable, so the list names them all rather than guessing.

`files` lists the recognized files in the stage's folder — the sentinel first,
the rest in name order ([invariant 41](/specification/invariants/)), the entries of a
`gate/` folder as `gate/01-lint.sh` — so a reader can see that a gate exists
without opening the directory. A single-file stage lists only itself.

Two option details: `provider` appears only when some rung set it — it has no
built-in default, so a line for it would otherwise claim a resolution that
never happened — and a container's own frontmatter is rung `container` on its
own line, the same word its contents see. A stage's line also carries
`skills`: the flattened names it would see, narrowest override applied, in
name order — which is what makes the scope rules assertable without a model.

A container emits its own line and then the lines for what is inside it. Its
line carries `stage`, `type`, `options`, and its own key — `repeat` or `width` —
and no `input`, `output`, or `files`, because a container produces nothing of
its own. A `LOOP` lists its contents once, since how many repeats there will be
is not knowable without running, and a `CHOOSE` lists every alternative, because
any of them could be the one that runs.

Given no flow — `bot assembly check review` — it validates the whole assembly exactly as
any invocation would, and reports the assembly agent as the one stage that
would run: `stage` is `assembly`, `type` is `ASSEMBLY`, `files` lists
`ASSEMBLY.md`, `output` is `assembly.txt` (no schema — text), and a `scope`
field names the flows and root subflows the agent could call, in name order
([running the assembly](/specification/running/#running-the-assembly)).

Everything this does is deterministic, which is what makes it the backbone of
[the conformance corpus](/specification/conformance/).

## What a runtime has to provide

- A record that `bot run events --json` can emit in one versioned document.
- A session per stage, reachable from the record.
- Tool calls with a stage, a name, and an outcome, where the underlying agent
  library reports them.
- Rendering for its own session format.

A runtime that cannot report some of this reports nothing for it. Blank is a
true answer; an inferred one is not ([invariant 17](/specification/invariants/)).

## Reading a run that is still going

The record is append-only, so a run in progress is readable the same way a
finished one is: the lines that exist are the lines that happened, and the last
one is where the run currently is. `bot run events` on a live run is a status display
that needed no separate mechanism.
