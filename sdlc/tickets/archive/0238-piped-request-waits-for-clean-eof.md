---
flow: build
priority: 1
---
# Piped request input waits for clean end-of-file

## Outcome

Bot accepts delayed piped request bytes without exposing a raw `EAGAIN`. A clean empty stream remains no request and receives the existing `request-invalid` result.

## Current facts

The CLI's `processStdin()` reads file descriptor zero synchronously. A nonblocking pipe can report `EAGAIN` before delayed bytes arrive. The published request rule says stdin supplies a request only when it holds bytes.

## Scope

Extract one internal asynchronous stream consumer. `processStdin()` passes `process.stdin` to it and consumes through clean end-of-file. Preserve `RunCommandBoundary.readStdin(): Promise<Buffer>` and `requestFor()` apart from their existing empty-stream behavior. Preserve every byte and the current absence of an application request-size limit.

A TTY, an explicit request argument, and a task file must not read or wait on stdin. Do not change the separate terminal-only reader used by `bot auth login`. Do not add a signal handler. The reader must settle on end-of-file or error and leave no listener or handle behind.

## Acceptance

Add a child helper that imports `processBoundary()`, writes a ready marker, and then calls `readStdin()`. The parent must wait for that marker before it writes at least two delayed chunks and closes the pipe. The chunks include a NUL byte and invalid UTF-8. The old synchronous implementation must fail with `EAGAIN`. The new implementation must return the exact joined bytes without decoding, a new newline, truncation, or a new limit.

A focused consumer test passes `createReadStream()` an open directory and requires the real `EISDIR` rejection. Another controlled stream emits a partial chunk and then fails. The consumer must reject and must not return the partial bytes. A direct `main()` test injects that rejecting read boundary and proves that no run is created. Clean empty end-of-file remains the distinct existing no-request refusal and creates no run.

Existing tests must continue to prove that TTY input, an explicit argument, and a task file bypass stdin. Each child helper must exit within the existing process deadline. Focused consumer tests compare listener counts before and after one successful end and one failure. Existing request tests and the complete repository check pass.

## Dependencies

None.

## Risk facts

Every run start crosses this ordered asynchronous input boundary when it has no higher-priority request. Deterministic process and stream tests bound the change.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: Delayed multi-chunk input, partial failure, exact bytes, and deterministic process-level proof govern correctness.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation exposes a new contract, state, timing, reach, proof, or cost-of-error fact.

## Review

- Design review: accepted after the empty-stream rule, deterministic timing proof, real error seam, and listener cleanup became exact
- Code review: accepted with no blocking findings after ten old and ten new delayed-pipe runs; the complete check corrected one size-decision label

## Size decision

- Starting production size: 16549 nonblank lines
- Ending production size: 16580 nonblank lines
- Simpler approach tried: use Node's built-in asynchronous stream consumer or async iteration.
- Why insufficient alternatives were rejected: both alternatives left one `end` listener and one `error` listener on a successful stream under Node 22.22.3. The ticket requires the consumer to leave no listener behind.
- Production code deleted: the synchronous file-descriptor reader was replaced, but the replacement needs one small internal module.
- Accepted cost: 31 nonblank production lines for byte collection, clean end-of-file handling, error rejection, and explicit listener cleanup.
