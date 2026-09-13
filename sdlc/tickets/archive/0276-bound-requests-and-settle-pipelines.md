---
flow: build
priority: 2
deps: []
---
# Bound requests and settle pipelines

## Outcome

Bot admits at most 4 MiB of request bytes from an argument, task file, standard input, or resumed donor. It refuses a larger request before a new run is born. Ordinary command output observes backpressure and delivery failure, treats an early-closing reader as quiet success, and never prints an uncaught stream stack. Existing raw retrieval keeps its stronger fixed-extent streaming contract.

## Current facts

- `readByteStream` accumulates standard input without a limit and waits for end-of-file. A large or endless producer can grow Bot's memory before run birth.
- Direct request strings and task files have no application limit. Task Markdown is read as one unbounded string before its frontmatter and body are separated.
- Resume uses a generic 1 MiB semantic inspection reader for the retained request. A valid fresh request above 1 MiB can run and stream back through `bot run request`, but cannot resume.
- Bot already accepts and tests requests above 1 MiB. Its session page-source bound is 4 MiB, while unrelated child-process output and temporary-storage limits are larger.
- Raw request, output, and record delivery already holds a verified file extent, streams with bounded memory and backpressure, reports non-pipe delivery failures, and treats `EPIPE` as quiet success.
- Ordinary output calls `process.stdout.write` without awaiting its callback. `exitFlushed` waits on empty writes but ignores prior errors. A real command redirected to `/dev/full` can report success or surface an uncaught `ENOSPC` stack.

## Scope

- Define one exported application request maximum of 4,194,304 bytes. The bound is inclusive and uses exact bytes. A request of 4,194,304 bytes is admitted; 4,194,305 is refused.
- Apply the bound to UTF-8 bytes of direct request arguments before home access or run creation. The operating system may impose a smaller argument limit; Bot's application contract remains the same.
- Apply the bound to the complete task-file source before Markdown parsing and separately to the retained task body after the existing parser removes frontmatter and comments, applies its current malformed-prose replacement, and normalizes fenced CRLF. Read at most the maximum plus one byte from the seekable file. Do not add a generic spool or unbounded synchronous read. Preserve that existing parsed-body behavior, task extension, frontmatter options, and `via: task` evidence for admitted files.
- Make standard-input collection incremental and retain no more than the maximum plus one byte. Refuse as soon as the bound is crossed, remove owned listeners, and do not wait for producer end-of-file. Preserve exact admitted bytes, clean end-of-file, empty-input refusal, stream-error classification, and the rule that an argument or task file prevents any stdin read.
- Enforce the same request bound during resume with a request-specific held-file read. Requests from older donors above the bound remain available through raw inspection but cannot start a resumed run. Refuse them before new run identity, directory, record, or id-file publication.
- Give every ordinary CLI stdout write one process-owned, awaited delivery path without changing the synchronous boundary used by command modules and tests. Preserve write ordering. Before explicit process exit, wait for queued writes and settle callback and error-event races exactly once. After the first delivery failure, settle later queued writes without attempting them against the failed destination.
- Preserve an existing nonzero command status after any delivery outcome. A successful command followed by stdout `EPIPE` remains quiet success. A successful command followed by `ENOSPC`, `EIO`, or another non-pipe delivery failure exits nonzero and writes one bounded inert delivery diagnostic to stderr with no JavaScript stack. A nonzero command with a non-pipe delivery failure keeps its command status and adds at most one bounded delivery diagnostic; `EPIPE` adds nothing.
- Preserve the raw-output adapter and its existing exit policy, fixed-extent reads, bounded diagnostics, exact-prefix behavior, and tests. Share lower-level settlement code only when that makes the existing guarantees clearer; do not rewrite working raw retrieval.
- Replace the broad claim that Bot “is a POSIX program” with the concrete supported command-line contract: byte-preserving streams, stdout/stderr separation, delivery backpressure, quiet early close, honest delivery status, and signal exits on Linux, macOS, and WSL. The synchronous command boundary does not promise bounded memory for generated ordinary output; several readings and run results are materialized before delivery. Do not claim formal POSIX certification or native Windows support.
- Update invocation, runtime, inspection, help, CLI contract, conformance, changelog, and witnesses where their current size or stream claims change.
- Do not edit or wrap Pi, constrain model context, add whole-run budgets, change subflow child-output limits, alter raw inspection size rules, add containment, or introduce provider work into tests.

## Acceptance

Start with failing focused tests. Each request source proves exact maximum acceptance and maximum-plus-one refusal. Direct argument and oversized task cases refuse before home access. The task reader proves both source and retained parsed-body bounds without an unbounded read, including a source within the limit whose malformed-prose replacement makes the encoded parsed body exceed the limit. Standard input proves bounded retained memory, immediate overflow settlement without waiting for EOF, listener cleanup, exact bytes at the boundary, clean EOF, empty input, injected stream failure, and argument/task precedence.

