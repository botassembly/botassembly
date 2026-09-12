---
title: "Managing a home"
description: "The bot commands for what the home holds: installing, listing, and removing assemblies and runs."
sidebar:
  order: 4
---

*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*

The home is machine-managed: a person never has to know where it is or spelunk
it. The assembly commands put an assembly into
[the home](/specification/structure/#the-home), taking one out, and seeing what is there.
[Inspection](/reference/inspection/) is the lens that reads; this is the one that
writes.

It obeys the same command-line conventions: one record per line on stdout, in a
stable field order, diagnostics on stderr, and every answer read off the disk
rather than out of an index that could drift. Every command here works in one
home, and `--home DIR` names it ([the home](/specification/structure/#the-home)). There is no registry
file. The tree under `assemblies/` is the registry, and these commands only
rearrange it.

## The commands

| Command                                   | Does                                        |
| ----------------------------------------- | ------------------------------------------- |
| `bot assembly list`                       | one line per assembly the home holds        |
| `bot assembly install <source>[#subdir]`  | copies an assembly into the home            |
| `bot assembly link <path>`                | installs a working tree by reference        |
| `bot assembly update [<name>]`            | fetches an installed assembly again         |
| `bot assembly remove <name> [--json|-j]`  | takes one out through the current structured contract |

`bot assembly list` lists the assemblies in the home. The legacy assembly
listing remains a compatibility contract.

`bot assembly list` is the current structured read spelling. Its human rows
retain the output shown below. Add `--json` for a bounded version-1 document
with assembly identity, kind, provenance or link target, an opaque continuation
cursor, and a summary. The command reads no network and changes nothing. The
legacy assembly listing keeps its compatibility contract.

## Installed and linked

An assembly arrives in the home one of two ways, and the difference is visible
on disk.

**Installed** is a real directory under `assemblies/`. Its bytes are the home's
own copy: nothing outside can change what runs, and `update` is what makes it
newer.

**Linked** is a symbolic link standing at the assembly's name under
`assemblies/` — a nested name makes its parent directories real, and the link
stands at the leaf — pointing at a working tree somewhere else. The link is
the editable install — the tree the author is editing is the tree that runs,
so there is nothing to update. The
symbolic link stands at the name and nowhere else: everything inside the
resolved assembly keeps the ban ([the graph](/specification/graph/)). Removing the link is
the uninstall, and it never touches what the link pointed at.

A link whose target is not an assembly — gone, or never one — is **broken**.
`list` says so, `link` says so of the link it has just made, and a run of it
refuses `assembly-unknown` like any other name the home does not hold — never
silently skipped ([refusals](/specification/refusals/)). Nothing is recorded at link time:
the state is read at every read, so writing the `ASSEMBLY.md` afterwards makes
the link sound with no second command.

## Provenance

An installed assembly that came from somewhere remembers where, in a hidden
file at its root:

```text
review/
  .bot-source
  ASSEMBLY.md
  flows/
```

`.bot-source` holds the source on its first line and the time of the last fetch
on its second. It is hidden, so it names nothing in the graph, is not hashed,
and reaches no agent ([the graph](/specification/graph/#what-the-tree-may-contain)) — the
assembly's own entries stay closed, and provenance is metadata inside the thing
it describes rather than an index beside it. An assembly copied from a local
path records its locator root's canonical absolute real path plus any supplied
`#subdir`; update uses that stored path independent of cwd, refusing at the
stored provenance while retaining the installed copy if it is missing or no
longer an assembly. One written by hand has no `.bot-source` and nothing to
fetch.

### `bot assembly list`

One line per assembly, in name order, nested names included:

```text
review       installed  from https://github.com/acme/bots#review  updated 2026-08-01T09:12:44.000Z
team/triage  installed  local copy
dev-bot      linked  -> /home/ada/code/dev-bot
old-bot      linked  -> /home/ada/code/gone  BROKEN
```

Exit is `0` when the home holds assemblies and `1` when it holds none, and the
`1` says so on stderr rather than saying nothing — as does an `update` with no
name in a home with nothing to update ([inspection](/reference/inspection/)).

### `bot assembly install`

Copies an assembly into the home. The source is a local path or a git URL; a
`#subdir` names a folder inside it, which is how one repository holds several
assemblies. Its real path is checked to stay within the source root:

```sh
bot assembly install ./review-bot
bot assembly install https://github.com/acme/bots#review
```

This is the current structured install command. Its human success line retains
the assembly name and source shown here. Add `--json` for one bounded version-1
`bot.assembly.install` result with the assembly name, `installed` kind, and
`changed: true`. A refusal in JSON mode is structured and never reports changed
state.

A source that exists on disk is copied from where it is. Anything else is a git
URL and is handed to git, which is what decides whether it is one — a local
repository is cloned rather than copied by naming it `file:///path/to/bots.git`.

A git source is fetched by running the `git` binary — a shallow clone into
scratch, the named folder copied out, the clone discarded. That is the only
place in this format where git is involved at all: nothing a run does touches
it. Where there is no `git` to run, the install refuses and says to install it.

The name is the last path segment of the source — `…/bots#review` is `review`. For a local source spelled `.` or `./`, the name is the basename of the resolved current directory. A `#subdir` still names the folder inside the source. `--name` overrides the default, which is how one repository is installed twice or a name is nested (`--name team/triage`). A name the home already holds is refused, never overwritten: uninstall is a verb, and it is spelled `remove`.

Only an assembly is copied. A source with no `ASSEMBLY.md` at its root — a
folder that is not one, a file, a `#subdir` that is not one — is refused
`assembly-unknown` ([refusals](/specification/refusals/)), and an install that refuses for
any reason leaves the home exactly as it found it: nothing at the name, no
namespace directory it would have needed, no home it would have had to make.
It materializes beside the requested name and renames only after its copy and
provenance are complete, so an interrupted copy publishes no partial assembly
at that name. The copy admits the selected root even when its basename starts
with `.`, and omits every descendant whose basename starts with `.`. The same
rule applies to local sources, Git sources, and updates. `bot` then writes one
root `.bot-source` in staging. Visible file bytes and executable bits remain
unchanged. An install freezes a copy, so what it puts at a name cannot
become an assembly later the way a link's target can; that is why a broken link
is marked and this is refused.

### `bot assembly link`

Installs a working tree by reference rather than by copy: the link is made at
the name, and from then on the tree being edited is the tree that runs. The
same naming and collision rules apply.

```sh
bot assembly link ~/code/dev-bot
```

This is also a current structured command. Its human success line retains the
name, resolved target, and any `BROKEN` mark. Add `--json` for one bounded
version-1 `bot.assembly.link` result with the assembly name, `linked` kind, and
`changed: true`. It reads no network.

While developing, use `link` to expose later source edits to the next run. Use `install` to make a fixed copy. Use `update` to refresh that copy. Repeating `install` for a name the home already holds refuses and keeps the first copy.

### `bot assembly update`

Fetches an installed assembly again from the source its `.bot-source` records,
and replaces the installed copy with a rename once the new copy is complete, so
a fetch that fails leaves what was already installed intact. Given a name it
updates that one; given none it updates every assembly that has somewhere to
fetch from.

This is a current structured command. Its human lines retain the result of each
attempt. Add `--json` for one bounded version-1 `bot.assembly.update` result
with ordered per-assembly outcomes. A batch stops at the first failure, exits
nonzero, and still reports each earlier success. Bot refuses an oversized
batch before it fetches or replaces anything.

A linked assembly is already live and says so. An assembly with no
`.bot-source` — written by hand, or copied in by some other means — has no
source to fetch, and updating it by name refuses rather than guessing. A source
that is no longer an assembly is refused the way `install` refuses it, and the
installed copy stays.

An update interrupted partway leaves its copy beside the assembly under a
hidden name, and nothing sweeps it: after an interruption that copy may be the
only one of that assembly there is.
`bot run list` names retained runs. `bot home show` names the selected home.
Updating the assembly again reclaims them; where the assembly itself is not
standing, putting one back under its name is a person's move.

### `bot assembly remove`

Removes the copy, or removes the link. It never removes what a link pointed at:
the working tree belongs to the person who was editing it, and the home only
ever held a reference to it.

This is the current structured remove command. Its human success line retains
the assembly name. Add `--json` for one bounded version-1
`bot.assembly.remove` result with the assembly name, the prior `installed` or
`linked` kind, and `removed: true`. Missing, unsafe, and in-use targets return
structured refusals in JSON mode.

Before deleting the target, Bot records a hidden removal intent and atomically
moves the target to an identity-bound hidden quarantine inside the home. A
copied removal can be interrupted after deleting any part of that quarantined
copy, including `ASSEMBLY.md`. A later remove of the same name verifies the
quarantined target against the intent and continues. A same-name install
refuses while that intent remains. If namespace or intent cleanup was
interrupted after deletion, the later remove finishes it. Bot reports success
only after the quarantined target and its newly empty namespace are gone.
One removal owns destructive settlement across the home until quarantine and
namespace cleanup finish. A concurrent removal reports a retryable busy
failure and never shares those steps. The completed intent remains durable
until the owner releases its lock successfully. Removing that marker afterward
is idempotent, so a release or cleanup failure and a crash can be retried. A
crashed owner releases its claim through the same bounded stale-lock rule used
for live runs. Bot reports success only after the marker is also gone.

A replacement that reaches the public target after the move remains there. A
replacement that wins the move race fails identity verification and remains in
quarantine; Bot never deletes it or reports success. Direct same-account
changes to Bot's hidden intent and quarantine entries are outside this
coordination boundary, as are direct changes to every other home-owned file.
Malformed hidden removal state is a nonretryable integrity failure for remove,
install, and link. Creation never describes persistent corruption as a
retryable source or filesystem failure.

## While a run of it is going

An assembly with a run of it still going is not swapped or taken out of the
home. Named on such an assembly, `update` and `remove` refuse and say to wait; a
run that died holds nothing, and neither does one that ended
([the runtime](/specification/running/#liveness)).

`remove` refuses for a linked assembly as well as an installed one. A run reads
its own copy and not the link ([the record](/specification/record/#what-is-kept-beside-it)),
so nothing in flight breaks; the refusal keeps the home's account of the run
instead — while a run is going, the name goes on naming what that run is a run
of, and whatever is put there next is a different assembly under it. `update`
has nothing to guard there, because updating a link was never more than a no-op.

`update` with no name is a report rather than a demand, and answers here the
way it answers an assembly with nowhere to fetch from: the one in use gets a
line saying so, and the walk goes on. Refusing partway would be worse than
saying nothing — the assemblies earlier in name order would already have been
replaced, and their lines would go unsaid.

Live means the run still holds its lock, which is a comparison of timestamps
([inspection](/reference/inspection/#bot-run-list)) and can be briefly wrong after a
machine sleeps. So this is not a lock a person can lean on: it can refuse a
removal that was in fact fine, and the answer is to look at `bot run list` and try
again. Refusing is the safe direction of a wrong answer — the other direction
takes an assembly out of the home while a run of it is still going.

## What a runtime has to provide

- A list read from the tree, distinguishing installed from linked, and naming
  a broken link as broken.
- Installation by copy, from a local path and from git, without a git library,
  refusing a source that is not an assembly and leaving the home unchanged
  where it refuses.
- Provenance for what it fetched, recorded where the assembly's entries stay
  closed.
- Removal that takes back only what installation put there.
- A refusal from `update` and `remove` named on an assembly a live run holds,
  read the same way `bot run list` reads it, and a reported line rather than a
  refusal where `update` was given no name.

A runtime that cannot fetch from git still lists, links, and removes; it says
so where the fetch would have been.
