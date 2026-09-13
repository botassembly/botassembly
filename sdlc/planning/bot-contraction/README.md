# Bot contraction and contract repair

This folder carries the implementation designs and manual work record for the pre-release Bot repair that began on 2026-09-04. The governing decisions are ADRs 0024 through 0026. The evidence and earlier alternatives remain in the workspace research folder. This repository carries every accepted decision needed to implement the work.

The work runs manually. The old dispatcher is retired. This effort keeps one ticket at a time under `sdlc/planning/bot-contraction/tickets/`. Each ticket receives an independent design review, red-green implementation, an independent code review, remediation of every accepted finding, and `make check` from the repository root. Every completion record reports that exact command. A completed ticket moves to `sdlc/planning/bot-contraction/records/` with its concise verdicts and check results. These files use a separate manual numbering sequence.

The checkpoints are safety, records, continuity, minimal FANOUT, CLI, and final contract quality. The next ticket comes from current source after the previous ticket passes. The effort does not create a predicted backlog. Every completion record states the production-line change from its actual starting commit. A ratchet increase must name the behavior that requires it and the simpler or deleting alternative that was tried. A checkpoint should finish no larger than it started unless an accepted behavior makes that impossible.

The [current plan](../plan.md) owns remaining work. Ticket 0196 was superseded and removed. The private pre-public recovery bundle preserves its earlier attempt.

## Historical checkpoint account

The following account describes completed work. Current priorities live in the plan linked above.

Checkpoint 0 established the three ADRs and five implementation contracts in this folder. Independent design and record reviews accepted the revised packet on 2026-09-04 after the contracts were checked against the current writer, readers, retained caller surface, and reproduced cleanup failures. Manual tickets 0001 through 0003 completed after separate design and code reviews and the full Bot check. Ticket 0003 bounded command capture and isolated process-group settlement.

Tickets 0004 and 0005 completed checkpoint 1. Ticket 0004 placed root cleanup before terminal publication. Ticket 0005 kept a child machinery fault inside that child while its siblings continued.

Ticket 0006 completed the first part of checkpoint 2. Bot now validates that a retained record tells a possible current-writer story before operational commands trust it. The full Bot check and two independent final reviews accepted the result on 2026-09-04.

Ian paused this workstream after ticket 0006 and resumed it on 2026-09-05 after an external review measured an overreach in the semantic validator. A 117-line prototype kept all 926 records accepted by ticket 0006, accepted 996 honest historical records that ticket 0006 rejected, classified three as incomplete, and left one invalid. The measured contraction removes about 1,570 production lines while retaining child-artifact verification, held-file protection, stable search snapshots, and the root-lock correction.

Ticket 0007 completed the validator contraction. It kept structural story validation and moved detailed writer-shape rules to tests. Operational consumers now validate the facts they use. The retained-home audit classified 1,922 runs as valid, four as incomplete, and one as invalid. Production source fell by 1,615 physical lines, and the nonblank TypeScript source ratchet fell from 13,889 to 12,449.

Ticket 0008 aligned invalid-run cleanup. Exact name, keep, and age selection can now remove a stopped structurally invalid run through the existing independent deletion guards. Automatic selection still refuses missing, non-file, unsupported-version, and unreadable records. Age comes only from a calendar-valid UTC timestamp in the writer-shaped run name.

Ticket 0009 added exact raw record access without weakening operational validation. It copies a fixed descriptor snapshot, authorizes child paths through one valid parent fact, reports bounded read, output, and close failures, and preserves quiet closed-pipe behavior.

Ticket 0010 corrected the LOOP container fact. A failed body now keeps its exact `refused`, `exhausted`, `rejected`, `blocked`, `timeout`, or `fault` cause instead of collapsing three of those outcomes into `exhausted`.

Ticket 0011 simplified raw record output while its behavioral tests were fresh. Node's standard stream pipeline now owns chunking and backpressure. The held descriptor, fixed snapshot, exact bytes, bounded failures, cleanup, and quiet closed-pipe behavior remain. Production source fell by 37 nonblank lines.

