---
flow: build
priority: 2
deps: []
---
# Make run summaries truthful

## Outcome

Every run-summary reader reports the verified token total for the root and all authorized descendants and labels that total `complete` or `partial`. Human run lists print the exact recorded timestamps that JSON returns. A record whose accepted ending precedes its accepted start is invalid instead of producing a negative duration.

## Current facts

- `runStateFact` computes `tokens` from `turn` events in the selected root record only. The current `bot run list` and public `inspectRuns` reader share that fact, so both omit descendant consumption without saying so.
- A started `subflow_call` names its child record beneath the parent. `childRecordAgrees` validates the child basename, flow, retained request bytes and hash, and ending against the parent event. It does not bind the child path to the parent event's stage, repeat, retry, and call or reject duplicate authorizations. The raw-record reader already performs those writer-owned checks. Child runs may contain further authorized children.
- A valid completed record with no `turn` event currently reports `tokens: null`, which cannot distinguish zero model consumption from an unavailable total. Running, crashed, torn, missing, unreadable, and disagreeing descendants can leave only a verified prefix of whole-run consumption.
- Each token field is a non-negative safe integer, but repeated addition is not currently checked for safe-integer overflow.
- An `unreconciled` event records provider work whose spend is unknowable. A `provider_start` without a later matching `turn` also identifies an interrupted or still-silent operation. A valid ending alone cannot make either total complete.
- JSON `bot run list` preserves exact `startedAt` and `endedAt`. Human output converts both to relative ages using the reading clock.
- Record classification accepts parseable timestamp spellings but accepts a `run_end.ts` before `run_start.ts`. `run list` then publishes a negative duration. A current test deliberately pins that behavior.
- `bot run events` reads one selected root or child record. `bot run show` is a bounded operational summary and intentionally excludes cost. Neither is a whole-run listing.

## Scope

- Add `tokensStatus: "complete" | "partial"` to the shared run-state fact, both JSON and human renderings of the public `inspectRuns` reader, and the `bot run list` field set. Put it immediately after `tokens` in the default field order. Keep JSON schema version 1 under the current pre-release change-in-place policy.
- For every readable record, count a `turn` only when `input`, `output`, `cache_read`, `cache_write`, and `total` are all non-negative safe integers. Sum its `total`. A readable record with no valid turns contributes zero. Skip a malformed turn and mark the result partial. Publish a numeric total only while every addition within one record and across the recursive tree remains a safe integer. Any overflow makes the whole derived `tokens` value null and partial.
- Within each record, match a `provider_start` to a later `turn` with the same stage identity, provider, and model. Match in recorded order. A remaining start makes the total partial. A historical `turn` without a preceding start remains countable and does not by itself make the total partial. Any `unreconciled` event makes the total partial.
- Recursively follow only writer-owned child authorizations: a `subflow_call` whose `started` value is exactly true, whose normalized child reference exactly matches its `child` field, and whose stage, defaulted repeat, retry, and call fields spell that child path. Require exactly one authorization for a child path. Duplicate or conflicting references are ambiguous, contribute no child events, and make the total partial. A malformed `started` value or a false-start event that improperly carries a child makes the total partial and never authorizes a read. A legitimate `started: false` event without a child contributes nothing and does not make the total partial.
- Read each authorized child record through the existing held-file boundary anchored beneath the selected root. Count it only after `childRecordAgrees` validates it against the authorizing parent event. Recurse from each accepted child in recorded call order. Do not scan directories for possible children, follow arbitrary paths, or relax `childRecordAgrees`.
- Mark a total `complete` only when the root is a valid ended record, every started child has one writer-owned authorization and agrees with its parent, every accepted descendant is a valid ended record, every turn is valid, no provider operation has known missing consumption, and the complete recursive sum is a safe integer. Otherwise mark the result `partial`.
- A readable running, crashed, or incomplete record reports the verified safe sum found in its accepted events, including zero, with `tokensStatus: "partial"`. This includes an agreeing incomplete machinery-failure child: count its verified turns and verified descendants, then keep the ancestor partial. An incomplete child that contradicts a recorded terminal parent outcome fails agreement and contributes nothing. A missing, unreadable, unsupported, structurally invalid, or disagreeing descendant contributes nothing and makes the ancestor partial. A missing, unreadable, unsupported, or structurally invalid root keeps `tokens: null` and reports partial.
- Preserve the top-level run enumeration, paging, cursor membership, filtering, count behavior, warning bounds, and output-size limits. `--count` does not read token or descendant facts. A projected row may select either `tokens` or `tokensStatus`; ordinary row scans compute one shared token fact rather than reading descendants twice.
- Change human `bot run list` timestamp cells to the exact recorded strings held in `startedAt` and `endedAt`. JSON continues to preserve those strings. Publish `duration` as the exact non-negative integer millisecond difference between their parsed instants when that difference is a safe integer; otherwise publish null. Preserve accepted historical timestamp spellings, including offsets.
- Reject a `run_end` whose parsed instant precedes the accepted `run_start` at the shared semantic record-classification boundary. Every semantic reader then treats the record through its existing invalid-record behavior. Do not require canonical timestamp spelling or impose monotonic ordering on other events.
- Preserve the public `inspectRuns({ usage: true })` array as selected-root detail grouped by stage and model. It is not a whole-run breakdown. Document that boundary beside the new whole-run `tokens` and `tokensStatus` fields.
- Keep `bot run events` scoped to its selected record and keep `bot run show` free of cost. Correct any cost wording that implies their root-only event arithmetic is a whole-run total. Do not change retained record events, record format, sessions, outputs, runtime token collection, pricing, or budgets.
- Update help, capabilities, specification, generated pages, changelog, witnesses, public-reader tests, and conformance where the summary contract changes.

