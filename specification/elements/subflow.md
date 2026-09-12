# Subflows

> **Stability: stable.**

A subflow is a flow a stage can call. The stage's agent hands the runtime an
input, the flow runs as a complete run of its own, and the answer comes back:
onto disk always, into the agent's context when it is small.

A subflow call is an invocation. The child receives what any run receives —
request bytes and a working directory — and returns what any run returns, its
flow's output. No session crosses in either direction
([invariant 38](invariants.md)). The rest of the world calls this a subagent;
here the thing called is a flow, gates and all, which is what makes the answer
worth trusting.

An assembly can keep an `oracle/` subflow — one stage on an expensive model,
high reasoning — and any stage with it in scope hands it the hard question and
keeps working on its own.

## The three scopes

A `subflows/` directory may sit at three places, and its position decides who
can call what is inside it — the same shape as [skills](skills.md).

| Where                            | Callable by                |
| -------------------------------- | -------------------------- |
| [the assembly root](assembly.md) | every stage                |
| [a flow folder](flow.md)         | the stages of that flow    |
| [a stage folder](stage.md)       | that stage alone           |

Each entry in a `subflows/` directory is a flow: a folder typed by `FLOW.md`,
or by `DESCEND.md` when it may call itself ([descend](descend.md)). A subflow
belongs at the narrowest scope where it is useful, like a skill.

A subflow is a flow folder, so it may carry its own `skills/` and `subflows/`,
resolved narrowest-first like every other scope.

The scopes are flattened into one list, and **names collide by overriding,
narrowest first** — one name is one subflow. The agent is told each subflow's
name and its `description`, and nothing about where it came from.

A subflow is not an entry point. Invocation resolves names in `flows/` and
nowhere else ([invocation](invocation.md)), so the only way to reach a subflow
is to be a stage with it in scope. The reverse holds too: a stage can never
call a flow, only a subflow. The one agent with both in scope is the assembly
agent, which is what runs when a run names no flow
([running the assembly](invocation.md#running-the-assembly)).

## The call

A stage with any subflow in scope has the `subflow` tool
([control tools](runtime.md#control-tools)). One call submits a batch of one or
more requests, and a batch of one is just a call:

```json
{
  "calls": [
    { "flow": "oracle", "input": "Is this migration safe to run twice?" },
    { "flow": "summarize", "input-file": "$TMP/page-03.md" }
  ]
}
```

Each entry names a flow in scope and gives the input as text or as a path to a
file whose bytes become the input — which is how an agent chains one subflow's
output into another's input without carrying the content through its own
context. The input is the child run's request, delivered the way any run's
request is delivered ([invocation](invocation.md)).

A batch holds at most 32 calls; a larger one comes back as a tool result to
split, not as a failure.

A tool payload is JSON, and no shell expands it, so the runtime does: any
slot variable in an `input-file` path — `$TMP`, `$SUBFLOWS`, `$SKILLS`,
`$INPUT`, `$OUTPUT`, `$PWD`, a declared slot — is expanded by the runtime
before the path is read, uniformly, which is what lets an agent name files by
slot in a tool call the way it does everywhere else.

The runtime runs the batch's children at once and the tool returns when the
last of them ends. Each child is a run: fresh sessions, its own stages and
checks and clocks, and the parent's `$PWD` as its inherited default. How many
children an agent starts is its own business; a call chain has a fixed ceiling
of ten subflow calls, and a child's time is never on the parent's clock
([invariant 22](invariants.md)).

What a child inherits is what invariant 38 allows across the boundary and
nothing more: the input as its request, the parent's `$PWD`, and the
assembly's declared slot values — a child of the same assembly cannot run
without them. It does not inherit the invocation: the parent run's
command-line and task-file overrides are rungs of *that* invocation, and the
child resolves its options from its own sentinels, the home, and the defaults.
A child stage that explicitly sets `workdir` resolves that path from the root
workspace selected by the original `bot run start --in`; omission is what preserves
the parent's effective `$PWD`.

## `$SUBFLOWS` — where the answers live

Every call lands in the [`$SUBFLOWS` slot](slots.md), numbered in the order the
calls were made, across batches, starting at 1:

```text
$SUBFLOWS/
  1/
    input.txt
    output.md
  2/
    input.json
    output.json
```

Each call's folder holds exactly what crossed the boundary, as a typed pair.
`input` carries the extension of what was sent: `.txt` for inline text, the
file's own extension for an `input-file`. A file extension must contain only
ASCII letters and digits and fit the retained `request.<extension>` directory
entry. Bot refuses another suffix before it creates a child. `output` carries the extension the
child's final stage's schema chose. Both names are constant whatever flow ran —
composing over calls never depends on what a flow was called; which flow it was
is in the tool result and the record. The agent composes over these files by
path and never learns where the child's run record lives.

## What enters the context

The tool result reports, for each call: its number, its flow, how it ended, the
output's path under `$SUBFLOWS`, and its size in bytes and lines. The content
itself is injected when it is small and pointed at when it is not:

- **At most 10,000 bytes:** the whole output, inline.
- **Larger:** a marked prefix that, including its marker, is at most 10,000
  bytes, and the path to the rest.

The numbers are deliberate limits on what enters the context automatically; the
agent reads the rest from `$SUBFLOWS` when it wants it.

## Failure is an answer

A child that fails or refuses does not fail the parent. The tool result carries
how it ended — the same cause vocabulary as any run
([the record](record.md#what-it-names)) — and the reason, in the child's own
words when it refused. The call's folder keeps the input and no output. The
parent read an answer that says no, and what it does about that is what it is
for.

## Evidence, not product

Child answers are evidence for the parent, never the parent's output. The stage
still writes its own `$OUTPUT`, and its own checklist, schema, and gate judge
only that ([invariant 24](invariants.md)). An agent that wants a child's answer
to *be* its output copies it there and stands behind it.

## In the record

Every call is one event in the parent's record — the flow, the request, how it
ended — and the child itself is recorded under the parent stage's attempt,
with its own record and sessions, in the ordinary record shape, read through
its parent ([the record](record.md), [inspection](inspection.md)). An inline
request records its text, size, and hash. An `input-file` request records the
normalized retained child request path, size, and hash. It never records the
expanded absolute source path. A child record-writer failure leaves that child
record visibly incomplete; the parent call keeps the normalized input
descriptor and says its machinery failed without inventing an exit or cause.

On disk that is a run directory in the ordinary shape, nested where the call
was made — `stages/<stage>/<repeat>/<attempt>/subflows/<n>/`, the number
matching the call's folder under `$SUBFLOWS`. A child's scratch is its own
directory under the calling run's scratch root, named nothing a reader could
guess, so it leaves with the run when the run's scratch does. A child is evidence of its
parent's work, so it lives inside the parent's run and travels with it when the
run is moved or archived; `bot run list` lists top-level runs only, and a child is
reached through its parent.

## Depth

Placement is a tree, and a folder cannot contain itself, so *placement* nests
only as deep as an author physically wrote. Call chains are not placement:
assembly-root subflows are in every stage's scope, a stage inside one subflow
can call another, and two subflows can call each other by turns. The runtime
allows at most ten subflow calls in one chain. A root run starts at cumulative
position 0, each child advances it by one, and a stage at position 10 has no
subflows in scope. Every call is in the record; its `depth` is the greater of
its self-chain depth and cumulative position.

The one thing placement cannot express is a flow seeing *itself* in its own
scope, and that takes the one marker written for it
([descend](descend.md)) — whose `max-depth` bounds that self-chain. The fixed
runtime ceiling bounds mixed-flow chains separately.