Ticket 0012 bounded failed-gate views without losing evidence. The model receives at most 10,000 UTF-8 bytes and gate-derived terminal reasons contain at most 2,048 UTF-8 bytes. The exact gate output remains in the existing check capture. Independent code review also removed the full Buffer from the failed-check result before the next model turn.

Ticket 0013 replaced whole-record loading with bounded incremental parsing. Semantic inspection reads one fixed held descriptor in 64 KiB chunks while preserving the 1 MiB total limit, 10,000-segment limit, strict UTF-8 handling, torn-segment rule, line text, classifications, and final path stability checks.

Ticket 0014 completed the record-bounds work. Rendered sessions now use snapshot-bound continuation cursors, bounded message and byte pages, bounded source work, explicit completeness statements, and one incremental scanner shared with settled-tool readings. The raw session path keeps its former behavior.

Ticket 0015 closes the recordless-run preparation gap. Successful `run_start` publication is the boundary. Earlier unexpected failures now produce bounded operation-specific faults, remove the unborn directory while its reservation remains held, report cleanup failure honestly, and still release the reservation.

Ticket 0016 gives an applicable resumed plain root stage bounded evidence from its own donor failure. The stage keeps its request or predecessor output. The new run retains and hashes the evidence, excludes signals and container failures, and labels only evidence that remains after a `before` hook.

Ticket 0017 makes concurrent PARALLEL machinery failures deterministic. After every started branch settles, the container selects the rejection from the first affected branch in bytewise name order. The shared pool, branch facts, signal behavior, and ordinary failure behavior remain unchanged.

Ticket 0018 completes the continuity proof for existing controls. Deterministic real-runtime tests now send an outside signal through LOOP, CHOOSE, and PARALLEL. They prove the enclosing signal result, each container's durable nested facts, the absence of later work, and PARALLEL settlement of active and queued branches. Production source did not change.

Ticket 0019 completes the minimal FANOUT checkpoint. One checked list from the immediately preceding JSON stage now runs one authored subflow per item under explicit total and concurrency limits. Bot records the sorted plan and every disposition, contains child failures, preserves outside cancellation, and gives the successor either one verified named output per item or nothing. Held descriptors make the accepted child bytes the bytes the successor receives. The record remains shape 1.

Ticket 0020 starts the composable CLI checkpoint with `bot run list`. People receive bounded Markdown by default. Programs receive one versioned JSON envelope through `--json` or `-j`. Typed filters, canonical time bounds, field projection, bounded count diagnostics, and membership-bound keyset cursors share one closed query. Both the new and legacy run lists use one observed run-state fact. The legacy `bot runs` spelling keeps its existing bytes.

Ticket 0021 adds `bot capabilities`. One compiled inventory now reports and dispatches only the implemented new commands. It also supplies their help facts. The initial bounded network-free result contains `capabilities` and `run.list`. Run-list limits and closed values come from the parser's exported contract. Legacy commands and outputs remain unchanged.

Ticket 0022 adds `bot run record RUN --raw`. The thin new handler validates its suffix and delegates root-record copying to the established raw reader. Capability discovery and generated help describe the raw contract without a fabricated schema version. The legacy raw spelling keeps its bytes and behavior.

Ticket 0023 adds `bot run start`. Human mode preserves legacy run output. Structured mode returns one bounded complete result from facts already held by the runtime, without rereading the record. Started nonzero runs remain results. Pre-start failures use the common error contract. Optional correlation stays bounded and opaque. Capability discovery and generated help now describe the implemented mutation.

Ticket 0025 adds `bot run resume`. It uses the existing donor validation, continuation plan, and runtime. Structured results always report the durable carried count and include ordered identities only when bounded. Copy failures report only the `stage_carried` prefix already appended. Human and legacy resume behavior remain unchanged.

Ticket 0026 adds `bot run output RUN [STAGE] --raw`. It validates the raw-only invocation before reading the home and delegates to the existing accepted-output reader. The new and legacy spellings share exact bytes, exits, record checks, selection rules, and the 1 MiB bound. Capability discovery and generated help publish the implemented command and limit.

Ticket 0027 removes the noun command's accidental 1 MiB ceiling. It keeps the legacy reader unchanged. The noun command selects the same accepted output, acquires and verifies a private fixed snapshot with bounded memory, and only then writes verified bytes to stdout.

