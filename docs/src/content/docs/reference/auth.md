---
title: "Authentication"
description: "Where to read the bot authentication commands and the credential file they write."
sidebar:
  order: 6
---

*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*

Credentials belong to the machine. The authentication commands are the only part of the runtime
that writes them, and it never prints one. The specification states the whole
contract:

- [Authentication](/specification/running/#authentication): the credential file and why `--home` is refused here.
- [The commands](/specification/running/#the-commands): `bot auth list`, `login`, `logout`, `import`.
- [The listing](/specification/running/#the-listing): one line per provider and what its standing means.
- [Logging in](/specification/running/#logging-in): the provider runs its own sign-in.
- [The laws](/specification/running/#the-laws): nothing here prints a credential.

The everyday recipe is [Operating runs](/guides/install-and-use/#credentials).

`bot auth list` is the current bounded read command. It accepts `--offset` and
`--limit`, with a default page of 50 providers and a maximum of 200. Human
output reports provider, method, and state, then the shown and total counts.
`--json` and `-j` return one version-1 `bot.auth.list` document with rows, page
facts, and summary counts.

Rows expose only provider identity, the closed `login`, `key`, or
`ambient-only` method, the closed `stored` or `unobserved` state, and stored
credential type. Stored public metadata is the only safe evidence in Pi
0.85.1. Every provider without it is `unobserved`. Unobserved does not mean
unavailable. The command never asks Pi for provider authentication status. It
omits credential values and Pi's free-text status label. It does not resolve
ambient secrets, probe provider files, run provider commands, refresh, mutate,
or use the network.

The current `bot auth login PROVIDER` route keeps provider prompts and notices
on standard error. Its JSON success reports only the canonical provider and
whether Pi returned an API-key or OAuth credential. The specification defines
its interaction limits and its truthful nonzero result when persistence
succeeds but local synchronization fails.

The current `bot auth logout PROVIDER` route invokes Pi's idempotent delete for
the exact provider without first listing credentials. Human output reports one
bounded completion sentence. JSON reports only the canonical provider and
`result: "completed"`. Completed means the delete transaction settled. It does
not claim that a credential existed or that ambient authentication is disabled.
A post-delete synchronization failure preserves that truthful result, reports a
non-retryable error, and exits nonzero.
The dedicated logout runtime validates the Pi directory and authentication file,
then creates Pi's runtime with the live authentication path, no model file, no
creation refresh, and model network disabled. Pi owns parsing, locking, deletion,
and typed post-delete synchronization. Bot performs no credential read,
availability check, or provider refresh before deletion, so a stored command is
never evaluated on the way to logout.

`bot auth import SOURCE [--json|-j]` copies one complete compatible retired
Bot credential map into missing or empty Pi authentication. It never merges or
overwrites credentials, changes or deletes the source, resolves credential
values, or uses the network. It preserves every source byte after validating
the map and reports only whether an import occurred and the provider count.
Both stores must meet the owner-only file and directory checks described by
the command help. Import serializes with Pi authentication writers and reports
its own bounded result or failure instead of the generic retired-store warning.
