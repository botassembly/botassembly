# Compare Luna High and Sol Medium on ticket 0201

Date: 2026-09-08. Owner: Bot project lead. This decision records the comparison plan for the accepted ticket 0201 contract.

## Comparison setup

After 0200 lands, create and push the annotated tag `experiment/0201-baseline-20260908` on the exact `origin/main` SHA and freeze main for this comparison. Create the two neutral isolated worktrees from that tag. Both candidates implement the same accepted ticket 0201 and use that same exact experiment baseline. Luna High implements one candidate. Sol Medium implements the other candidate. Each candidate works independently and cannot read the other candidate's worktree, diff, tests, or findings.

The comparison covers code, tests, and documentation only. It does not change the ticket's goal or the surrounding runtime. The two Sol Medium reviewers receive blind candidate labels and do not learn which model produced either candidate.

## Scoring and decision rules

Each reviewer scores both candidates out of 100:

- Correctness: 40 points.
- Tests: 25 points.
- Clarity and locality: 20 points.
- Simplicity and scope: 15 points.

Disqualify a candidate when review proves an acceptance failure, contract failure, data-integrity failure, security failure, or unrelated-scope change. A test failure without a proved acceptance, contract, data-integrity, security, or unrelated-scope failure remains a finding for remediation and does not disqualify the candidate by itself. If both candidates receive a disqualification for any listed reason, there is no winner from that comparison.

Call the result noticeable only when one candidate is disqualified or both reviewers prefer the same candidate and that candidate leads by at least 10 average points. Choose the smaller, clearer diff below that threshold. Choose Luna High on a tie.

If both candidates receive a disqualification because the accepted ticket or its acceptance contract is ambiguous, pause the comparison, clarify the ticket, and restart both candidates from the same exact experiment baseline. Recreate the neutral worktrees and reviewer-blind setup. Do not treat that restart as an independent code remediation. If independent code failures cause both disqualifications, record each failure and give each candidate one independent remediation retry from its own initial worktree. Keep the same ticket, experiment baseline, checks, and reviewer blindness. Do not transfer a fix or finding between candidates. If both candidates remain disqualified after the applicable restart or retries, record an inconclusive comparison with no winner. Never promote a disqualified candidate or retry it. Sol Medium must create a fresh clean implementation from the exact experiment baseline, receive independent code review, remediate findings through the normal loop, and pass the ticket checks plus the complete offline check. This fresh implementation delivers the final 0201 ticket commit. If one candidate passes and the other remains disqualified, the passing candidate delivers the final commit. If both candidates pass after retry, score them under the same threshold and tie rule.

## Preservation and final landing

Before any review or remediation, create annotated public tags at the initial candidate tips:

- `experiment/0201-luna-high-20260908`
- `experiment/0201-sol-medium-20260908`

If the comparison has a winner, replay that winner into a clean worktree from the exact experiment baseline and create one clean final ticket commit. Run the ticket's checks and the complete offline check on that final commit. If the comparison is inconclusive, use the fresh Sol Medium implementation described above instead of replaying either candidate. Do not land either experiment tag as the ticket result.

The comparison record must include both candidate SHAs, the final replay SHA, tests and their results, diff statistics, both reviewer scores, findings, remediations, disqualifications, and the verdict. The record must name the model routing choice and the evidence for it.

## Routing after the verdict

Keep Luna-heavy routing when Luna High wins or the candidates are indistinguishable. If Sol Medium wins noticeably, move 0218, 0207, 0209, 0204, and 0216 to Sol Medium. Keep 0203, 0205, and 0219 with Sol Medium in every outcome. Keep the permission issue, 0181, 0206, and 0215 with Luna High in every outcome. Leave assignments not named here unchanged.

If the comparison is inconclusive, retain the original accepted Luna-heavy routing and all existing ticket assignments. Sol Medium delivers the final 0201 ticket commit. Do not apply the Sol-wins routing changes without a noticeable Sol win.

The comparison changes no runtime behavior until the clean final ticket commit lands. Ian can overturn the routing result by amending this decision before the experiment starts.

## Ticket design correction

Design review found that a check event's optional `sha256` identifies the executable gate. It does not hash the capture, and built-in checks omit it. The accepted ticket keeps a read-only reader and reports that value as `executableSha256`. The alternative would add a new capture digest to the writer and define compatibility for existing records. That option would widen the record contract before the observed callers need it. The accepted cost is explicit: shape-1 records cannot prove that capture bytes replaced before a safe read remain original.

The same review found that one attempt can record several gate files under the check name `gate`. The accepted ticket adds exact `--file` filtering and reports `executableFile`. Without that field, the lifecycle witness caller could not select its final gate. The reader accepts captures through the writer's 16 MiB ceiling instead of inheriting the old reader's 1 MiB artifact limit. The accepted cost is one more selector and up to 16 MiB of memory for a raw read.

## Outcome

The baseline tag points to `0ad39f77df7ef794b69b1d2d696c694fdbc937d1`. A random byte of 99 assigned Candidate A to Sol Medium and Candidate B to Luna High under the recorded parity mapping. Both initial candidates were disqualified. After one isolated remediation each, reviewers scored Sol 90 and 93 and Luna 68 and 74. Sol averaged 91.5. Luna averaged 71. Sol led by 20.5 points and Luna remained disqualified. Ticket 0059 records the candidate SHAs, tags, tests, findings, and replay.

