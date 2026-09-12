---
flow: build
priority: 2
hold: An observed caller must need these metrics from the supported one-run reading before implementation.
---
# A stage reading carries its retries and send-backs

Draft 0228 supplies a supported `bot run show` reading for an observed Bot smoke caller. That caller does not need retry or send-back metrics. Keep this draft held until another caller needs them.

No reader counts a stage's additional attempts or its actual send-backs, and none names the check that bounced an attempt. The record's `retry` field is a one-based attempt ordinal. It is not a retry count. A nonzero check proves rejection but does not by itself prove a send-back. Blocker exit 75, a final exhausted check, a machinery failure, Bot-decided provider retries, adapter-internal attempts, and incomplete work need distinct outcomes. `bot explain --json` reports `"outcome": null` for a bounced attempt because a sent-back attempt has no `stage_end`, and it never says which check sent it back. A downstream evaluation tool derived attempt ordinals and treated nonzero checks as send-backs across 25 stored records. It matched its own record interpretation every time. That observation does not prove the stronger send-back definition this ticket now requires. This ticket preserves the measured result because its earlier workspace note has been archived.

Done, observably:

- The supported one-run reading carries, per stage and repeat, the attempt count, additional-attempt count, and count of actual returns to the agent for repair. Bot-decided provider retries remain a separate recorded fact. Adapter-internal attempts report as unknown unless a future record fact establishes them. Do not add features to a legacy command scheduled for deletion.
- A sent-back attempt reads as sent back, naming the check that bounced it and that check's exit, instead of a null outcome.
- Counts follow the recorded attempt sequence. Blockers, final exhausted checks, and machinery failures are not counted as returns to the agent. If the record cannot establish a count, report that limit instead of inventing a number. Tests cover those distinctions with real writer records.

Boundary: readers only. Nothing new is written to the record, and the retry policy does not change.
