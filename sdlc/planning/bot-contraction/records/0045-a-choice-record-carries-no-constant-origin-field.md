---
flow: quickfix
priority: 7
completed: 2026-09-06
---
# A choice record carries no constant origin field

## Result

New `chose` events record the selected alternative, declined alternatives, and reason. They no longer carry the constant `via: "body"` field. Retained records may still carry any additive `via` value without assigning it current meaning. Request and FANOUT origin fields did not change.

The current specification, event schema, conformance statement, changelog, and writer now agree. ADR 0008 keeps its historical design and marks the retired chooser vocabulary as superseded. Production source fell from 15,106 to 15,104 nonblank lines.

## Review and red-green evidence

The red runtime proof showed that every real CHOOSE outcome wrote `via: "body"`. The green proof runs CHOOSE through the flow runner and requires the field to be absent. The event-shape proof accepts arbitrary retained additive values without a hidden `via` validator.

Design review required explicit compatibility semantics before accepting the ticket. Independent code review accepted the implementation without findings. It confirmed that the current constructor and field ledger omit `via`, retained records remain readable, and unrelated request and FANOUT fields remain intact.

## Checks

Focused tests passed 23 tests across five files. Focused lint and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 204 Bot test files, 1,349 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the lowered 15,104-line production ratchet.
