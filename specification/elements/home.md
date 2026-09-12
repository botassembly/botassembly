# The home

> **Stability: stable.**

The home is the directory a runtime keeps everything durable in; scratch lives
in a cache the runtime owns ([slots](slots.md)).

```text
$BOT_HOME/
  installation.json
  config.yaml
  assemblies/
    review/
      ASSEMBLY.md
      flows/
  runs/
    2026-07-30T14-22-08-a3f9/
```

`$BOT_HOME` if it is set, otherwise `${XDG_DATA_HOME:-~/.local/share}/bot`.
A `--home` given on the command line names the home directly and wins over
both.

A first `bot run start` creates the home's installation identity before run birth when the record is absent. A first `bot run resume` does the same after it accepts the donor and before it creates the new run. Concurrent first runs use the one identity that wins atomic publication. A run leaves an existing valid identity unchanged. An invalid record refuses the run without repair before provider contact, run-directory creation, `run_start`, or id-file publication.

`bot home show --home DIR` reads the installation identity without mutation. It requires the explicit option and ignores `BOT_HOME` and the platform default. Markdown is the default. `--json` and `-j` return a newline-terminated version-1 `bot.home.show` document. Each result occupies at most 4,096 UTF-8 bytes. An absent show succeeds with `initialized: false` and creates nothing.

`installation.json` is an owner-only (`0600`) regular file in an owner-only (`0700`) real home directory. It contains one canonical newline-terminated version-1 `bot.installation` object of at most 1,024 bytes with one lowercase UUID version 4 identity. Bot refuses malformed, linked, oversized, non-private, wrong-owner, changed, or unsupported records without repair. Bot resolves the real parent and uses canonical pathnames for safe filesystem operations. It opens final objects without following links, compares pathname and descriptor identities, and revalidates the parent and home before and after reads and mutations. A missing home or record produces the absent reading only after the containing objects still validate. Bot detects pathname replacement that these checks observe. The local same-Unix-account trust model excludes an actor that races replacement of an intermediate ancestor. Initialization synchronizes the held parent before it publishes a complete candidate through create-if-absent linking. It then removes its exact private temporary name and synchronizes the held home. Concurrent initializers return the published winner. A non-`EEXIST` link rejection is retryable when finalization succeeds and never claims possible publication. Cleanup, synchronization, and close failures return an integrity failure. They retain the publication-may-have-completed diagnostic only after a successful link. Moving a valid home preserves the identity. A copy preserves it only when bytes, ownership, and modes remain intact. Bot provides no reset command.

That is the whole of the resolution, and the omissions in it are deliberate.
Runs are state and `config.yaml` is configuration, so a strict reading of the
XDG directory specification would put them under `$XDG_STATE_HOME` and
`$XDG_CONFIG_HOME`; they live in the home instead. The home is ONE folder
holding everything bot owns — what a person backs up, copies to another
machine, points a second bot at, or deletes to be rid of it — and three
directories that must be kept in step are three ways for a home to be half
there. `--home` names all of it or none of it, which is what makes a throwaway
home a single argument. Three things are NOT in it. Scratch is out for a reason
of its own: it is a cache, and no slot value may disclose where runs live
([slots](slots.md)). Credentials are out for the opposite reason to everything
that is in — a login belongs to the operator, where a home is a workspace, and
repeating a login per project is not a thing a person should have to do. They
live in `auth.json` under Pi's resolved agent directory, whose default is
`~/.pi/agent/auth.json`, with the directory at mode `0700` and the file at mode `0600`; `--home` does not move them and no
bot-named variable points at them ([authentication](/reference/auth/)).

## What is in it

