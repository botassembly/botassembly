---
title: A folder in, a record out
description: The whole runtime is one sentence. Here is the folder that goes in and the record that came out, from an assembly that ships in the repository.
date: 2026-09-11T12:00:00Z
authors: ian
tags:
  - principles
draft: true
excerpt: An assembly is a folder of markdown and scripts. A run of it leaves a record. Everything else is vocabulary inside the folder, and here are both halves from a real run.
---

An assembly is a folder of markdown and scripts. The runtime walks the folder in order, gives each stage to an agent, runs the checks you wrote, and writes down what happened. That is the whole job: a folder in, a record out. Stages, skills, choosers, gates, intelligences are all vocabulary inside the folder.

You should not have to take my word for that. Both halves ship in the repository.

## The folder

```console
$ ls -R examples/triage
examples/triage:
ASSEMBLY.md  flows  README.md  skills

examples/triage/flows/triage:
01-classify  02-route  03-verify  FLOW.md

examples/triage/flows/triage/01-classify:
before  failure  schema.json  STAGE.md  success

examples/triage/flows/triage/02-route:
CHOOSE.md  routine  urgent

examples/triage/flows/triage/03-verify:
gate  STAGE.md

examples/triage/flows/triage/03-verify/gate:
01-blocker  02-sections
```

I trimmed the leaf files out of that listing. Nothing else is hiding.

`triage` sorts an inbound customer request into an urgent queue or a routine one and writes the routing memo. `01-classify` reads a priority rubric and writes JSON. `02-route` picks a branch. The branches are the `urgent/` and `routine/` directories sitting right there. `03-verify` writes the memo. Two shell scripts under `gate/` decide whether the memo is acceptable. `STAGE.md` carries a checklist the agent affirms item by item. Atul Gawande wrote that idea down for surgeons and I moved it onto agent work.

Why not a YAML file that names the steps? Because then two things describe the flow and one of them drifts. The stages run in the order their names sort. Reordering the flow is `mv`.

## The record

I ran it on 11 September 2026 against this request:

```
Order 4482 arrived with the wrong item and we need the right one before our event on Friday.
```

The run left an 89-line `record.jsonl`. Here are twelve of those lines, verbatim, from [the checked example record in the repository](https://github.com/botassembly/botassembly/blob/main/examples/triage-record.jsonl):

```json wrap
{"ts":"2026-09-11T17:55:10.003Z","event":"check","stage":"01-classify","retry":1,"check":"output","exit":0,"capture":"stages/01-classify/1/1/checks/output.txt"}
{"ts":"2026-09-11T17:55:10.004Z","event":"check","stage":"01-classify","retry":1,"check":"checklist","exit":0,"capture":"stages/01-classify/1/1/checks/checklist.txt"}
{"ts":"2026-09-11T17:55:10.024Z","event":"check","stage":"01-classify","retry":1,"check":"schema","exit":0,"capture":"stages/01-classify/1/1/checks/schema.txt"}
{"ts":"2026-09-11T17:55:10.031Z","event":"hook","stage":"01-classify","retry":1,"hook":"success","exit":0,"capture":"stages/01-classify/1/1/hooks/success.txt","sha256":"1cd9614fc212e16a05e94476bdfd8218c81631ffc389b61f95275d641c9b5dc1"}
{"ts":"2026-09-11T17:55:10.034Z","event":"stage_end","stage":"01-classify","retry":1,"exit":0,"cause":"success","output":{"path":"stages/01-classify/1/1/output.json","sha256":"2dfcf782e6b12c190243c11dbd9534182b86a3ffdc208a672ca81948b8a451e9"},"sealed":true,"judged":true}
{"ts":"2026-09-11T17:55:12.404Z","event":"chose","stage":"02-route","retry":1,"chose":"urgent","declined":["routine"],"reason":"The classification and priority-rubric indicate the priority is urgent (deadline inside three working days / event on Friday)."}
{"ts":"2026-09-11T17:55:24.513Z","event":"gate_start","stage":"03-verify","retry":1,"file":"flows/triage/03-verify/gate/01-blocker","sha256":"07e0956facc0b6a92308c2022cb018a98ee5431d65d712e2c592cfff3a62dad6"}
{"ts":"2026-09-11T17:55:24.517Z","event":"check","stage":"03-verify","retry":1,"check":"gate","file":"flows/triage/03-verify/gate/01-blocker","exit":0,"capture":"stages/03-verify/1/1/checks/gate/01-blocker.txt","sha256":"07e0956facc0b6a92308c2022cb018a98ee5431d65d712e2c592cfff3a62dad6"}
{"ts":"2026-09-11T17:55:24.518Z","event":"gate_start","stage":"03-verify","retry":1,"file":"flows/triage/03-verify/gate/02-sections","sha256":"2855e836a7276c827cb46f9d1e882c6bb69f550ee705c5dd36f1076b096825bb"}
{"ts":"2026-09-11T17:55:24.524Z","event":"check","stage":"03-verify","retry":1,"check":"gate","file":"flows/triage/03-verify/gate/02-sections","exit":0,"capture":"stages/03-verify/1/1/checks/gate/02-sections.txt","sha256":"2855e836a7276c827cb46f9d1e882c6bb69f550ee705c5dd36f1076b096825bb"}
{"ts":"2026-09-11T17:55:24.524Z","event":"stage_end","stage":"03-verify","retry":1,"exit":0,"cause":"success","output":{"path":"stages/03-verify/1/1/output.txt","sha256":"8253cf96a0b5b75cf334aa3119693ea0d8ed292df822e74708d357dfb135a52e"},"sealed":true,"judged":true}
{"ts":"2026-09-11T17:55:24.526Z","event":"run_end","exit":0,"cause":"success"}
```

Read it straight down. Three checks passed on `01-classify`, each with the file that holds its output. The stage sealed its output under a SHA-256. The chooser took `urgent`, declined `routine`, and gave its reason in its own words. Both gate scripts ran. Each line carries the hash of the script that ran. Nobody has to trust that the gate in the repository today is the gate that judged the memo. The run exited 0 with a cause of `success`.

## What each side owns

The folder owns the behavior. Every instruction, every checklist item, every gate script is a file you open and rewrite.

The record owns the history. It never says what should have happened. It says what did.

Neither half needs the other. I can rewrite a gate without touching a single record, and I can read a record from a folder I deleted a year ago.

## What that buys

Review is a diff. A change to how the agent is judged is a change to a shell script. It arrives in a pull request the way a change to a function does.

Handing it to a teammate is `git clone`. `bot assembly install` takes a git URL. There is no export step, because there was never an import step.

Reading a run needs no runtime. `record.jsonl` is one JSON object per line. `jq` reads it, `grep` reads it, a person reads it.

## One honest limit

The record is not containment. Bot keeps the calls the model harness reports and the calls Bot itself denied. It does not watch the filesystem, and a gate script runs with whatever authority you have. Put a container around an assembly you did not write. That is the easiest lie to tell in this category and I am not going to tell it.

The repository publishes the event record used above. It does not publish raw provider sessions or complete run folders because a tool can print sensitive environment values into a session.

## Next

The next post walks one finished run end to end: the prompt the agent got, the checklist it affirmed, the gate's verdict, and what it cost.