Ticket 0028 restores the repository documentation gate after FANOUT. The generated Graph page now includes the FANOUT chapter after PARALLEL and names FANOUT in its description.

Ticket 0029 adds one complete offline check at the repository root. The root target coordinates the existing project lint and test ladders. Documentation tests now run beside Bot's tests. Bare `make`, live smoke, and packaging retain their separate behavior.

Ticket 0030 makes source-growth decisions mechanical. A project-owned Git comparison now requires one matching structured size decision when the production ceiling rises. The shared exact-count ratchet remains unchanged.

Ticket 0031 removes the private output copy. Noun-based raw output now verifies and streams one fixed extent through the same held descriptor. A changed delivery hash fails after bytes already written. Production source fell from 15,174 to 15,062 nonblank lines.

Ticket 0032 repairs raw stdout backpressure exposed twice by the complete check. Raw delivery now delegates to Node's existing stdout stream through a non-closing adapter, waits for a slow reader, restores process listeners after success or failure, and preserves quiet closed-pipe and bounded real-fault behavior.

Ticket 0033 created the temporary legacy CLI retirement ledger required by ADR 0026. Ticket 0217 deleted it with the old command surface. The [completion record](records/0033-legacy-cli-retirement-has-one-owned-ledger.md) preserves that work's history.

Ticket 0034 adds `bot run request RUN --raw`. The command returns every retained root request through the existing bounded-memory held-descriptor delivery path, checks its recorded byte count and both hashes, and keeps the legacy reader unchanged.

Ticket 0035 adds runtime CI. Pull requests and pushes to `main` now run the complete offline check from a non-root Linux checkout with immutable action pins, parent history for size decisions, read-only permissions, and a closed mutation-tested workflow contract.

Ticket 0036 corrects the published `bot models` network contract. Ordinary listings use the pinned catalog without network access. Requested live listings may contact applicable configured providers. A focused publication test keeps the specification and both maintained reference pages aligned with runtime behavior.

Ticket 0037 makes the complete check independent of recursive Make state and personal Bot configuration. The first two hosted runs exposed each hidden dependency in turn. Fixture-owned homes now drive conformance and static PARALLEL checks, and hosted run `34038403153` passed the complete check from a fresh non-root checkout.

Ticket 0038 removes a scheduling race from the process-group cleanup proof. The test now controls command and grace timers while retaining a real detached shell, a readiness latch installed after TERM handling, the single shared grace assertion, and durable evidence cleanup. Production source did not change.

Ticket 0039 repairs invariant witness 46. It now names the six current exhaustive event-shape proofs without freezing a constructor count. A publication test protects those titles plus the row's separate conditional-field, LOOP-placement, byte-stability, and honest-limit clauses.

Ticket 0040 completes the documented stage-failure hook contract for an agent-reported fault. The specification and a real CLI proof now agree on the trigger, `$CAUSE=fault`, the retained `$REASON` capture, one hook, the unchanged fault ending, and the signal exception. Production source did not change.

Ticket 0041 publishes the closed authored `access` grammar. A 21-case authoring table now keeps its mapping, arrays, operations, deny-all forms, name rules, managed-slot availability, conditional `SUBFLOWS`, and stage-only placement aligned with the existing parser. Runtime behavior did not change.

Ticket 0043 repairs the concurrent-child cleanup proof that ticket 0042's coverage run exposed. The test now observes the fast child's valid sealed record under a real-time deadline, settles the parent before failure cleanup, and keeps both process-sweep assertions. Production source did not change. Ticket 0042 then resumed.

Ticket 0042 adds measured runtime coverage to the complete offline check. One instrumented Bot test run reports all four coverage dimensions for every production TypeScript module. A verifier protects the full inventory and summary shape. Focused tests remain uninstrumented, spawned Node children remain outside the measurement, and no percentage threshold turns the baseline into a quality claim.

Ticket 0044 completes the recorded stage-slot fact. A stage with a subflow in scope now records the exact `$SUBFLOWS` environment value as optional `slots.subflows`. A stage without that scope omits it, and a chooser still omits the whole slot object. Production source did not grow.

