# Slots

> **Stability: stable.**

A slot is a name the agent uses to reach something without knowing where it is.

Slots are environment variables. The runtime exports them into the agent's
environment and into every process the agent starts, and the shell expands them
the way it expands any other variable. The agent writes `$OUTPUT`, lists
`$SKILLS`, leaves working files in `$TMP`, and never types a path.

Inside a run, the slots are the runtime's. The caller's environment passes
through — an agent, hook, or gate finds `PATH` the way any child process would
— except provider credential environment names consumed by the parent;
`BOT_HOME`, the runtime's own bot-named variable; `$BOT_RUN_ID`, which every
process the run starts receives with the run's name
([the runtime](runtime.md)); and `TMPDIR`, set to the stage's own scratch
([`$TMP`](#tmp)). Whatever it held under these names is overwritten for every
process the run starts, so a slot always means
what this specification says it means ([invariant 43](invariants.md)).

## The slots

| Slot        | What it is                                              | Lifetime  |
| ----------- | ------------------------------------------------------- | --------- |
| `$PWD`      | the caller-owned tree where this stage works             | the stage |
| `$INPUT`    | a directory holding the stage's input                   | the stage |
| `$OUTPUT`   | the one file the stage's output is written to           | the stage |
| `$TMP`      | an empty scratch directory                              | the stage |
| `$SKILLS`   | every skill the stage can see, flattened                | the stage |
| `$SUBFLOWS` | one folder per subflow call the stage has made          | the stage |

`$PWD` is caller-owned and shared by default. Several runs, and several branches
of one run, can be working in the same tree at the same time. A stage may
explicitly select a subdirectory instead ([the stage](stage.md#the-prompt-and-the-configuration)).
`$INPUT`, `$OUTPUT`, and `$TMP` belong to the runtime, one set per stage, and no
two stages share them.

## `$PWD`

`$PWD` is the one slot the runtime does not invent — every process has a working
directory — but it is a slot because the caller decides what it is.

Without being told otherwise, the agent works in the directory the runtime was
started from. Naming one is how a caller separates them, and it is what two
concurrent runs need: two runs pointed at two worktrees share no ground, and two
runs left at the default share everything.

`bot run start --in` selects the root workspace. A stage with `workdir: ./investigator`
uses the `investigator/` directory beneath that root as its process working
directory and as its `$PWD`. The same effective directory is used by the agent,
its local context, its hooks, and its gates. A stage without the field keeps the
current flow's inherited `$PWD`; this preserves the ordinary one-directory flow
and a subflow's inheritance from its caller.

An authored working directory must exist before the run and remains after it.
The runtime neither creates nor cleans it. This is workspace placement, not a
sandbox: the operating system still decides what an agent can reach
([invariants 34–37](invariants.md)).

Where the runtime was started and where the agent works are two different
things. The caller names the second one, and the agent's process is put there:
it is the directory the agent starts in, the one relative paths resolve against,
and the only tree it has any reason to touch. A runtime run from anywhere can
point an agent at a worktree, a checkout, or a scratch clone, and nothing in the
assembly changes.

By default `$PWD` is a path and nothing more: what the tree itself carries — an
`AGENTS.md`, skills of its own — reaches the agent only when the caller asks
for it ([invocation](invocation.md#what-pwds-own-context-does)).

## `$INPUT` is a directory

A stage's input is a directory holding one file per source. A sequential stage
has one source, so its `$INPUT` holds one file. A stage after a fan-out has
several, so its `$INPUT` holds several.

Nothing is ever merged. Three branches produce three files with three names, and
the filesystem is the namespace that keeps them apart. This is why the format
never has to answer "what does merging two YAML documents mean" — it doesn't
merge them. The rule holds for JSON, for markdown, for an image, for anything.

## The names inside `$INPUT`

A file in `$INPUT` is named after what produced it: the stage's identity, which
is its folder or file name with the leading number removed. What produced it is
always something visible from where the stage stands — the previous stage, a
branch, a chosen alternative, a loop — never a stage buried inside one of those,
so a container's internals stay its own
([invariant 26](invariants.md)).

| Where the stage sits            | What `$INPUT` holds                            |
| ------------------------------- | ---------------------------------------------- |
| after `02-design.md`            | `design.txt`                                    |
| first in a flow                 | `request.txt`                                   |
| first fresh plain root stage in an applicable resumed run | its ordinary source plus `bot-resume-prior-failure.json` or the first deterministic numeric suffix if that name collides |
| after a `PARALLEL` with three branches `research/`, `risk/`, `cost/` | `research.json`, `risk.json`, `cost.json` |
| after a `CHOOSE` that ran `escalate/` | `escalate.json`                            |
| after a `LOOP` named `03-refine/` | `refine.json` — the last repeat's output, under the loop's name |
| the second pass of a `LOOP`     | the loop's own input, and the previous pass's output |

The extension is the one the producing stage's schema chose, or `.txt` when it
had none ([the schema](schema.md)). The run's request is named `request` and
keeps the extension of the task file it came from, or `.txt` when it arrived on
the command line, on stdin, or in a task file with no extension
([invocation](invocation.md)).

Two consequences fall out of this. A stage after a `CHOOSE` can tell which
alternative ran by the name of the file it was given, without being told. And a
stage after a `PARALLEL` addresses each branch by name, so branches can produce
entirely different shapes without anything having to reconcile them.

The runtime names the files in the prompt, so the agent does not have to
discover them ([prompt construction](prompt.md)).

## `$OUTPUT` is one file

A stage writes its output to `$OUTPUT` and nowhere else. Anything else it wrote
is not its output.

The stage's schema chooses the file's format, and therefore its extension:
`.json`, `.md`, or `.txt` when there is no schema at all
([the schema](schema.md)).

`$OUTPUT` is not under `$PWD`. It lives in a directory the runtime owns for that
one stage, which is what makes it safe for several agents to be working in the
same tree at once.

## `$SUBFLOWS`

A stage that has made subflow calls finds each one under `$SUBFLOWS`, numbered
in the order the calls were made: an `input` and an `output`, each with the
extension its content chose ([subflows](subflow.md)). The slot exists so an
agent can compose over children's answers by path, without ever learning where
their runs are recorded. A stage that has made no calls has an empty
`$SUBFLOWS`, and a stage with no subflows in scope is not told the slot exists.

## `$TMP`

`$TMP` is an empty directory when the stage starts, and no other stage sees it.
Nothing in it is recorded or reaches the next stage. The runtime destroys a
stage's `$TMP` when that stage settles, including a refusal, fault, or handled
signal.

The environment a stage's processes hold also carries `TMPDIR`, set to the same
directory, so a program that mints its own temporary files — `mktemp`, a
language's temp-directory call — leaves them in `$TMP` instead of the machine's
temporary directory. Those files remain available while the stage is live and
disappear with `$TMP`.

`tmp: flow` on a `FLOW.md` makes every stage in that flow share one scratch
directory instead, for the case where stages pass working material along that is
not an output ([flow](flow.md)). That shared `$TMP` remains through handoffs and
is destroyed when its flow settles. Per stage is the default, because per stage
is what surprises nobody. A subflow has its own flow and scratch scope, so its
cleanup cannot remove its parent's shared `$TMP`.

Only `$TMP` is removed at normal settlement. The surrounding scratch directory
retains the other runtime material, and sealed outputs, records, sessions,
`$INPUT`, `$SKILLS`, and `$SUBFLOWS` retain their existing contracts. Scratch is
outside the working tree (`$PWD`), does not live under the run's directory, and
sits in a cache directory the runtime owns, so no slot value discloses where
runs live ([home](home.md)).

Retained scratch is BEST-EFFORT, because a cache is the one directory on the
machine whose contents anything may reclaim: the operating system, a cleaner, a
full disk, or a person with `rm`. Nothing a run is judged by is only there. What
the run produced was captured into its record when it was produced, so missing
retained scratch costs inspection material and no part of an answer. `bot run events`
names only the directories that are still there.

Scratch is created owner-only at its root, like the home ([home](home.md)), and
each run's entry within it is keyed by the home as well as by the run: two homes
on one machine can mint the same run name, and one shared directory would let
the runs write over each other.

## Declared slots

An assembly may declare slots of its own, for the asset every flow in it works
against — a knowledge base, a corpus, a reference tree:

```yaml
slots:
  kb: the knowledge base this assembly answers from
```

The key is the slot's name; the value is its description, which is what the
agent is told about it ([prompt construction](prompt.md)). The caller supplies
each one at invocation as a path
([invocation](invocation.md#declared-slots)), and every stage of the run finds
it exported like any slot: `$KB`, uppercased.

A declared slot is a place the caller names, where `$PWD` is the place the work
happens. The assembly says what it needs and the home or the caller says where
that is — the same portability the model rungs give, applied to paths.

A declared name is an ASCII POSIX identifier:
`^[A-Za-z_][A-Za-z0-9_]*$`. Its uppercase export must be unique among declared
slots, so `notes` and `NOTES` are refused together (`slot-reserved`).

A declared name may not shadow the runtime's own: `input`, `output`, `tmp`,
`skills`, `subflows`, `pwd` are refused (`slot-reserved`). Nor may it shadow
the environment it lands in: slots overwrite the environment
([invariant 43](invariants.md)), so a declared name whose uppercase is a
variable already set at invocation — `path` becoming `$PATH` — is refused the
same way (`slot-reserved`), because a slot that overwrote `PATH` would break
every script beneath it. A run that does not
supply a declared slot is refused (`slot-missing`), and a supplied path that
does not exist is refused the way `--in`'s is (`path-missing`) — a slot points
at something real or the run does not start.

## Why names and not paths

The agent is never told where the assembly lives, where the run record lives, or
where anything checking it lives. The slot is the whole of what it knows.

Names direct the agent's attention toward its task and away from the machinery around it. They provide no security boundary.

Bot is not a sandbox. An agent holding a shell can print a slot value and follow any path the operating system permits. A stage `access` declaration can refuse direct model-facing calls. It does not contain an allowed process. Bot retains reported direct tool calls and denied direct calls. It does not watch the filesystem or claim a complete list of changes.
