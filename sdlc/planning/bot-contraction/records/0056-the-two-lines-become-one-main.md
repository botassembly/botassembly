---
flow: build
priority: 10
completed: 2026-09-06
---
# The two lines become one main

## Result

Main and the manual branch `manual/bot-contract-2026-09-04` are one line again. The merge commit `dc9ab39a` has main at `1dd1d4d1` and the branch at `130a7455` as parents, so no pushed commit was rewritten. Tickets 0038 through 0054 of this workstream now sit on main beside the installation identity ticket that a second writer landed on main in parallel under the same number 0038. That ticket is renumbered 0055 in its record, the workstream README, the identity design, the specification changelog, and the fixture comment its own test pins.

Six files conflicted and each was resolved as the union of both sides in writer order. The `run_start` field set carries both `installation_id` and `runtime_tree_sha256` in the shape test, the record chapter's field table, and the provenance test. The conformance statement keeps main's identity items and the branch's `SUBFLOWS` and CHOOSE items. The workstream README keeps both lines' checkpoint paragraphs and the branch's completed item 3.

From this ticket on, the workstream commits on main. The README carries the rule.

## Why two commits

The size-decision check compares a commit with its first parent and requires exactly one changed record when the ceiling rises. A merge of two lines that each added records cannot satisfy that in one commit. The merge commit therefore keeps main's ceiling and fails only the ratchet rung, and this record's commit raises the ceiling with the one decision the check reads. With one main there is no further merge to repeat this.

## The per-file cap

The union merge left `bot/src/run.ts` at 404 nonblank lines and `bot/tests/record-event-shape.test.ts` at 407, over the 400-line `max-lines` rule. Ian ruled on 2026-09-06 that the rule goes (final cleanup plan, decision 3), because the exact total ratchet and the size decision already bound growth and the cap had been producing splits made for the cap. This commit removes the rule instead of splitting two files to satisfy it. Draft 0215 keeps the second half of that ruling, folding the micro-modules the cap produced back into their owners.

## A prose-pinning test

`bot/tests/pi-boundary-decision.test.ts` from ticket 0053 asserted that the retirement ledger still said the compatibility layer must be deleted before the first release. Ian withdrew that sentence on 2026-09-06 (final cleanup plan, decision 1), so the test failed on the merged tree while proving nothing about the runtime. This commit deletes it under the same ruling that draft 0216 carries for the other two prose-pinning tests.

## Checks

The complete root `make check` passed on the merged tree with the ceiling raised: 19 project tests, 208 Bot test files, 1406 Bot tests, 143/143 conformance cases, and 96.39 percent line coverage across all production modules. Type checking, the lint rules and probes, the catch budget, dead-code analysis, cycle detection, dependency pins, the specification gate, the size decision, and the exact 15,644-line ratchet passed. The merge commit itself fails only the ratchet rung, by design of the two-commit landing.

## Size decision

- Starting production size: 15535 nonblank lines
- Ending production size: 15644 nonblank lines
- Simpler approach tried: A merge adds no code of its own. The raise is the sum of two lines that each carried their own size decisions: the branch's tickets 0038 through 0054 and main's identity ticket.
- Why insufficient alternatives were rejected: Rebasing either line would rewrite pushed commits. Dropping either line would discard reviewed, checked work.
- Production code deleted: None in the merge. The two lines' changes to `record-events.ts` and `run.ts` were checked for duplication and add different fields.
- Accepted cost: 109 nonblank lines above main and 429 above the branch, all previously decided. The identity module's excess is scheduled for removal in the next ticket, from draft 0213.