Ticket 0045 removes a constant choice-record field. New `chose` events record the selected alternative, declined alternatives, and reason without `via: "body"`. Retained additive values remain readable, and request and FANOUT origin fields remain unchanged. Production source fell by two nonblank lines.

Ticket 0046 makes the run-id-file contract consistent. Both canonical chapters, the hand-authored implementation reference, and the generated site now name the four start and resume spellings that accept `--id-file`. Generator-owned tests protect both copied site sections. Runtime behavior and production source did not change.

Ticket 0047 corrects the legacy run-list example. Help now demonstrates the real `1/rejected` rendered state, and an end-to-end proof creates that outcome and selects it through the documented filter. Command behavior and production size did not change.

Ticket 0048 corrects invariant witness 7. The witness now names all six ordinary control tools including `fault`, plus conditional `subflow`. Runtime and publication tests enforce exact membership, order, category, and the absence of stale counts. Tool behavior and production size did not change.

Ticket 0049 clarifies ADR 0008's status. Its original 14-event table remains intact as historical evidence, while active planning points to the current specification, schema ledger, constructor registry, and writer oracle. No replacement count is frozen. Runtime behavior and production size did not change.

Ticket 0050 removes the absorbed 2026-08-27 handoff. Its durable decisions already live in current ADRs, specifications, tests, tickets, and the SDLC README. An exact-path guard prevents that stale file from returning while future dated handoffs remain allowed. Production source did not change.

Ticket 0051 removes the retired root handoff, its obsolete review template, and the broken 2026-08 dogfood sweeper that read it. Current ADRs, specifications, planning, tests, tickets, and records already own the durable facts. The retained dogfood run evidence and Git preserve history. A repository check rejects the retired file and any new active planning or executable reference to it. Production source did not change.

Ticket 0052 records one `provider_start` before each logical Pi provider operation. The additive shape-1 fact carries provider, model, and stage-attempt identity. A timeout can now retain an honest start without inventing a turn. Production source grew by sixteen nonblank lines.

Ticket 0053 reconciles the Pi-first and retry decisions with current source. Pi 0.83.0 already exports a retry helper. A repeatable characterization separates two required behaviors from one adaptation cost and two unproved implementation differences. Bot requires the zero-usage fence and selected-attempt stream events. The message-to-stream boundary costs local code. Current evidence does not require the injected clock or current backoff-abort message shape. Bot keeps Pi 0.83.0 and its bounded 68-line retry adapter until a focused replacement design proves net deletion while preserving required observable behavior. A repeatable 0.85.1 spike found 94 TypeScript errors across 23 files, so a future update remains a qualified boundary migration. The retained operation snapshot proves only one provider. New provider-start records must supply normal durations and independently identified stalls before a detector becomes work.

Ticket 0054 records the Bot-owned source snapshot observed before each top-level run starts. A bounded deterministic digest covers `bot/package.json` and regular `bot/src/**/*.ts` bytes. Child records reuse the value. This evidence identifies the disk snapshot that Bot observed. It does not claim to identify modules that Node had already loaded.

Ticket 0055 establishes installation identity before more callers depend on run results. One explicitly initialized home now keeps one stored identity. The existing `home` noun exposes initialization and read-only inspection. New run records and structured start and resume results carry the identity. It landed on main as ticket 0038 while tickets 0038 through 0054 landed on the manual branch; the merge of 2026-09-06 renumbered it 0055.

Ticket 0056 merged main and the manual branch into one line and renumbered the parallel identity ticket 0055. Six conflicts were resolved as unions. The merge commit keeps main's source ceiling and the record's commit raises it, because the size-decision check cannot read a merge.

Ticket 0057 completes first-use identity creation. Start and resume now initialize a missing home through the existing protected writer, and the unused `bot home init` command is gone.

Ticket 0058 carries a direct provider failure cause into the assistant session and both terminal reasons. The retry event shape and retry behavior remain unchanged. The focused tests prove the persisted session, stage ending, run ending, malformed values, and UTF-8 bound.

Ticket 0059 adds `bot run check`. The reader lists every recording for a check name and returns safely held captures through 16 MiB. An exact file filter distinguishes gate folders. Sol Medium won the blind implementation comparison after both candidates received one remediation.

