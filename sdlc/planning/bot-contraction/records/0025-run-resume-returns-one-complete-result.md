---
flow: build
priority: 8
completed: 2026-09-05
---
# Run resume returns one complete result

## Result

`bot run resume RUN` now uses the established donor validator, continuation planner, and run runtime. Human mode preserves the accepted output from `bot resume`. `--json` and `-j` return the bounded `bot.run.result` document with the donor and durable carried-stage facts.

A resumed result always reports the number of stages whose `stage_carried` events were durably appended. It includes the complete ordered identities when the document bound permits. It explicitly reports identity omission when the complete list would exceed the bound. A copy failure reports only the durable prefix. The command does not reread the record.

Opaque correlation follows the run-start contract. Capability discovery and generated help now report the implemented `run.resume` operation. The command rejects the meaningless `--` separator before home or donor work. Repeated fixed options fail while assembly-declared slot options retain their existing validation path.

## Review and red-green evidence

Independent design review rejected the first ticket because a planned carried prefix could overstate a partial copy. The revised ticket defined a carry only after durable record append. It also required a bounded large-prefix result. The reviewer accepted the revision.

Initial tests failed because no compiled `run.resume` operation, parser, result facts, or route existed. The implementation extracted continuation materialization from `run.ts` and accumulated carried identities only after each awaited record append. Focused tests then passed successful resume, donor refusal, zero and partial carries, large-prefix omission, correlation, help, capabilities, and legacy output.

Independent code review found three defects. The oversized-result fallback named `run.start` and its stderr was discarded. Empty resume correlation also named run start. The inherited separator produced ambiguous parsing. Red tests reproduced all three. The shared renderer now receives the operation and label, the command writes both returned channels, correlation errors use the supplied label, and resume rejects the separator before any state read. The reviewer accepted the remediation. The complete static gate later found one unused export, which the implementer removed and the reviewer accepted.

## Cost and deferred work

Production source grew from 14,771 to 14,887 nonblank lines. The 116-line increase provides the compiled route, structured resume result, exact durable carry accounting, bounded identity omission, shared run-mutation parsing and rendering, generated help, and specification changes. Existing continuation-copy behavior moved into a local module to keep `run.ts` within its file limit.

Run wait, correlation filtering, remaining noun commands, caller migration, and legacy deletion remain separate work.

## Checks

The first complete run found one failure in an existing raw-record backpressure test. That focused process test then passed ten consecutive runs. A second complete run was killed with exit 137 while the machine carried full swap and multiple unrelated multi-gigabyte compilers. No assertion failed in that run.

The complete test suite then passed all 199 files and 1,312 tests with two workers, including 143 of 143 conformance cases. This changed test concurrency but not coverage. ESLint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 14,887-line source ratchet, specification checks, and `git diff --check` passed.
