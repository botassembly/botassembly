# Route the remaining repairs by reviewed complexity

Updated 2026-09-09. Ian accepted this follow-up after reviewing the recorded Luna High and Sol Medium comparison.

## Decision

Use the complexity rubric in [the 0201 comparison](2026-09-08-model-comparison-0201.md) for the remaining manual repairs. Sol Medium designs and reviews every ticket. Luna High implements levels 1 and 2. Sol Medium implements level 3. Split level 4 before implementation when the contract permits it.

| Draft | Level | Implementation | Reason |
| --- | --- | --- | --- |
| 0205 | 1 | Luna High | One corpus fixture and one deterministic repository check change. |
| 0206 | 1 | Luna High | One smoke-path construction rule changes. Runtime behavior stays fixed. |
| 0216 | 2 | Luna High | Several test owners and one lint boundary change without runtime behavior. |
| 0215 | 2 | Luna High | Several private ownership boundaries change while public exports stay fixed. |
| 0219 | 3 | Sol Medium | Source-reading defenses leave while digest framing and record meaning stay fixed. |
| 0221 | 2 | Luna High | Several smoke readers and their documentation change while runtime and public command behavior stay fixed. |

A Luna implementer stops before widening scope when new evidence raises a ticket to level 3. The primary agent records the reclassification and assigns the remaining implementation to Sol Medium.

## Options and cost

1. Keep the ticket-by-ticket assignments made immediately after the 0201 comparison. This follows the original result literally. It gives little evidence about Luna on bounded work and conflicts with the later complexity policy.
2. Route by reviewed complexity. This tests Luna on four bounded repairs and keeps Sol on the stateful contract change. Sol still supplies independent design and code review. The cost is less direct Sol implementation coverage. Accepted.
3. Repeat a blind two-candidate comparison for every remaining ticket. This produces more comparisons. It duplicates work and consumes model capacity when the current goal is to finish known repairs. Rejected.

This decision changes assignments only. It does not change the 0201 scores or claim that one comparison ranks the models generally. Ian can reverse the routing with one plan edit.

## Evidence after routing

Ticket 0072 supplied a level-3 follow-up. Sol Medium implemented the source-reader contraction. Its first complete code version passed all focused and full checks. Luna High and a separate Sol Medium reviewer both found the same low-severity ticket measurement error. Neither found a code or contract defect. Luna also encountered a previously unrecorded Vitest coverage-directory race during review. A clean standalone coverage rerun passed, and the project now carries that race as an open issue.

This was not a blind A/B implementation comparison, so it does not produce a second winner. It supports the existing routing in a narrower way. Sol handled the level-3 state and compatibility work cleanly. Luna and Sol produced the same substantive review finding. The coverage race measures the test environment. It does not distinguish model quality.