Ticket 0060 adds `bot home busy`. Human and JSON modes report the existing directory-liveness answer. Quiet mode matches the legacy command. A valid locked run proves relative busy and idle targets. Draft 0218 is complete.

Ticket 0061 adds end time and signed millisecond duration to `bot run list`. JSON preserves the accepted record timestamps and exact integer. Markdown shows elapsed end age and exact milliseconds. Unfinished and unreadable summaries report no invented timing. The legacy listing remains unchanged. Draft 0207 is complete. Draft 0209 is next.

Ticket 0062 exposes the Bot package version, Git source identity, and bounded source-tree hash through `bot capabilities`. The command shares its resolver and package-version fact with `run_start`. It reads package files and local Git. It reads no home, provider, credentials, network, or cache and creates no run. Draft 0209 is complete. Manual ticket 0063 makes lifecycle provenance independent of checkout umask. The permission issue is complete. Manual ticket 0064 makes provider-retry tests wait for published records under a bounded deadline. Draft 0181 is complete.

Ticket 0065 moves the disposable `bot find` index into the operator's XDG cache. A path hash separates homes. Directory identity and held-source digests prevent stale reuse after replacement. Searches leave the home unchanged. Status and prune remain unchanged. Draft 0203 is complete. Orphaned external find-cache cleanup remains a lower-priority gap.

Ticket 0066 makes copied install and update omit every source dot-entry. The selected root remains eligible. Local and Git sources share one lexical copy filter. Bot writes one root `.bot-source` after the copy. Visible bytes and executable bits remain unchanged. Links remain unchanged. Draft 0204 is complete.

Ticket 0067 removes the case-only collision from the wrong-case sentinel fixture without changing its refusal. The project lint gate now rejects tracked paths whose Unicode lowercase forms match and refuses invalid UTF-8 path bytes. Draft 0205 is complete. Draft 0206 is next under Luna High.

Ticket 0069 repairs the live smoke inspection drift exposed during ticket 0068. Token accounting and S6 now use current noun commands and stable machine results. Accounting failures stop their rung. Raw record paths never authorize direct filesystem reads. Draft 0221 is complete. Ticket 0068 can finish draft 0206's live acceptance.

Ticket 0068 normalizes the smoke session root after applying `SMOKE_HOME_ROOT`, `TMPDIR`, and `/tmp` precedence. Tests prove each path and preserve the strict home-ownership refusal. Both required live ladders passed. Draft 0206 is complete. Draft 0216 is next under Luna High.

Ticket 0070 removes tests that treat planning prose as an executable contract. A syntax-aware lint rule blocks direct planning-path dependencies in tests. A separate executable-surface test preserves the retired-handoff guard without reading prose. Draft 0216 is complete. Draft 0215 is next under Luna High.

Ticket 0071 folds three one-importer helpers into the modules that own their behavior. Help bytes, inspection limits, event exports, and event order remain unchanged. Seven stale cap comments now describe their real ownership boundaries. The exact source ratchet falls to 16,051. Draft 0215 is complete.

Ticket 0072 replaces the defensive source inventory with a plain sequential read of `package.json` and regular `src/**/*.ts` files. Stable-tree digest framing, run records, child reuse, and capabilities remain unchanged. Bot no longer imposes file, byte, or path quotas on its trusted installed program. The exact source ratchet falls to 15,995. Draft 0219 is complete.

Ticket 0073 replaces the assembly-update crash proof's timing-sized file tree and synchronous polling with a controlled boundary between the two existing renames. A separate process stops there and receives a real `SIGKILL`. Exact old and staged tree identities prove recovery. Every post-spawn outcome settles the child and removes its listeners before cleanup. Runtime behavior and production size remain unchanged. Draft 0222 is complete. Draft 0223 is next under Sol Medium.

Ticket 0074 gives each scripted hostile provider call explicit started, abort-observed, and settled states. The gating tests now wait for the exact call they intend to control. Ordered cleanup releases reachable work, settles the run and harness, drains the writer, and removes the root. Controlled failures prove cleanup before the first call and while a later call remains unreachable. Runtime behavior and production size remain unchanged. Draft 0223 is complete.

