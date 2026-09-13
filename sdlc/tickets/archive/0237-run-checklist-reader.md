---
flow: build
priority: 1
---
# A supported run reader identifies checklist marks

## Outcome

`bot run checklist` reports which checklist items were marked in one sealed or structurally valid incomplete root run record.

## Current facts

Shape-1 records retain each accepted checklist item's stage, attempt, item number, decision, evidence, and optional reason. Legacy `bot explain` reduces those facts to a count and can suppress an earlier stage after a later legal no-output ending.

## Contract

The command is `bot run checklist RUN [--stage PATH] [--retry N] [--repeat N] [--json|-j] [--home DIR]`. Each selector works alone or in combination and compares its field exactly. An omitted selector does not filter. An explicit repeat of 1 does not match an absent repeat.

JSON writes one newline-terminated `{ "schemaVersion": 1, "kind": "bot.run.checklist", "data": { "run": FULL_RUN_NAME, "marks": [...] } }` document. Each mark contains exactly `stage`, `repeat`, `retry`, `item`, `decision`, `evidence`, and `reason`. Missing repeat, evidence, or reason becomes `null`. Markdown uses those seven columns in that order and makes retained text inert. Both modes preserve record order.

The reader accepts `tool_call` events whose `tool` is `mark`. A mark requires a nonempty stage, positive safe retry and item, an optional positive safe repeat, and decision `done` or `skipped`. Current marks require nonempty string evidence. Historical marks may omit evidence and return null. A present evidence or reason must be a nonempty string. A `done` mark may omit reason and returns null. A `skipped` mark requires a nonempty reason. Additive fields remain readable. A malformed matching mark fails the whole reading with exit 5 and no stdout. Other well-formed event kinds remain outside this reader's field validation.

A valid record with no marks after selection exits 1 with empty stdout and a bounded diagnostic on stderr. JSON uses the common structured `run.checklist` error. Missing or ambiguous runs and missing records follow the existing exit-1 reader behavior. Invalid, unsupported, unreadable, non-file, non-UTF-8, or oversized semantic records exit 5. Structurally valid incomplete prefixes remain readable.

## Scope

Add one reader module and register `run.checklist` in the sorted command inventory, dispatch, capabilities, generated overview, and detailed help. Publish the contract in inspection, conformance, the specification changelog, and the documentation inspection reference. Update the size-decision checker to accept the current `sdlc/tickets/drafts/` and `sdlc/records/` workflow while retaining its historical roots.

Do not expand legacy `explain`, rewrite records, open child records, read the captured assembly, contact providers, mutate the home, or add a getting-started example.

## Acceptance

Focused tests prove record order, both output modes, inert Markdown cells, old-record nullability, exact independent and combined selectors, absent repeat versus explicit repeat 1, exact-prefix run resolution, valid empty selections, malformed matching marks, ignored malformed nonmatching events, structurally valid incomplete prefixes, and a retained earlier mark beside a later legal no-output ending. Invalid request forms exit 2 before home access. Record failures exit 5. Missing and ambiguous selections exit 1. Legacy `bot explain` behavior remains unchanged.

Capabilities and help describe the network-free read-only command and publish the existing 1 MiB semantic-record limit plus the 480-byte Markdown cell limit. Publication tests cover the command inventory and documented contract. Size-decision tests prove that one current draft can authorize a working-tree increase and one current completion record can authorize a committed increase. The complete repository check passes.

The implementation may raise the current 16,350 nonblank production-line ratchet for this public feature. This draft must carry the checker's structured size decision during implementation. The completion record must carry it after closure and state the measured increase and the simpler alternative considered. Do not create a second ticket under the historical contraction folder. The implementation must not compress ownership merely to avoid an honest increase.

## Dependencies

None.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: This adds a versioned public reader over durable ordered records. Compatibility, hostile record input, nullability, selectors, two output modes, and publication must agree.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation exposes a new contract, state, timing, reach, proof, or cost-of-error fact.

## Review

- Design review: accepted after the public shape, compatibility rules, error behavior, bounds, publication proof, and string validation became exact; re-review accepted the current size-decision workflow repair without changing level 3
- Code review: accepted with no findings after focused and complete verification

## Size decision

- Starting production size: 16350 nonblank lines
- Ending production size: 16549 nonblank lines
- Simpler approach tried: reuse the existing run-check command's record selection and rendering path.
- Why insufficient alternatives were rejected: run check requires a check name, joins attempt selectors, supports raw captures, and validates a different event shape. Sharing its private query and mode rules would couple two public contracts and make either command harder to change safely.
- Production code deleted: none. Ticket 0247 owns deletion of the legacy reader after retained callers move.
- Accepted cost: 199 nonblank production lines for one local parser and reader that owns exact independent selection, mark compatibility, inert Markdown, structured output, and command-specific errors.
