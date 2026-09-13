---
flow: build
priority: 8
completed: 2026-09-05
---
# Capabilities reports the implemented CLI

## Result

`bot capabilities` now reports the new command surface compiled into the executable. The initial result contains exactly `capabilities` and `run.list`. It excludes planned commands and legacy spellings.

People receive bounded Markdown by default. Programs receive one versioned `bot.capabilities` JSON document through `--json` or `-j`. Each command reports its operation, command words, output contract, modes, options, enforced limits, home behavior, mutation behavior, and network behavior. Both complete forms have a 65,536-byte ceiling.

One data-only descriptor inventory supplies new-command recognition, help facts, and capability output. A typed handler map must cover every descriptor. The run-list descriptor imports the parser's fields, states, causes, page bounds, filter bounds, cursor bounds, warning bounds, and output bounds instead of copying them. Existing legacy dispatch and rendering remain unchanged.

Capability discovery accepts only one optional JSON mode flag. Malformed arguments use the common structured or inert human error. The command reads no Bot home and contacts no provider.

## Review and red-green evidence

The first focused test failed because no compiled capability contract existed. The implementation added a two-operation descriptor inventory, a typed dispatcher, bounded renderers, and shared new-surface error handling.

Independent code review found that JSON reported command-wide limits while Markdown omitted them. A red test now checks every compiled limit in the human result. A deterministic limits table closed the gap.

Tests also mutate descriptors, parsers, help, and handlers independently. They reject duplicate operations, duplicate command paths, duplicate options, incomplete inventories, unknown network behavior, and oversized results. Real CLI tests prove that planned and legacy commands never appear and that an absent home or a failing provider boundary cannot affect capability discovery.

## Cost and deferred work

Production source grew from 14,210 to 14,450 nonblank lines. The 240-line increase provides the compiled descriptor inventory, capability renderers, typed new-command dispatch, and common new-surface result handling. Capability filtering remains deferred because two command rows do not justify another query language.

The remaining noun commands will enter the inventory only when their executable behavior lands. Caller migration and legacy deletion remain later work.

## Checks

The complete gate passed all 195 test files and 1,254 tests, including 143 of 143 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 14,450-line source ratchet, specification checks, and `git diff --check` passed.