Ticket 0075 gives each coverage invocation a private report directory through inventory verification. Successful runs publish the retained summary through an atomic rename. Child settlement and cleanup follow one tested failure order. Concurrent runs cannot remove one another's in-progress reports. Runtime behavior and production size remain unchanged. Draft 0224 is complete. Draft 0226 is next under Luna High.

Ticket 0076 updates the read-only runtime workflow to reviewed Node 24 action releases while Bot stays on Node 22.22. The closed workflow contract rejects the old pins and mutable tags. The exact hosted implementation commit passed with no forced Node 20 warning annotation. Runtime behavior and production size remain unchanged. Draft 0226 is complete. Draft 0229 is next under Sol Medium.

Ticket 0077 limits the documentation build to read-only repository access. Only the deploy job receives Pages and identity-token write access. Checkout does not retain Git credentials. The closed workflow contract protects the permission boundary and workflow shape while leaving action pins to manual ticket 0078. The exact hosted implementation commit passed the runtime check, documentation build, and artifact upload. Deployment reached the known Pages-disabled 404. The external issue remains open. Draft 0229 remains active through the action pins and the following cross-workflow policy.

Ticket 0078 pins the documentation workflow's four direct actions to reviewed releases at immutable commits. The focused contract requires each exact action line and adjacent release comment. The exact hosted implementation commit passed the runtime check, documentation build, and artifact upload with no deprecated or forced Node 20 action-runtime annotation. Deployment reached the known Pages-disabled 404. The external issue remains open. Draft 0229 remains active until manual ticket 0079 establishes one inventory-based direct-reference and permission policy across both workflows.

Ticket 0079 adds one repository-wide policy for both maintained workflow files, all six direct action references, all three permission declarations, and two required job-level permission absences. A generic recursive inventory and 22 hostile mutations reject added workflows, changed references, reusable workflows, local or Docker actions, and permission drift. The exact hosted implementation commit passed the runtime check. Draft 0229 is complete. Draft 0225 is next under Luna High.

Ticket 0080 aligns the published pre-release and resume contracts with implemented behavior. The active specification and maintained guide now distinguish both resume commands, donor-derived inputs, fresh control resolution, the plain-root carry boundary, and the five containers that run fresh. One active-surface check rejects the removed command and retired compatibility promise while permitting honest refusals, negation, and excluded history. The exact hosted implementation head passed the runtime check, documentation build, and artifact upload. Deployment reached the known Pages-disabled 404. Draft 0225 is complete.

Ticket 0081 maps every production model invocation route and proves the missing real-runtime cases. Separate starts reread current configuration, resume uses current selection only for fresh work, assembly entry records its full selected bundle, providerless unique lookup records its actual provider, and child work excludes parent command and task choices. Runtime behavior and production source did not change. The exact hosted implementation head passed the runtime check. Draft 0227 is complete.

Ticket 0082 adds `bot run show` as the supported bounded one-run reading. One held record supplies exact root, stage, and subflow facts. A later lock sample distinguishes running and crashed work. Each stage-repeat scratch directory receives one observation shared across retries. JSON and human output share one ordered row prefix, byte limits, and warning facts. Two code-review rounds corrected text bounds, warning order, scratch reuse, access failures, and vacuous race proof. The exact hosted implementation head passed the runtime check. The documentation build and artifact upload passed before the known Pages-disabled deployment failure. Draft 0228 is complete. Draft 0230 is next under Luna High after design review.

Ticket 0083 migrates Bot smoke from human `bot show` rows to strict `bot run show -j` facts. The driver and S5, S6, and S10 now share one narrow parser. A source check prevents executable smoke callers from restoring the old form. Saved-session falsification, the complete offline gate, and independent review passed. Two live attempts stopped before model work because this machine reached its provider subscription limit. Ian accepted that machine-specific omission because Codex works on his other machine. Draft 0230 is complete.

Ticket 0084 prepares the `0.0.1` public-alpha source tree. The README and first-assembly guide now cover installation, model setup, supported inspection, compatibility, and the no-sandbox boundary. The current tree drops committed dogfood runs and absorbed notes. Mechanical checks protect public prose and credential filenames. Both production dependency audits report zero findings. Archived ticket 0231 preserves the former Bot and Pi availability mismatch. Tickets 0244 and 0245 closed it through Pi's shared model and authentication runtime.

