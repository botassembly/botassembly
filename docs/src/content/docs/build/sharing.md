---
title: "Sharing an assembly"
description: "Put an assembly in the home, link the one you are editing, and hand a finished one to a teammate."
---

An assembly reaches a teammate the way code does. `bot` copies one into the home, links one you are editing, and takes either back out.

The home is the directory where `bot` keeps installed assemblies and run records. You never have to look inside it. These commands are the only things that write to it, and `bot assembly list` always says what is there.

## The commands

| Command | Does |
| --- | --- |
| `bot assembly list` | one line per assembly the home holds |
| `bot assembly install <source>[#subdir]` | copies an assembly into the home |
| `bot assembly link <path>` | installs a working tree by reference |
| `bot assembly update [<name>]` | fetches an installed assembly again |
| `bot assembly remove <name>` | takes one out |

Every one of them accepts `--home DIR` to name a different home, and `--json` for one bounded structured result.

## While you are still writing it

You do not have to install anything to start. Point the command at the folder. A target beginning with `/`, `./`, or `../` is a path rather than a name in the home, and the last segment is still the flow.

```sh
bot assembly check ./triage/triage
bot run start ./triage/triage @data/request-urgent.txt
```

Once you run it often, link the checkout so the name works from anywhere.

```sh
bot assembly link ~/code/triage
bot assembly check triage/triage
bot run start triage/triage @data/request-urgent.txt
```

A link is read fresh every time, so an edit is live for the next run. Only the next one. A run copies the whole assembly when it starts and executes that copy from beginning to end. Editing a later stage while an earlier one is working changes nothing about the run in flight. Save, then start a run.

## Installed and linked

An assembly arrives in the home one of two ways, and the difference is visible on disk.

**Installed** is a real directory under the home's `assemblies/`. Its bytes are the home's own copy. Nothing outside can change what runs, and `update` is what makes it newer.

**Linked** is a symbolic link standing at the assembly's name, pointing at a working tree somewhere else. The tree the author is editing is the tree that runs, so there is nothing to update. Removing the link is the uninstall, and it never touches what the link pointed at.

A link whose target is gone, or was never an assembly, is broken. `list` marks it `BROKEN`, and `link` marks the line it prints when you make such a link. A run of it refuses `assembly-unknown`, the same way any name the home does not hold refuses. Nothing is silently skipped.

Never symlink or copy folders into the home by hand.

## Installing

The source is a local path or a git URL. A `#subdir` names one folder inside the source, which is how one repository holds several assemblies. The four shipped examples live in one repository, so each is named that way.

```sh
bot assembly install ./triage
bot assembly install https://github.com/botassembly/botassembly#examples/triage
```

```text
triage  installed  from ./triage
```

The name is the last path segment of the source. `--name` overrides it, which is how one repository is installed twice or a name is nested, as in `--name team/triage`. A name the home already holds is refused and the first copy is kept.

A source that exists on disk is copied from where it is. Anything else is handed to `git`, which decides whether it is a URL. A git source is fetched with a shallow clone into scratch, the named folder is copied out, and the clone is discarded. Where there is no `git` to run, the install refuses and says to install it.

Only an assembly is copied. A source with no `ASSEMBLY.md` at its root is refused, and the home is left exactly as it was found.

```text
assembly-unknown  ./data
  Name an assembly; what is there is not one.
```

Entries whose names start with `.` are omitted from the copy. `bot` then writes one `.bot-source` file at the root holding the source on its first line and the time of the last fetch on its second. That file is hidden, so it names nothing in the graph, is not hashed, and reaches no agent. An assembly written by hand has no `.bot-source` and nothing to fetch.

## Seeing what you have

```sh
bot assembly list
```

```text
triage  installed  from /home/ada/code/examples/triage  updated 2026-09-14T11:17:33.145Z
```

One line per assembly, in name order, nested names included.

## Updating and removing

```sh
bot assembly update triage
bot assembly remove triage
```

`update` fetches from the source `.bot-source` records and replaces the installed copy once the new copy is complete. A fetch that fails leaves what was already installed intact. Given no name it updates every assembly that has somewhere to fetch from, and a batch stops at the first failure while still reporting each earlier success.

A linked assembly is already live and says so. An assembly with no `.bot-source` has no source to fetch, and updating it by name refuses rather than guessing.

`remove` removes the copy, or removes the link. It never removes what a link pointed at. The working tree belongs to the person who was editing it.

An assembly with a run of it still going is not swapped or taken out. Named on such an assembly, `update` and `remove` refuse and say to wait. Liveness is a comparison of timestamps and can be briefly wrong after a machine sleeps, so a refusal here can be wrong in the safe direction. Look at `bot run list` and try again.

## Handing it over

Push the assembly to your team's repository. A teammate runs `bot assembly install <url>#<folder>` and gets a copy. There is no export step, because there was never an import step.

Two rules keep this honest. The record never lies about what ran, what was judged, and what it cost. Secrets never go in any assembly file.
