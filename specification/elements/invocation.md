# Invocation

> **Stability: stable.**

Invocation is how a run starts: how the assembly is named, where the request
comes from, and how options resolve.

## The three ways to give a request

```sh
bot run start review/change "the auth change in #482 looks wrong"
bot run start review/change @tickets/048.md
bot run start review/change < payload.json
```

A run names its assembly and its flow, separated by a slash. What follows is
the request: a quoted string is the request itself, and an argument starting
with `@` is a **task file** — the sigil says "the request is in here." That is
the whole grammar of the argument, and it is why there is no `--task` option: a
request is an argument, not a modifier.

`bot run start` accepts `--` as the end-of-options marker. Its options come before
the marker; the marker itself is discarded, and the following words fill the
assembly-and-flow and request positions without being read as options. Thus
`bot run start --in ../work -- review/change --ticket-482` runs `review/change` with
the literal request `--ticket-482`. This grammar belongs to `run` only;
invocations without the marker behave as before.

All three end in the same place. The request becomes one file in the first
stage's `$INPUT`, named `request` — with the extension of the task file it came
from, or `.txt` when it came from the command line, from stdin, or from a task
file with no extension — and the
flow's first stage reads it like any stage reads its input ([slots](slots.md)).

The request is bytes, and the runtime does not parse it. If it is JSON, the
first stage runs `jq`. If it is a ticket with frontmatter, the first stage reads
the frontmatter. This is what keeps piped JSON and markdown-with-frontmatter from
fighting each other: neither is privileged, because neither is interpreted.

`bot run start` accepts the target, request forms, options, declared slots, and `--` boundary described here. Human mode prints the run's answer. `--json` or `-j` returns one bounded structured result after the run settles. `--correlation ID` adds one nonempty opaque caller value of at most 256 UTF-8 bytes to the initial record and the structured result. Bot does not require uniqueness and gives the value no replay meaning.

The exception is a task file, which is markdown by construction. Its frontmatter
may carry option overrides and is not part of the request; its body is, and that
is what lands in `$INPUT`. A key in a task file that is not an option is an
error, the same as one in a stage.

Exactly one request arrives. An argument beats the stream: when a string or a
task file is given, stdin is not read at all — so a script that redirects stdin
out of habit changes nothing. Stdin is the request only when no argument was
given, it is not a terminal, and it holds bytes. Two request arguments, or no
request by any of the three ways, is refused (`request-invalid`) — a run with
nothing to act on has nothing to do.

## Where the work happens

```sh
bot run start review/change --in ../worktrees/482 "the auth change looks wrong"
```

