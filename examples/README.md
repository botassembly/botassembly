# examples/

Runnable assemblies in a ladder. Each folder here is a complete assembly you can copy out, point `bot` at, and run. Start at the top and add one idea at a time.

Run the commands below from this folder.

## The ladder

1. [`hello/`](hello/): greets a new teammate. One flow, one stage, a two-item checklist. The smallest assembly the format allows.
2. [`triage/`](triage/): sorts an inbound customer request into urgent or routine and writes the memo. A skill in a slot, a checklist, a JSON schema, a `CHOOSE` node, two gate scripts including a blocking exit 75, and the `before`, `success`, and `failure` hooks.
3. [`brief/`](brief/): turns a week of team notes into one digest. `FANOUT` over a checked JSON list, `PARALLEL` branches on one input, a bounded `LOOP` with a gate inside it, and a flow-scoped subflow.
4. [`outline/`](outline/): plans a report from a rough topic. `DESCEND` calling itself per level, a subflow an agent calls as a tool, two skills in one slot, a `schema.md` template, and a `LOOP` that exits early.

Beside them:

- [`data/`](data/): the sample requests the commands below feed in — `request-urgent.txt`, `request-routine.txt`, `notes-week.txt`, and `topic.txt`. It is not an assembly.

## How to run one

With `bot` installed (`make install`), from this folder:

```sh
bot assembly check ./triage/triage
bot run start ./triage/triage @data/request-urgent.txt
```

The first argument is the assembly folder and the flow inside it. Name the flow. A target that names only the assembly runs the assembly agent, which is one agent reading `ASSEMBLY.md`, not the flow. The four flows are `hello/greet`, `triage/triage`, `brief/brief`, and `outline/plan`.

The second argument is the request: a plain argument, `@file` for a task file, or stdin when piped. A `@file` path resolves against your working directory, so the short paths above work from here.

Each rung names the intelligence `default`, so they run against whatever model your home's `config.yaml` maps that name to. Nothing here pins a provider.

## The rule

Every rung ships with a `bot assembly check` proof. Its own `README.md` shows the exact command and output. `bot assembly check` resolves the whole assembly and calls no model, so the proof costs nothing and anyone can reproduce it.

`sdlc/scripts/examples` runs `bot assembly check` on every flow of every assembly in this folder, and `sdlc/scripts/lint` calls it, so `make check` fails when a rung stops resolving. A rung no check executes is documentation pretending to be code.

## Planned

These do not exist yet.

- A generated documentation page per rung, built from the assembly files.
- A live rung in the smoke ladder that proves a rung still produces its output.
