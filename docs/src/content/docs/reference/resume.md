---
title: "Resuming a run"
description: "Where to read what bot run resume accepts and what a carried prefix is."
sidebar:
  order: 2
---

*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*

`bot run resume RUN` starts a **new** run from an old one. It never resumes the
donor process and it never restores the donor's environment. It carries the
stages that already succeeded and runs everything after them fresh.

The specification states the rules:

- [Resuming a run](/specification/running/#resuming-a-run) explains which donor runs are accepted, what `bot run resume` accepts, and what a carried prefix is.

The command line itself is [Invoking a run](/reference/invocation/).