The root directory the flow works in is named by the caller, not inherited from
wherever the runtime happened to be started. It is the default `$PWD` for every
stage and the base for a stage's explicit relative `workdir`
([slots](slots.md#pwd)). That is what makes two runs of the same flow against two
worktrees safe to run at once.

Without it, the caller's own working directory is the root. A named directory
that does not exist is refused (`path-missing`) — the same code a declared
slot's or stage working directory's missing path gets, because the fault and
the fix are the same.

## Resuming a run


### Current bot run resume

`bot run resume RUN` starts a new run from `RUN`; it never resumes the donor process. `RUN` is a full run name or an unambiguous prefix in the selected home. Before a new record exists, Bot rejects a missing, ambiguous, live, unreadable, malformed, or unverifiable donor. It derives the assembly, optional flow, and retained request from the donor, verifies the retained bytes, resolves the recorded assembly in the selected home, and checks its current hash against the donor's recorded hash. The donor and its record never change.

The command accepts `--home`, `--in`, declared slot paths, `--id-file`, bounded opaque `--correlation` metadata, and `--json` or `-j`. `--correlation` enters `run_start` and the structured result. `--json` and `-j` select structured output. Current authored configuration, the selected home, and built-in defaults resolve intelligence, timeout, retries, and local context again. A carried prefix contains only a contiguous prefix of plain root stages. It stops before the first `LOOP`, `CHOOSE`, `PARALLEL`, `FANOUT`, or `DESCEND`; every container and its contents run fresh. Each carried stage is a successful sealed and judged stage with a verified output. Bot copies and hash-checks each output into the new self-contained run and records it as carried.

Human mode writes the run's accepted output. Structured mode returns the bounded `bot.run.result` contract with the donor and durable carried-stage count. Complete carried identities appear in order only when the full result fits. A stage counts only after its `stage_carried` event has been durably appended.


## Run id file

The option `--id-file PATH` is accepted by `bot run start` and `bot run resume`. It writes the id of that run to `PATH` once the run has started. The option belongs only to run creation: `bot assembly check` does not consume it, and it is outside the authored option ladder. A relative path resolves from the caller's working directory. The runtime creates or replaces the named file but does not create a missing parent directory.

## Declared slots

An assembly that declares slots ([slots](slots.md#declared-slots)) is supplied
them at invocation, each as a long option named after the slot:

```sh
bot run start docs/answer --kb ../knowledge-base "how do refunds work?"
```

Every declared slot must be supplied; a run missing one is refused
(`slot-missing`), and a supplied path that does not exist is refused
(`path-missing`). These are options rather than arguments because they modify
where the run looks, not what it is asked — the request is the argument.

## Options and where they resolve

Loose non-model options use eight rungs, most specific first: command, task,
stage, enclosing containers innermost first, flow, assembly, home, and built-in
default. Those keys are `timeout`, `retries`, and `local-context`.

Model choice has one authored key, `intelligence`, at six rungs: command, task,
stage, container, flow, and assembly. On the command line it is
`--intelligence`. The nearest name looks up one complete row in the home's flat
`intelligences` table. Provider, model, and required reasoning inherit the
name's rung. If no rung names one, an executing agent looks up `default` and
all four resolved values carry the `home` source.

A missing intelligence row is refused (`intelligence-unresolved`) naming the
requested name. A providerless row retains provider ambiguity as
`model-unresolved`, naming candidate providers. Retired model-choice keys and
long options are `key-unknown` and point operators to the table and
`--intelligence`.

`timeout` defaults to 3600 and is at least 1; `retries` defaults to 2 and is at
least 0; `local-context` defaults to `ignore`. A runtime refuses a timeout it
cannot honour. Every effective value is recorded with its source rung.

## What `$PWD`'s own context does

```sh
bot run start review/change --local-context use "the auth change looks wrong"
```

A tree being worked in often carries instructions of its own — an `AGENTS.md`,
a `skills/` folder — and whether any of that reaches the agent is the caller's
decision, not the tree's. `local-context` is that decision, and it takes one of
three words:

- **`ignore`** — the built-in default. `$PWD` is a path; nothing about its
  contents enters the prompt.
- **`announce`** — the prompt names what `$PWD` carries, its document and each
  of its skills, name and one line, and injects none of it
  ([prompt construction](prompt.md)). Reading is the agent's own act, with its
  own tools, from `$PWD`.
- **`use`** — the document's body enters the prompt, and `$PWD`'s skills join
  `$SKILLS` as the widest scope ([skills](skills.md)).

The document is `AGENTS.md`, falling back to `CLAUDE.md` only when `AGENTS.md`
is absent — one document, never two. The skills are the folders under
`$PWD/skills/` and then `$PWD/.claude/skills/`, the first name winning, each
laid out the way any skill is; a folder without a described `SKILL.md` is not
one. A value that is none of the three words is refused (`value-invalid`), the
same as any option's.

A `$PWD` carrying no document and no skills announces nothing and injects
nothing under any of the three: absence is an ordinary fact about a workspace,
not a fault. A subflow child resolves the key from its own rungs like any
option ([subflows](subflow.md)) while defaulting to its parent's `$PWD`; an
authored stage `workdir` selects its own tree. Admitting one tree therefore
admits it only in the stages that actually use it.

## What the run keeps

- The request as supplied, byte for byte, before anything read it.
- Which of the three ways it arrived.
- Each stage's resolved options and their sources.
- The assembly's identity and content hash.
- Explicit donor provenance when it continued verified sealed work.

## Naming the assembly

The argument before the request is the assembly and the flow, and the split is
read from the filesystem: when the whole argument names a folder holding
`ASSEMBLY.md`, it is an assembly and the run has no flow
([running the assembly](#running-the-assembly)); otherwise the flow is the
last segment, and everything before it is the assembly. A home where both
readings are true — an assembly `a/b` beside an assembly `a` that has a flow
`b` — is refused naming both readings (`request-invalid`): the runtime does
not guess between two runnable things. An assembly name is a
relative path, resolved under the home's `assemblies/` directory — `review` and
`team/review` are both names ([the home](home.md)). One that starts with `/`,
`./`, or `../` is a filesystem path instead, and the folder it names is the
assembly:

```sh
bot run start review/change "…"            # $BOT_HOME/assemblies/review, flow change
bot run start team/review/change "…"       # $BOT_HOME/assemblies/team/review
bot run start ./review-bot/change "…"      # an explicit path, same flow rule
```

There is no search of the current directory, no layering, and no shadowing.
Naming a folder is the act of choosing to run it ([the assembly](assembly.md)).

## Running the assembly

```sh
bot run start review "what should happen to the auth change in #482?"
```

A run that names no flow runs the assembly itself. One agent — the assembly
agent — receives the body of `ASSEMBLY.md` as its prompt, the request in its
`$INPUT`, and the same slots a stage gets, with the assembly's skills in
`$SKILLS`. Its scope for the [`subflow` tool](subflow.md) is every flow and
every subflow at the assembly root — a flow and a root subflow sharing a name
is refused (`input-collision`), the fault naming the root subflow — the flow
is the entry point; the subflow is what intruded on the shared namespace. It
reads the request, calls whichever fit, and answers with what comes back — or
answers directly when nothing does. This is the one place flows are callable;
everywhere else a flow is an entry point and only `subflows/` are in scope.

The assembly agent has no checklist, schema, or gate — `ASSEMBLY.md` declares
none — so what it writes to `$OUTPUT` is the run's output as it stands. It may
refuse like any agent. In the record its identity is `assembly`, and its calls
land like any stage's: one event each, one child run each
([the record](record.md)).