## Acceptance

Start with failing focused tests. Root fixtures prove completed zero-turn and root-only totals are complete, while running, crashed, and incomplete roots expose the verified numeric prefix as partial. Missing, unreadable, bad-version, and invalid roots keep null tokens and become partial. A malformed turn beside a valid turn contributes only the valid amount and makes the result partial. Safe-integer boundary plus overflow within one record and across records never publishes a rounded total. Ended roots and ended descendants with `unreconciled` work or unmatched provider starts remain partial. Historical turns without provider-start facts remain countable.

Recursive fixtures prove one child, nested grandchildren, sequential siblings, and fan-out children are each counted exactly once. An agreeing incomplete machinery-failure child and its verified descendants contribute their accepted prefix and make the ancestor partial, including when the final line is torn. An incomplete child that contradicts a terminal parent result contributes nothing. A child missing from disk, unreadable, malformed, unsupported, or mismatched in identity, flow, request bytes, hash, or parent ending makes the ancestor partial. No rejected child events enter the sum. Never-started calls contribute nothing and do not make a completed total partial. Duplicate authorization events, conflicting references, a reference to another stage attempt, malformed `started`, and a false-start event carrying `child` are partial and cannot authorize or count that child. A hostile reference is rejected before filesystem traversal, unrelated directories are ignored, and no session, output, Pi, or provider path is read. Existing held-file replacement and extent checks remain the read boundary.

`bot run list` JSON and both public `inspectRuns` renderings expose `tokens` and `tokensStatus` consistently. Projection accepts the new field alone or beside `tokens`; the default order is exact. Count mode proves no child read. A child-bearing run proves the public whole-run total in JSON and human output while `usage: true` remains selected-root detail. Human and JSON list fixtures return the same exact recorded start and end strings, including an accepted offset spelling. Existing relative-age expectations go red and are replaced, not duplicated.

A record ending one millisecond before its start is invalid in root and child readings. Equal timestamps and later endings remain valid and yield zero or positive durations. Existing invalid-record handling emits no partial successful result where a command contract refuses invalid records.

Run focused record-story, held-record, child-integrity, run-state, public-reader, run-list, help, capability, conformance, and documentation tests, then the complete local gate. Independent code review must inspect recursive trust, double counting, overflow, incomplete-tree semantics, filesystem traversal, reader performance, exact timestamp output, and regressions in selected-record readers. The implementation and completion commits pass hosted checks.

## Dependencies

Ticket 0276 supplies bounded semantic record reading and honest command output. Ticket 0277 isolates the offline examples gate from operator Pi configuration. Later assembly-check and platform tickets do not change this reader contract.

## Risk facts

Whole-run totals require more filesystem reads than root-only totals. A summary may validate every authorized descendant record and its retained request bytes. Current writers bound their own call chains, but edited historical record trees do not inherit that guarantee and fan-out can create many siblings. This ticket invents no arbitrary descendant cutoff because a cutoff would make every larger valid run partial by policy rather than evidence. Paging still limits top-level rows, count mode avoids recursive reads, and each record and retained request keeps its existing size bound. Recursive traversal must prevent repeated or cyclic references from causing double counting or unbounded recursion.

The new status describes evidence, not billing accuracy. Providers define the token counts recorded in `turn` events. A partial numeric value is the verified amount Bot can sum and may be lower than actual consumption. Historical root-only numbers change when valid descendants exist. Human timestamps become longer because exact evidence replaces relative display.

## Size decision

- Starting production size: 18142 nonblank lines
- Ending production size: 18267 nonblank lines
- Simpler approach tried: Sum child directories found on disk and keep null as the only incomplete marker.
- Why insufficient alternatives were rejected: Directory presence does not authorize a child, and null cannot distinguish verified zero usage from an unavailable or incomplete total.
- Production code added: One recursive verified-consumption reader, one completeness label, safe aggregation, and one chronological record rule at existing boundaries.
- Production code deleted: Relative timestamp rendering from the current run-list path and root-only total assumptions where they become dead.
- Accepted cost: Listing a row can read its authorized descendant tree and retained child requests to validate the total.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 8
- Minimum level floor: 3, because recursive filesystem evidence can double count, escape its authority path, or publish a false complete total.
- Final level: 3
- Reasons: The behavior is one derived summary contract, but it spans shared readers, recursive child integrity, record classification, CLI projection and rendering, public APIs, specification, and conformance.
- Selected model: `gpt-6-astra` with xhigh reasoning for design review and `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: The 2026-09-13 completion-plan reassessment consolidated root and descendant token use, exact timestamps, and impossible durations into one truthful run-summary outcome. A read-only implementation survey confirmed that both summary readers share the root-only fact, child authorization already exists, JSON timestamps are exact, and chronology is not enforced.
- Design review: accepted after one rejection. The correction defines known missing consumption, incomplete-child prefixes, writer-owned child authorization, all five turn counters, historical timestamp spellings, and the public human and usage contracts.
- Code review: accepted after one rejection. The correction restricts child request reads before opening bytes, preserves exact provider stage identity, returns null for unsafe durations, and supplies the full recursive, authorization, confinement, overflow, and public-reader regression evidence.
- Completion: pending
