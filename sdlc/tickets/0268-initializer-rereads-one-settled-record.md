---
flow: build
priority: 1
deps: []
---
# Initializer rereads one settled installation record

## Outcome

Concurrent initialization returns the one published installation identity when removal of the winner's temporary hard link overlaps another initializer's record read. Bot never parses bytes from the changing read, ordinary reads remain fail-fast, and a second instability fails.

## Current facts

Installation publication writes and synchronizes a private temporary file, hard-links it atomically to `installation.json`, removes the temporary name, synchronizes the home, and reads the winner. The hard link briefly gives the record two names. Removing the temporary name changes the shared inode's link count and ctime without changing its contents.

Hosted runtime run 34711681836 returned child statuses `[0, 1]` in the barrier-synchronized initialization proof. The old fixture stopped collecting output on the child `exit` event, so it hid the failed child's error. A deterministic direct-child schedule now establishes the production cause: one initializer opens the winner at link count two, the winner removes its temporary name, and the reader rejects the resulting two-to-one transition as `record-changed` with exit 5.

## Scope

Keep the stable-record contract strict by default. Classify only this transition as eligible for a bounded initializer reread:

- The descriptor and final path still name the same inode.
- Link count changes from exactly two to exactly one.
- Size, mode, owner, group, and modification time remain unchanged.
- The final descriptor and final named path have one complete identical snapshot, including ctime and link count.
- The Bot home remains the same private held directory.

An initializer discards the complete changing read without parsing it or applying its identity. It closes that descriptor and performs exactly one new read through the unchanged strict path. The second read receives no settlement allowance. Any second change fails as `record-changed`. `readInstallation` receives no reread allowance and remains fail-fast. The code does not attribute the removed link to Bot because inode metadata cannot prove which directory entry disappeared.

Repair the process proof without exposing failure text. Await child `exit`, child `close`, and completion of both output streams. Prove exit and close report the same code and signal when both events exist. The fixture awaits its output write. Remove every name from the shared credential environment registry before spawning the child, and keep the child process home separate from the Bot home.

The launcher owns two five-second monotonic deadlines: one from spawn until `ready`, and one from release until complete settlement. A deadline sends `SIGKILL`, disconnects IPC, destroys both output streams, and allows one further one-second cleanup deadline for `exit` and `close`. The safe result records whether each event arrived. It returns after that cleanup deadline even if the operating system reports no event. These deadlines apply only to the test harness. Production initialization adds no delay, polling, or clock.

Retain at most 1,024 stdout bytes and 4,096 stderr bytes. Continue draining and incrementally hashing every byte until settlement or forced stream destruction. Record full byte counts, lowercase SHA-256 digests, and separate overflow flags. An overflow makes the child result fail without printing retained content. Parse a success result only from complete, non-overflowing stdout. Parse a failure diagnostic only from complete, non-overflowing stderr.

A failed fixture may emit one JSON object with these fields and no others: `name` is 1 through 64 ASCII bytes matching `[A-Za-z][A-Za-z0-9]*`; `causeCode` is absent or 1 through 64 ASCII bytes matching `[a-z0-9-]+`; `exit` is absent or one of 3, 4, and 5; `published` is absent or Boolean; `systemCodes` contains at most eight strings, each 1 through 64 ASCII bytes matching `[A-Z][A-Z0-9_]*`. The parent never reports raw stdout or stderr.

Every abnormal harness result has one stable reason selected by this first-match precedence: `spawn-error`, `child-error`, `ready-timeout`, `exit-before-ready`, `close-before-ready`, `ipc-disconnected`, `settlement-timeout`, `cleanup-timeout`, `stdout-error`, `stderr-error`, `status-disagreement`, `stdout-overflow`, `stderr-overflow`, `success-invalid`, then `diagnostic-invalid`. `spawn-error` means an `error` before the child emits `spawn`; a later `error` is `child-error`. A pre-ready exit, close, or IPC disconnect sets its named fact and resolves the ready wait. A deadline remains the reason when its forced termination later produces another event. If both streams fail or overflow, stdout wins by the stated order. Process and deadline reasons precede stream, status, overflow, and parsing reasons. Stream errors resolve settlement and trigger the same forced cleanup path.

The safe result includes separate presence flags, codes, and signals for `exit` and `close`. A code is `null` or an integer from 0 through 255. A signal is `null` or a Node signal name that matches `SIG[A-Z0-9]+` within 32 ASCII bytes. Spawn failure and cleanup expiry permit absent process events. Missing events use `present: false`, code `null`, and signal `null`. Signal names, event presence, bounded codes, counts, hashes, overflow flags, allowlisted diagnostic fields, and the stable reason are the only reportable facts.

The scope includes the smallest test-only timing seam needed to place the record transition after the descriptor snapshot. It excludes installation format changes, locks, production retries beyond the one strict reread, production delays or polling, and changes to normal record reading.

