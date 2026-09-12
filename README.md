# botassembly

A folder of markdown files runs as an agent workflow, and every run leaves a record on disk.

## The assembly on disk

```text
triage/
  ASSEMBLY.md
  README.md
  skills/priority-rubric/SKILL.md
  flows/triage/
    FLOW.md
    01-classify/  STAGE.md  schema.json  before  success  failure
    02-route/     CHOOSE.md  urgent/01-urgent.md  routine/01-routine.md
    03-verify/    STAGE.md  gate/01-blocker  gate/02-sections
data/
  request-urgent.txt
  request-routine.txt
```

Run the assembly from [`examples/`](examples/) in this repository.

```sh
bot run start ./triage/triage @data/request-urgent.txt
```

## The record it leaves locally

Bot writes an ordered `record.jsonl` inside the run folder. It records stage outcomes, checks, usage, and the final exit. Use `bot run events RUN` to read it. Run records and provider sessions stay local because requests, outputs, tool results, and inherited values can contain sensitive material. The website walkthrough labels its authored record display as synthetic.

## Install

Linux with Node 22.22 or newer is the supported platform, because the checks prove it there. macOS may work and is not verified. Windows is not supported. You also need `git` and `~/.local/bin` on your `PATH`.

```sh
git clone https://github.com/botassembly/botassembly.git
cd botassembly
npm ci --prefix bot
make install
```

`make install` writes a `bot` launcher to `~/.local/bin/bot`. It does not create the home directory, so create that yourself and make it mode `0700`. A group-readable or world-readable home stops the first run with exit `5`.

```sh
export BOT_HOME="$HOME/.local/share/bot"
mkdir -p "$BOT_HOME"
chmod 700 "$BOT_HOME"
```

A run needs one intelligence named `default` in `$BOT_HOME/config.yaml`. Ask `bot model list` for a provider's local catalog, copy a provider and model pair into the file, then authenticate.

```sh
bot model list openai-codex
${EDITOR:-vi} "$BOT_HOME/config.yaml"
```

```yaml
intelligences:
  default:
    provider: openai-codex
    model: gpt-5.6-luna
    reasoning: low
```

`bot auth login openai-codex` stores a credential, and the provider's documented environment key works too. `bot home show` prints the home Bot found. The home's `config.yaml` contains its intelligence choices. [Your first assembly](https://botassembly.org/guides/first-assembly/) walks the whole path and builds a small two-stage workflow.

## Four questions

**Why not write a script?** A script can do the same work. This format standardizes the execution contracts you would otherwise invent for each one: stage ordering, input and output handoffs, acceptance checks, retry behavior, and retained evidence. Use a script for a one-off, and use an assembly when the procedure has to be reviewed, reused, checked, and diagnosed again and again.

**How does it differ from a graph library like LangGraph?** A graph library gives an application programmable orchestration, with persistence, streaming, and lifecycle control in code. Here the directory structure is the graph and stage results move through files. Choose a graph library when agent state and interruptions need programmatic control. Choose an assembly when you want a repeatable procedure your team inspects and maintains as a folder.

**What work does it suit?** Bounded jobs with inspectable intermediate artifacts and real acceptance criteria: document extraction, research synthesis, code migrations, repository review, report production. It suits a trivial single-call task poorly, and it is the wrong central coordinator for a complex customer-facing service.

**How far along is it?** Version `0.0.1`, the first public alpha. Assembly and record contracts may change before 1.0 without migrations, and 1.0 is the first promised compatibility boundary. One runtime implements the format, 143 conformance cases judge an implementation against it, and four examples ship and are checked in CI.

## Examples

[`examples/`](examples/) holds four assemblies in a ladder. Copy a folder out, point `bot` at it, and run it. Run the commands from `examples/`, where the sample requests sit in `data/`.

- [`hello/`](examples/hello/): one flow, one stage, a two-item checklist. The smallest assembly the format allows.
- [`triage/`](examples/triage/): a skill in a slot, a checklist, a JSON schema, `CHOOSE`, two gate scripts, and the `before`, `success`, and `failure` hooks.
- [`brief/`](examples/brief/): `FANOUT` over a checked JSON list, `PARALLEL` branches, a bounded `LOOP` with a gate inside it, and a flow-scoped subflow.
- [`outline/`](examples/outline/): `DESCEND` calling itself per level, a subflow an agent calls as a tool, two skills in one slot, and a `LOOP` that exits early.

## The format and the runtime

The format is a folder contract with a versioned specification and a conformance corpus of 143 cases. It is plain text on disk and it names no program. The runtime is `bot`, one implementation that reads such a folder, calls providers, and seals a record. `bot assembly check` is the seam between them, and it resolves a whole assembly without calling a model. Read [the format and the runtime](https://botassembly.org/format-and-runtime/) before anything else.

## What it is not

- **Not a sandbox.** Commands, hooks, gates, and subprocesses use your filesystem and network authority. The record retains reported direct tool calls and denied direct calls. Bot does not watch the filesystem or claim a complete list of changes. Contain an untrusted assembly with the operating system or a container.
- **No run-wide budget.** A stage carries a timeout and concurrency has a width. Nothing bounds a run as a whole: no deadline, no cost budget, no disk cap.
- **Pre-1.0.** Assembly and record contracts may change without migrations before 1.0.
- **Linux only.** macOS may work and is not verified. Windows is not supported.

## Read next

From `examples/`, run `bot assembly check ./triage/triage` and read the resolved stages. Then follow the loop `bot run start`, `bot run list`, `bot run events RUN` for the full reading, `bot run show RUN -j` for a bounded structured summary, and `bot run output RUN --raw` to copy the accepted answer.

- [The site](https://botassembly.org) holds the guides, the specification, and the runtime reference.
- [`specification/`](specification/) defines the format, and [`specification/conformance.md`](specification/conformance.md) lists the corpus.
- Development: run `npm ci` in `bot/`, then `make check` for the complete offline check. `make smoke` contacts a live provider and spends money.

[Contribution guidance](CONTRIBUTING.md), the [security policy](SECURITY.md), and the [MIT license](LICENSE) are in this repository.