Decision: Sol Medium won noticeably. Apply the Sol-wins routing above. The cost is less Luna High implementation work than first planned. Luna still owns four narrow tickets. Ian can reverse the routing with one plan edit.

## Why ticket 0201 was hard

Ticket 0201 did more than add a command. It defined a public reader over append-only run records. The reader had to distinguish malformed, incomplete, failed, repeated, and successful recordings. It had to select one gate file without changing the writer. Raw mode had to deliver exact held bytes through synchronous and asynchronous output failures. The new command also had to agree with help, capabilities, the specification, conformance cases, and retained legacy behavior.

The failures show where the difficulty lived. Sol's first candidate mishandled an invalid home and raw-output delivery. Luna's first candidate mishandled omitted exits, repeat selection, raw-output delivery, and final path replacement. Luna's remediation still allowed an uncaught synchronous output failure and widened shared held-file behavior used by existing commands. These were boundary and failure-path mistakes. Diff size did not reveal them.

Sol's candidate wrote far more tests in the first pass: 205 added test lines against Luna's 42. Luna also selected the machine's Node 18 default and therefore did not run Vitest. That environment mistake counts against delivery readiness. It does not prove that Luna cannot solve the code problem under a correctly pinned environment.

## What the result proves

The experiment proves that Sol Medium produced a materially better result for one hard Botassembly reader ticket under this process. Two blind reviewers preferred Sol after equal remediation. Sol cleared every disqualification. Luna did not. The 20.5-point lead exceeded the recorded noticeable-difference rule.

The experiment does not prove that Sol Medium is better for every ticket. It tested one TypeScript repository, one public record-reading problem, one prompt, and one day. Both reviewers used Sol Medium, so candidate labels were blind but reviewer model choice was not diverse. Both first attempts failed. The experiment did not compare speed, token use, subscription limits, or simple mechanical work.

Later work supplies supporting evidence without creating another A/B result. Luna High completed ticket 0063, a narrow permission-test correction with zero production-line change, and ticket 0064, a bounded test-publication waiter with zero production-line change. Sol review accepted both. Sol review also found and reproduced an inode-reuse stale-cache bug in ticket 0065 after its first implementation passed the focused suite. These outcomes support Luna on bounded work and Sol on stateful failure paths. They do not replace another controlled comparison.

## A practical complexity reading

Complexity means the reasoning and proof needed to avoid a wrong result. It does not mean estimated effort, changed lines, number of files, priority, or flow. A small diff can be hard when it changes durable state or failure behavior. A large mechanical edit can remain straightforward when the contract and proof already exist.

Assess five areas from 0 through 2 and add them:

| Area | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Contract | One exact existing rule | Several explicit public cases | A new or ambiguous compatibility decision |
| State and timing | Pure local behavior | Persistent state or ordered asynchronous work | Concurrency, recovery, partial failure, signals, or cache invalidation |
| Reach | One private owner | Several modules or one public surface | Several repositories, deployed callers, or a coordinated migration |
| Proof | One focused deterministic check | Several modes, documents, or platforms | Hostile inputs, failure injection, exact-byte proof, or compatibility proof |
| Cost of error | Cheap local correction | User-visible breakage or repeated work | Data loss, security exposure, outage, or a hard-to-reverse external effect |

Totals 0 through 2 are level 1. Totals 3 through 5 are level 2. Totals 6 through 8 are level 3. Totals 9 through 10 are level 4. Concurrency, recovery, shared durable state, or cache invalidation set a minimum of level 3. A credible data-loss, credential, security, or live coordinated-migration risk sets level 4. The ticket reviewer records the reasons. The number alone is not enough.

Examples from this work make the distinction concrete:

| Ticket | Level | Reason |
| --- | --- | --- |
| 0063 | 1 | One established permission rule changed in a copied test fixture. Runtime behavior and production source stayed unchanged. |
| 0064 | 1 | One test helper replaced turn-count polling with a bounded publication wait. Runtime retry behavior stayed unchanged. |
| 0066 | 1 | One shared copy filter applied an existing visibility rule across local install, Git install, and update. |
| 0215 | 2 | The refactor is behavior-preserving, but package exports and several ownership boundaries require inspection. |
| 0060 | 3 | One public command crossed live-lock state, three output modes, legacy parity, capabilities, help, and conformance. |
| 0059 | 3 | The reader crossed append-only records, exact raw bytes, malformed and incomplete state, repeated attempts, and retained compatibility. |
| 0065 | 3 | A disposable cache still required durable invalidation, concurrent refresh, read-only source handling, and inode-reuse proof. |
| 0219 | 3 | The change removes source-reading defenses while preserving digest framing and existing record meaning. |
| 0217 | 4 | Deleting the legacy CLI depends on verified migrations across deployed callers. A wrong sequence can stop live work. |
| 0220 | 4 | Storage contraction can remove protections. The exact retained security and durability guarantees are not settled yet. |

The current evidence supports Luna High for level 1 and level 2 implementation with independent Sol review. It supports Sol Medium for level 3 implementation and review. Level 4 should first be split into smaller independently provable outcomes. Use Sol Medium for any irreducible level-4 implementation. This is provisional routing. Another controlled comparison can change it.