Ticket 0085 preserves the complete pre-public ref state in a verified private bundle, preserves one untracked test separately, and removes every non-main worktree and branch, every tag, and the stash. Local and remote Git now expose only `main`. Repository visibility remains private.

## One main

From ticket 0056 on, the workstream commits on main. Each implementation ticket uses a short worktree branch from `origin/main` and lands by fast-forward after independent review and the complete check. Every commit belongs to only one ticket. One writer at a time prevents parallel lines from drifting. The next ticket comes from `sdlc/tickets/drafts/`, receives the next manual number here, and leaves a completion record when it lands. Remove each clean merged ticket worktree and branch after landing. Ticket 0085 completed a separately reviewed cleanup of every older worktree and ref. The repository now keeps only `main` between tickets.

## Historical plan from `5cd084a8`

The retained provider-retry finding does not require new work. `bot/tests/provider-retry.test.ts` has required the provider retry after a stage send-back to carry stage retry 2 since commit `5557f03f` on 2026-08-22. The focused test passed again at `c75df2b0`. The one retained invalid record came from an older writer.

1. Repair continuity and deterministic controls. Complete. Existing tests cover success, ordinary failure, and machinery faults. Tickets 0016 through 0018 added resumed-stage failure evidence, deterministic PARALLEL machinery-fault selection, and real outside-cancellation coverage for LOOP, CHOOSE, and PARALLEL.

2. Build the smaller FANOUT contract from current main. Complete. Ticket 0019 implemented the checked preceding-stage list, 32-item ceiling, root-only placement, bounded concurrency, complete child settlement, stable held-output handoff, honest interruption records, real resume, and additive shape-1 events. The blocked 0196 attempt was not used or altered.

3. Trim ADR 0026 before CLI implementation. Complete at the observed noun surface. Tickets 0020 through 0023 added `bot run list`, capability discovery, exact raw root-record access, and structured run creation. Tickets 0025, 0026, 0029, and 0034 added structured resume plus verified output, request, and record retrieval. A future noun command requires an observed caller. Ticket 0217 completed caller migration and old-surface deletion. The speculative 33-command matrix does not become work. Ticket 0055 added the installation identity that the replacement workflow runner reads. The [final cleanup plan](final-cleanup-plan.md) sets the deletion trigger.

4. Finish the contract and quality pass after behavior and command names settle. Complete. Tickets 0028, 0036, and 0039 through 0051 aligned publication, specification, help, examples, event vocabulary, access grammar, hook triggers, model network claims, slot facts, ADR status, and conformance evidence. Tickets 0035 and 0037 added a fresh non-root Linux runtime check and isolated it from ambient machine state. Ticket 0054 adds a deterministic identity for the bounded Bot-owned source snapshot observed before start. The record keeps checkout HEAD, lockfile bytes, Node, and provider-adapter facts separate. The source identity describes observed disk bytes and does not claim to prove which modules Node already loaded. `bot/tests/cli-assembly-update-swap.test.ts` already enforces atomic assembly replacement. Ticket 0042 added measured coverage for every production TypeScript module. Spawned child processes remain outside that measurement, and no percentage threshold turns the baseline into a quality claim. Non-root CI exercises permission tests that local root runs skip. No separate per-surface complexity ticket was created. The exact total ratchet, cyclomatic-10 cap, dead-code check, dependency-cycle check, and exact dependency pins enforce distinct boundaries. Ticket 0056 removed the per-file cap.

5. Exercise the pinned Pi boundary last. Complete. Ticket 0052 records the beginning of each logical provider operation. Ticket 0053 keeps 0.83.0 pinned, compares its existing retry helper with Bot's tested boundary, records the repeatable 0.85.1 migration spike, names the local adapter a qualified replacement must delete, and requires measured completed durations plus independently identified stalls before a detector becomes work.

No completed plan item creates another ticket automatically. Future noun commands require an observed caller. Legacy deletion requires every condition in its ledger. A retry-adapter replacement requires proved net deletion plus the two required observable behaviors. A stall detector requires measured completed durations and independently identified stalls.