## Acceptance

A deterministic red proof with the repair disabled produces a successful winner and a loser whose exit and close statuses are 1 with safe diagnostic fields `record-changed`, exit 5, and `published: false`. With the repair enabled, both direct child processes return the same installation identity, the final record has one link, and no temporary entry remains.

Focused tests also prove an unrelated outside-home hard link changing from two links to one causes the initializer to discard its first read and succeed only after one fresh strict read. A second link change during that strict reread fails. `readInstallation` rejects the first transition without rereading. Existing mutation, ownership, mode, path-swap, durability, cleanup, and same-process concurrency proofs remain green.

The harness accepts injected ready, settlement, and cleanup deadlines for focused tests while production fixtures use 5,000, 5,000, and 1,000 milliseconds. Deadline tests inject shorter values and require completion before one fixed two-second outer bound. They do not assert exact elapsed time under scheduler load.

Tests force every abnormal launcher reason without printing captured content. They prove each injected deadline returns before the outer bound, output beyond each cap is drained but not retained, hashes cover the full drained streams, spawn failure permits absent process events, and exit/close disagreement fails. Focused installation tests, repeated direct-process tests, static checks, `git diff --check`, the production-size check, and the complete local and hosted gates pass.

## Risk facts

Parsing bytes from the changing read would weaken the record mutation boundary. An unbounded retry could hide a persistent attacker or filesystem fault. Waiting only for IPC or exit can hang or discard the error that explains a child failure. Raw child errors can contain paths or inherited values, so diagnostics remain allowlisted and hashed.

## Size decision

- Starting production size: 18344 nonblank lines
- Ending production size: 18379 nonblank lines
- Simpler approach tried: Repair only child output drainage, then accept the changing read when its metadata matched a two-to-one link transition.
- Why insufficient alternatives were rejected: Output drainage cannot explain status 1. Parsing the first read cannot attribute the removed link and weakens mutation detection. Locks, polling, and unbounded retries add state or thresholds without need. One discarded read followed by one strict read handles the proved transition and fails on recurrence.
- Production code deleted: No production line can be removed without retaining the false `record-changed` result or weakening another record check.
- Accepted cost: 35 net nonblank production lines add one test timing seam, classify the exact transition, discard that read, and perform one strict initializer-only reread.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 8
- Minimum level floor: 4, because the change touches security-sensitive concurrent identity publication.
- Final level: 4
- Reasons: The production change is local, but a false acceptance weakens installation identity checks and a false rejection breaks concurrent initialization.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Origin: hosted verification for ticket 0267 found the race. Ticket 0267's code review rejected two inline repairs before requiring this separate prerequisite ticket. The first repair explained only incomplete child output. The second parsed an unverifiable link transition. This ticket retains the bounded reread design and its direct proof.
- Design review: rejected twice. The production reread boundary was accepted throughout. The first harness contract depended on the framework timeout, retained unbounded output, and left abnormal event results implicit. The second bounded time and output but omitted pre-ready reasons, reason precedence, bounded status fields, and schedulable deadline-test rules. The revised contract defines all four.
- Red-green evidence: With the reread disabled, the deterministic direct-child schedule returned winner status 0 and loser exit and close status 1 with only the safe diagnostic fields `record-changed`, exit 5, and `published: false`. The accepted implementation discards the transitioning read and performs one strict reread. The same direct children then return status 0 and identical complete-output digests.
- Code review: rejected once. The first accepted implementation did not turn a rejected stream-completion promise into a failure, allowed cleanup-induced child errors to replace a selected deadline, left digests mutable after cleanup expiry, allowed process-control methods to throw, and treated any IPC message as readiness. The repair latches selected deadlines, converts guarded process-control failures into safe facts, freezes output capture before digest finalization, accepts only the exact `ready` message, and records stream-completion rejection without requiring an error event.
- Harness evidence: Thirty-eight focused harness tests force every stable abnormal reason, precedence between competing facts, all three injected deadlines under one two-second outer bound, forced cleanup, absent events, exit and close disagreement, both output caps, full-stream counts and incremental hashes, strict success and diagnostic shapes, bounded status fields, shared-registry environment scrubbing, and late output after result settlement. Dedicated regressions cover rejected stdout and stderr completion promises, cleanup-induced child errors after ready and settlement deadlines, late stream and process events after cleanup expiry, throwing `disconnect`, `kill`, and `send`, and unexpected IPC messages. The result exposes no retained child bytes. The three focused files pass 77 tests, and the direct-process installation file passed 20 consecutive repetitions outside the sandbox after remediation.
- Verification: The complete local repository gate passed with the 18344-to-18379 production-size decision, repository and documentation checks, runtime and conformance tests, lint, type checking, unused-code analysis, cycle detection, and exact dependency checks. `git diff --check` passed. Hosted verification remains the publication step.
