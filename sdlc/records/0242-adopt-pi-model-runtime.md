---
base: 715f43e7b1efeb5b0f3d5aa5654f330952738f98
head: 8659844f77f75f3ad6203bb350fb63182ec2931c
---

# Adopt the Pi model runtime boundary

ADR 0030 makes Pi's public `ModelRuntime` the future owner of providers, models, availability, request preparation, and authentication behavior. Bot will use only the public package-root exports `ModelRuntime` and `getAgentDir`. Bot will not load Pi extensions, deep-import `AuthStorage`, or use the public lockless one-off credential reader.

The decision accepts Pi's live parent-process environment, provider-owned file probes, declarative `models.json`, and supported `auth.json` as trusted operator inputs. Shell-backed configuration runs with the Bot process owner's authority outside stage `access` rules. Bot will keep scrubbing Pi's known built-in credential environment names. Bot cannot promise that it discovers arbitrary environment names introduced by local configuration. Operators must not reference a value there that an assembly process must not inherit.

Ticket 0245 must refuse an existing unsafe Pi agent directory or auth file on POSIX systems. Bot will not silently repair its owner, type, or permissions. Pi retains credential content, locking, mutation, and OAuth refresh. Every live Bot credential consumer must use the shared `ModelRuntime` path.

The staged decision preserves current behavior until each implementation lands. Ticket 0243 permits and exact-pins the coding-agent package. Ticket 0244 adopts Pi's model and configuration boundary while injecting Bot's current credential store. Ticket 0245 changes the live credential file after preflight and explicit import exist. The old ADR status headers state the same milestones.

Independent design review rejected the initial short draft because it omitted the public API limits, ambient authentication behavior, arbitrary configuration secret boundary, unsafe existing-file behavior, exact ownership, network rules, staged migration, superseded clauses, proof, and complexity. The accepted level-4 design records those decisions and their costs. Sol Medium implemented it. Independent code review rejected one Pi behavior claim. Safe reproductions proved that `models.json` command values use uncached resolution and can run again, while `auth.json` command-backed keys use a process-lifetime cache. Both paths have a ten-second command limit. The ticket and ADR now state that distinction exactly. The second review accepted the full patch.

The primary local `make check` passed with 81 repository tests, 1,563 runtime tests across 218 files, 143 conformance cases, all static checks, and the unchanged 16,582-line source ratchet. GitHub Actions runtime run `34551005976` and documentation run `34551006002` passed on commit `8659844`. The design-only runtime run `34549389814` also passed.

Ian can overturn the ambient-input, trusted-configuration, network, permission, or migration decisions before their implementation ticket lands. Reversal after ticket 0245 would require a new credential owner and migration contract.
