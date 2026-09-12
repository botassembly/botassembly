---
flow: build
priority: 6
---
# The show exhibit covers every event type by construction

`bot/tests/show-reading.test.ts:9-12` and `:165` (at 3cb718b) claim seventeen record event types exist and that all seventeen are exercised. The `RecordEvent` union (`bot/src/record-events.ts:399-419`) now has twenty members. The exhibit lacks `stage_carried`, `provider_transport`, and `tmp_teardown`, so their human `show` renderings (clauses at `bot/src/readings.ts:137` and `:152`) sit uncovered by the one test whose stated job is total coverage — and commit 2b7335f edited that exact comment while its message claimed to restore the comment's accuracy. A hand-counted numeral goes stale every time the union grows; the count should come from the code.

## Done, observably

- The exhibit derives its event list from the shipped constructors or the union, so a new event type fails the exhibit until a rendering sample is added — no hand-maintained count anywhere in the test.
- The three missing event types gain samples, and their renderings are asserted.
- Deleting any event's sample turns the test red naming the missing type.

## Boundary

`show`'s rendering behavior does not change unless exercising the three uncovered types reveals a defect, in which case the fix is in scope and named. Ticket 0152 owns spec-side parity; this ticket owns the exhibit only.
