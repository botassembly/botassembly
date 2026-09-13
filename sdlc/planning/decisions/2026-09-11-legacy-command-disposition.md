# Legacy command disposition

Date: 2026-09-11

## Decision

Bot will build current commands for two retained promises before deleting the legacy CLI. `bot run events RUN` will replace full root and child record reading. `bot run session RUN STAGE` will replace bounded session reading.

Bot will retire the flat `draft`, `rejected`, `capture`, `logs`, `explain`, `status`, `prune`, `find`, and `config` commands when ticket 0217 deletes the legacy CLI. Current repository evidence shows no maintained executable caller outside interface smoke. The full record, raw record, bounded run summary, run output, run request, recorded checks, checklist marks, and session reader preserve the supported evidence needed for the current product. The final deletion moves shared behavior proofs to current commands and removes old-interface-only smoke assertions.

The full-record replacement supports root and child records, human Markdown, and one versioned JSON document. It does not add following or JSON Lines. ADR 0026 records `run events --follow --json` as a direction. No current caller requires a live follow stream. A later ticket needs observed demand before it adds that stateful behavior and its streaming output contract.

## Options considered

1. Build noun replacements for every flat command. This preserves every feature. It also turns tests and old documentation into product demand and expands the public contract without an observed caller.
2. Delete every flat command. This creates the smallest surface. It breaks the ideal-state session promise and removes the complete record reading taught by the public guides.
3. Preserve full records and sessions, then retire the rest. This keeps the two evidenced promises and removes unsupported breadth. Bot accepts the loss of specialized draft, rejection, capture, cross-run tool log, explanation, home summary, pruning, search, and configuration views.

## Reason

Option 3 follows the observed-caller rule and the ideal state. It gives the final deletion a closed inventory. It also keeps future commands tied to actual use.

## Cost and reversal

Alpha users lose several existing inspection and maintenance shortcuts when 0217 lands. Raw records and ordinary filesystem tools retain the underlying evidence. A later observed caller can justify a focused current command. Reversal requires a new command contract and tests. It does not require restoring the legacy dispatcher.
