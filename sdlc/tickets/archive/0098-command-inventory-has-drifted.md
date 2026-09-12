---
flow: build
priority: 5
---
# Command inventory has drifted

Promoted 2026-08-21 from `sdlc/issues/0098-command-inventory-has-drifted.md`
(severity should-fix, filed by the 2026-08-20 observability review).

Command names are maintained separately by the dispatcher
(`bot/src/cli.ts:264-280,364-380`), the help screens
(`bot/src/help.ts:299-307`), and the unknown-command usage. The
fallback usage already omits the implemented `request` command, so
the inventories contradict each other today.

Done, observably: one inventory is authoritative — the dispatcher,
the help screens, and the unknown-command usage all agree with it,
`request` appears wherever commands are listed, and a test fails
whenever a command exists in one surface and not another. Whether
that is a shared metadata table or a tested authoritative list is
the design's choice.
