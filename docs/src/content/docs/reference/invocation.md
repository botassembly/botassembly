---
title: "Invoking a run"
description: "Where to read the bot run argument grammar, its flags, and how a run starts."
sidebar:
  order: 1
---

*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*

`bot run` starts a run. The assembly and flow are one argument, the request is
the next:

```sh
bot run start ./triage/triage @data/request-urgent.txt
```

The specification states the grammar and every flag:

- [The three ways to give a request](/specification/running/#the-three-ways-to-give-a-request): a string, an `@` task file, piped input.
- [Naming the assembly](/specification/running/#naming-the-assembly) and [running the assembly](/specification/running/#running-the-assembly).
- [Where the work happens](/specification/running/#where-the-work-happens): what `--in DIR` means.
- [Declared slots](/specification/running/#declared-slots): an assembly's own long options.
- [Options and where they resolve](/specification/running/#options-and-where-they-resolve): the four option flags.
- [Run id file](/specification/running/#run-id-file): `--id-file PATH`.

Starting from an older run is [Resuming a run](/reference/resume/).
