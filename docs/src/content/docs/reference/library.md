---
title: "Library reference"
description: "The seven supported ESM package paths, their returned documents, and their pre-1.0 compatibility rule."
---

The installed `bot` package is ESM and runs emitted JavaScript on Node 22.22 or newer. The repository launcher runs TypeScript source from a checkout. Consumers import only the seven paths in this table.

| Package path | Reading surface | Command documents |
| --- | --- | --- |
| `bot/admin-readings` | six administrative command readings | `assembly.check → bot.assembly.check@1`; `assembly.list → bot.assembly.list@1`; `capabilities → bot.capabilities@1`; `home.busy → bot.home.busy@1`; `home.show → bot.home.show@1`; `intelligence.list → bot.intelligence.list@1` |
| `bot/inspection` | lower-level inspection readings | no command-document schema |
| `bot/mutation-readings` | nine mutating command readings | `assembly.install → bot.assembly.install@1`; `assembly.link → bot.assembly.link@1`; `assembly.remove → bot.assembly.remove@1`; `assembly.update → bot.assembly.update@1`; `auth.import → bot.auth.import@1`; `auth.login → bot.auth.login@1`; `auth.logout → bot.auth.logout@1`; `run.resume → bot.run.result@1`; `run.start → bot.run.result@1` |
| `bot/one-run` | one run reading | `run.session → raw` |
| `bot/record-lines` | lower-level record readings | no command-document schema |
| `bot/run-readings` | six structured and three raw run readings | `run.check → bot.run.check@1`; `run.checklist → bot.run.checklist@1`; `run.events → bot.run.events@1`; `run.list → bot.run.list@1`; `run.output → raw`; `run.record → raw`; `run.request → raw`; `run.search → bot.run.search@1`; `run.show → bot.run.show@1` |
| `bot/session` | lower-level session readings | no command-document schema |

Before 1.0, package paths, exported names, parameters, return types, declarations, and returned document schemas may change or disappear without migration. Pin the exact package version or source revision. Schema versions distinguish documents within the matched runtime publication. A document marked `@1` does not promise compatibility with a later pre-1.0 package. Version 1.0 is the first promised cross-version boundary.

Every structured operation in the table exports two forms through its listed path. A function ending in `Reading` returns the command's exact exit, standard output, and standard error bytes. The matching function ending in `Document` runs that byte reading once in JSON mode and returns `DocumentReading<D>`. Its `document` arm carries the operation's exact version-1 success type. Its `error` arm carries the common `ErrorDocument`. Both arms retain the original command result in `command`.

A valid command document stays in the `document` arm even when its exit is nonzero. Command refusals stay in the `error` arm and do not throw. Invalid JSON, the wrong operation or schema version, and a stream layout that the command cannot produce reject as a library invariant failure. Login preserves opaque provider interaction on standard error. Login and logout preserve their documented post-mutation synchronization result on both streams. The four raw operations have byte readings only.

The package does not promise CommonJS `require`, undeclared subpaths, direct `dist` or `types` subpaths, source files in the package, source maps, npm-registry publication, parsed raw artifacts, or compatibility with TypeScript versions other than the pinned 5.9.3 check.