**`assemblies/`** holds assemblies by name. A name is a relative path under
this directory — `review`, or `team/review` — and that is the whole of the
registry: no index file to keep in step, no duplicate-name validation, nothing
to drift ([the assembly](assembly.md),
[invocation](invocation.md#naming-the-assembly)).

An entry standing at an assembly's name under `assemblies/` may be a symbolic
link to a directory; a nested name makes its parent directories real, and the
link stands at the leaf.
The link is the editable install — deleting it is the uninstall, and the tree
it points at is never touched — and everything inside the resolved assembly
keeps the symlink ban ([the graph](graph.md)). What ran is still answerable,
because the record hashes the bytes it read, not the path it read them through
([the record](record.md)). The commands that make and unmake these entries are
[management](management.md).

**`runs/`** holds one directory per run — its record and its sessions
([the record](record.md), [the session](session.md)). This is data with a
retention policy, where an assembly is source somebody wrote. A run in flight
also has a lock beside its directory, named for it; the lock is the runtime's
rather than the run's, and it leaves when the run does
([the runtime](runtime.md#liveness)).

**`config.yaml`** holds loose non-model defaults and the named model choices a
run can use.

```yaml
timeout: 3600
retries: 2
local-context: ignore
intelligences:
  default:
    provider: anthropic
    model: claude-opus-5
    reasoning: medium
  coder-hard:
    provider: anthropic
    model: claude-fable-5
    reasoning: xhigh
```

It is a strict plain YAML file. Its loose keys are `timeout`, `retries`, and
`local-context`; model choice is present only in `intelligences`. Retired loose
model-choice keys and unknown keys are refused (`key-unknown`).

### Intelligences

`intelligences` is a flat table of complete model choices by name. Every row
requires `model` and `reasoning` (`key-missing`); `provider` is optional, and
any other bundle key is refused (`key-unknown`). Nothing in a bundle is a
credential.

The name is an option at the command, task, stage, container, flow, or assembly
rung. The nearest name supplies provider, model, and reasoning as one bundle.
When none is named, an executing agent looks up the reserved name `default`.
That implicit name and its bundle are stamped `home`; an explicitly authored
`intelligence: default` keeps its authored rung. A missing row is refused as
`intelligence-unresolved` only when an agent needs it.

A providerless bundle uses normal model lookup. If more than one configured
provider offers the model, the run is refused as `model-unresolved` naming the
candidates. A run snapshots the table at start and records the resolved name
and complete bundle without exposing the name in an agent prompt.

The home and each run directory are created owner-only (`0700`), like `~/.ssh`.
Nothing inside is made private separately — the directories close the tree — and
a home that already exists is left as it stands. The scratch tree is created the
same way, at its root: it holds the same prompts, inputs and outputs the run
directory holds, so it is closed by the same door ([slots](slots.md)).

A home that does not exist is an empty rung, not an error. Nothing resolves
from it, and nothing complains until a run needs what only it could have
supplied.

## What inherits from it

The home is the bottom rung. Every value resolves from the most specific place
that sets it ([invocation](invocation.md#options-and-where-they-resolve)):

```text
command line → task file → stage → container → flow → assembly → home → built-in default
```

The task-file rung is defined in [Invocation](invocation.md#the-three-ways-to-give-a-request).

An assembly names an intelligence, never a literal model. The home maps that
portable name to local machinery. An omitted name uses the reserved `default`
row only when an agent needs a model choice.

## The agent never learns it exists

No slot points into the home. The agent is not told where assemblies live, where
its own assembly lives, or that other assemblies exist at all
([invariants](invariants.md)). A stage's input, output, scratch, and skills are
named for it, and the tree it works in is somewhere else entirely
([slots](slots.md)). A caller's `$BOT_HOME` is the runtime's to read and never
the agent's to see: it is the runtime's own bot-named variable scrubbed from
every stage's environment. Provider credential environment names consumed by
the parent are scrubbed too, and a stage's shell holds that environment whole —
what the runtime composed, with nothing of the runtime's own process beneath it.

A `~` at the front of a path an agent hands a file tool is refused for the same
reason: it is shorthand for a directory the agent was never told about. That is
obscurity and not prevention, like everything else here
([invariants](invariants.md)) — a path written out in full still reaches
wherever the operating system allows.