Resume proves a valid donor request between 1 MiB and 4 MiB succeeds, an exact-maximum donor succeeds, and a maximum-plus-one historical donor remains raw-readable but refuses resume before any new run artifact. Fresh and resumed refusals use the same stable request-size diagnosis.

Real child-process tests exercise ordinary help, one bounded JSON reading, one completed run result, and failed or signalled run output. Piping successful output to an early-closing `head`-style reader produces no stack, no stderr, prompt settlement, and exit zero. Redirecting successful ordinary output to `/dev/full` produces one bounded delivery diagnosis and nonzero exit without a stack. Failed and signalled commands retain their existing nonzero status under `EPIPE` and non-pipe delivery failure, with no pipe diagnostic and at most one non-pipe delivery diagnostic. Focused sink tests prove callback and error-event races settle once, later queued writes are not attempted after failure, and a delayed destination applies real backpressure before exit. A paused reader receives bytes in order. Existing raw closed-pipe, paused-reader, `/dev/full`, mutation, and integrity tests remain unchanged and green.

Conformance pins the 4 MiB inclusive request limit, pre-birth refusal, task-source rule, resume behavior, and concrete Unix stream contract. Run focused suites continuously, then the complete local gate. Independent code review must inspect memory bounds, listener races, file replacement behavior, process-exit ordering, duplicate diagnostics, and all raw-output regressions. The implementation and completion commits pass hosted checks.

## Dependencies

Ticket 0275 makes hosted documentation wait for the complete check. Platform qualification later proves this contract on macOS and keeps the same Linux behavior. Pi remains reference-only.

## Risk facts

This deliberately selects 4 MiB as a request-specific application policy: it preserves the repository's proven requests above 1 MiB, leaves room for large document work, and places a conservative finite ceiling below unrelated process-output and storage limits. The existing 4 MiB session page target supports consistency but does not itself prove the choice. New larger requests and resume of older larger requests refuse. A task file also refuses when oversized frontmatter pushes its complete source above 4 MiB, even if the retained body is smaller. A standard-input overflow can close the pipe while its producer is still writing, so the producer may receive `EPIPE`. A process-output queue can hang exit or duplicate errors if callback and error-event races are not settled once. The raw path already solves harder file-delivery races and must not regress.

## Size decision

- Starting production size: 17962 nonblank lines
- Ending production size: 18142 nonblank lines
- Simpler approach tried: Limit stdin alone and keep empty-write flushing for output.
- Why insufficient alternatives were rejected: Other request sources would keep inconsistent bounds, resume would remain broken above 1 MiB, and ordinary commands could still claim delivery they did not complete.
- Production code added: One shared request limit, a bounded seekable-file seam, request checks at the existing argument, task, stdin, and resume boundaries, and one process-owned ordinary-output settlement path. Raw retrieval and Pi remain unchanged.
- Production code deleted: None. The ticket adds limits and delivery settlement at existing boundaries without replacing the separate raw-output path.
- Accepted cost: Focused cross-source boundary tests and real subprocess pipeline tests become permanent compatibility checks.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 8
- Minimum level floor: 3, because stream callback and process-exit concurrency can hang or misreport an otherwise completed program.
- Final level: 3
- Reasons: The feature is one command-line reliability contract, but it spans request selection, task parsing, stdin lifetime, resume, process-wide stdout settlement, specifications, conformance, and real child processes.
- Selected model: `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: The 2026-09-13 POSIX-style pipeline and remaining-work surveys confirmed unbounded request ingestion, a 1 MiB resume mismatch, and unobserved ordinary stdout failure. They separately confirmed that raw delivery is already strong and that the direct `pi | head` crash belongs to Pi's CLI, which Bot does not invoke.
- Design review: rejected once. The first review required the existing parsed-task transformation semantics, a replacement-expansion body-bound proof, exact stdout exit precedence across successful, failed, and signalled commands, callback and queued-write race tests, an honest ordinary-output memory boundary, request-specific support for 4 MiB, and corrected level-3 routing.
- Code review: rejected twice, then accepted. The first review found that ordinary stdout released its error listener before delayed destroy settlement, raw `/dev/full` received a duplicate ordinary diagnostic during exit flush, and the initial tests did not prove the complete pre-birth, resume, replacement, subprocess-status, and paused-reader contract. The second review required direct witnesses for oversized resume artifacts, the bounded task-file read, pre-home refusal, and already-queued output after failure. The remediation keeps process-lifetime ordinary error ownership, preserves raw exit ownership, adds every focused witness, and passed the final independent review.
- Completion: implementation commit `c193f93c6e97dbab5b79b5b5c69bcc8efe231a6a` passed the complete local gate, hosted runtime run `34779985976`, and hosted documentation run `34779986165` with its nested same-commit complete check before archival.
