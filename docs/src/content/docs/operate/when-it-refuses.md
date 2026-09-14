---
title: "When it refuses or fails"
description: "What each exit code means, the faults a first run hits most, and where to look next."
---

Bot ends a command in one of two ways when something is wrong, and the two leave different evidence.

A **refusal** means nothing ran. The assembly or the invocation was wrong and no model was called. Fix the named thing and try again.

A **failed run** means work happened and then ended badly. There is a record, and it says where.

## The exit codes

| Exit | What it means |
| --- | --- |
| `0` | The flow finished and the answer passed its checks. |
| `1` | It ran and the work did not pass. |
| `2` | The command was impossible and nothing ran, or a late fault ended the run. |
| `4` | An unexpected filesystem or output failure. |
| `5` | An integrity or installation fault. |
| `128+n` | A signal killed it. `n` is the signal's number. |

## Exit 1: it ran and did not pass

Five endings arrive at `1`.

- The agent said it could not do the job.
- Its retries were spent with a check still saying no, or with an answer it never gave. A choice not made, or a loop's question left open.
- The assembly's own machinery said no: a hook that ran cleanly and exited non-zero, or a loop that used up its repeats with the agent still asking to continue.
- A gate reported an external blocker. The gate exits `75`, and its output says what stood in the way.
- The agent's clock ran out.

The record names the ending in one word. That word is what `bot run list` prints beside the exit code.

```sh
bot run list
bot run events RUN
```

`bot run events` names the stage, the check, and the reason. If a checklist is what failed, `bot run checklist RUN` shows each mark and its evidence.

## Exit 2: the command was impossible

Read standard error. The two commands report a refusal differently, so read the one you ran.

`bot run start` prints the refusal code, the path at fault, and a sentence saying what to fix.

```console
$ bot run start ./hello/hello "Say hello to Ian."
flow-unknown  flows/hello
  Name a flow that exists.
$ echo $?
2
```

`bot assembly check` prints one sentence and no detail.

```console
$ bot assembly check ./hello/hello
The assembly is not valid.
$ echo $?
2
```

Add `--json` to get the code, the path, and the sentence from either command. They arrive in the `details.faults` array.

```console
$ bot assembly check ./hello/hello --json
{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":[{"code":"flow-unknown","path":"flows/hello","sentence":"Name a flow that exists."}]}}}
```

Pipe it through `jq` to read one fault at a time.

```sh
bot assembly check ./hello/hello --json | jq '.error.details.faults'
```

[Explore a refusal](/operate/refusals-explorer/) takes any code and shows the folder that causes it, the file at fault, and the repair.

Exit `2` can also arrive after work has started. A provider that is not configured, a gate or hook that cannot be executed, or a disk that fills ends the run this way. A record exists then, and it says where.

### The flow-name trap

The most common first refusal is `flow-unknown`. A target names an assembly and a flow, and in three of the four shipped assemblies those are different words.

`hello` is the assembly. Its flow is `greet`, so the target is `./hello/greet`. Only `triage` repeats its own name. `brief` holds `brief`, and `outline` holds `plan`.

Run `bot assembly check` on the assembly with no flow to see every flow the assembly holds.

```console
$ bot assembly check ./hello
assembly  ASSEMBLY  input=request.txt  output=assembly.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=300,retries=2,local-context=ignore
flows/greet/FLOW.md  flow-definition  type=FLOW  flow=flows/greet  max_subflow_calls=10
01-welcome  STAGE  flow=flows/greet  input=request.&lt;runtime&gt;  output=welcome.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=120,retries=2,local-context=ignore
```

The `flow-definition` lines name the flows. This assembly holds one, `flows/greet`.

### The intelligence is not defined

`bot run start` names this one outright.

```console
$ bot run start ./hello/greet "Say hello to Ian."
intelligence-unresolved  flows/greet/01-welcome.md
  Define an intelligence named default in the home configuration.
$ echo $?
2
```

`bot assembly check` answers `The assembly is not valid.` for the same fault, and `--json` carries the `intelligence-unresolved` code and the same sentence.

A run needs a row called `default` in the home's `config.yaml`. So does `bot assembly check`, because it resolves every option the run would resolve.

[Providers, models, and credentials](/operate/providers-and-credentials/) shows the file.

## Exit 5: the home is not private

```text
fault: Installation identity validation failed: The Bot home is not a private owner-only directory.
```

The home must be mode `0700` and owned by you. `chmod 700` on the home repairs it.

```sh
chmod 700 "$BOT_HOME"
bot home show --home "$BOT_HOME"
```

Read-only commands may accept a group-readable or world-readable home. The first `bot run start` stops before it calls anything.

## Signal exits

A run stopped by a signal exits `128` plus the signal's number, the way any program does. Ctrl-C sends `SIGINT`, which is signal 2, so the exit is `130`. A `SIGTERM` is signal 15 and the exit is `143`.

Read the record like any other ending. The run holds no lock after it dies, so the assembly it used can be updated or removed again.

## Where to look next

- [Explore a refusal](/operate/refusals-explorer/) for any refusal code.
- [Reading a record](/operate/reading-a-record/) for a run that produced one.
- [Before you pilot it](/operate/before-you-pilot-it/) for what `bot` does not bound and does not contain.
