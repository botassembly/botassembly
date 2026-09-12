# Run start design

## Outcome

Ticket 0023 adds one new mutation spelling. `bot run start TARGET [REQUEST]` invokes the existing run runtime once. Human mode keeps the accepted final-output behavior. `--json` and `-j` return one bounded `bot.run.result` document for every run that reached `run_start`.

A started run remains a completed command result when its recorded exit is nonzero. The JSON document goes to standard output, standard error stays empty, and the process exits with the recorded run exit. A malformed invocation or a failure before `run_start` creates no durable run result. It writes the common bounded error document to standard error and exits with the error code.

The legacy `bot run TARGET ...` command keeps its parser, standard-output bytes, standard-error bytes, and exit behavior. Both spellings call the same invocation and runtime operation.

## Result contract

The JSON envelope has `schemaVersion: 1`, kind `bot.run.result`, and one `data` object. A started result always carries `run`, `startedAt`, `complete`, `exit`, and `cause`. It carries `endedAt` only when `run_end` was durably appended. It carries `reason`, `terminalStage`, `correlation`, and `output` only when those facts exist.

`terminalStage` carries `stage`, `retry`, and optional `repeat`, exactly as the ending event does. `reason` carries a UTF-8-safe prefix, original byte count, and a truncation flag. The reason prefix is at most 2,048 bytes. This result does not add usage. Usage requires a reading of retained turn events, and the runtime does not currently return it.

An accepted output descriptor carries `path`, `extension`, `bytes`, `sha256`, and `contentIncluded`. The descriptor comes from the output that the runtime already sealed and read before `run_end`; the CLI does not reopen it. When `contentIncluded` is true, the descriptor also carries `encoding` as `utf8` or `base64` and the complete `content` value. The renderer includes content only when serializing that candidate leaves the complete newline-terminated result at or below 65,536 bytes. Otherwise `contentIncluded` is false and the content fields are absent. The command never truncates accepted output into a value that looks complete. Binary data uses base64. UTF-8 data remains text. The document stays bounded even when JSON escaping expands otherwise small UTF-8 bytes.

`complete` states whether the root record durably accepted `run_end`. A writer failure may therefore return a started result with `complete: false`, no `endedAt`, and a fault exit. It never invents an ending timestamp. The command can still name the run that owns the incomplete evidence.

## Runtime facts

Keep `runCommand` as the one execution entry. Enrich its started result instead of parsing the record after execution. `run.ts` already knows the run name and exact `run_start` timestamp. `flow.ts` still holds the terminal identity, accepted output descriptor, output bytes, and exact `run_end` event immediately before returning. Preserve those facts through `FlowResult` and translate them once in `run.ts`.

Construct the ending event once in `flow.ts`, append that same object, and return it only after the append succeeds. A writer fault returns no ending and marks the record incomplete. The post-start request or id-file failure path in `run.ts` must follow the same rule: return the exact appended ending after success, or an incomplete fault result if appending it fails. This avoids a second record reader and prevents the result from disagreeing with the durable event.

Preserve the accepted output's existing `FlowSource` descriptor beside its bytes until `run.ts` builds the started result. Keep the current `output` buffer field used by the legacy renderer, or adapt the legacy renderer without changing its bytes. Do not expose `diskPath`.

## Correlation

`--correlation ID` accepts one nonempty opaque value of at most 256 UTF-8 bytes. The parser rejects a repeated, valueless, or oversized value before run creation. Bot neither normalizes nor assigns meaning to it.

Add the optional value to `run_start` and to the returned started result. This is an additive record-shape change under ADR 0024. Update the event constructor, field ledger, structural shape oracle, specification, and focused tests. Do not add uniqueness, lookup, filtering, replay, or receipt behavior. Resume support remains later work.

## Invocation and routing

Extract the existing legacy run orchestration into one shared operation. It owns request selection from an argument, `@task`, or piped standard input; run-only options; invocation resolution; model dependencies; and the single `runCommand` call. The legacy and new handlers provide separate renderers around that operation. Do not copy `requestFor`, `runDependencies`, or the invocation parser.

The new handler removes its output mode and correlation option, then passes the remaining target, request, `--` boundary, authored options, declared `--SLOT PATH` values, `--home`, `--in`, `--id-file`, and test-only `--script` through the existing invocation rules. `-j` and `--json` are identical. Repeated fixed options and malformed correlation fail before the runtime. Assembly-declared slot options remain dynamic and are validated by the existing captured-assembly reader.

Descriptor recognition remains ahead of the legacy `run` route. Add `run.start` to the compiled inventory only when its handler exists. Its descriptor reports Markdown and JSON modes, home writes, mutation true, conditional network behavior, the fixed Bot-owned options, result and reason bounds, correlation bound, and one dynamic option class for assembly-declared slots. The descriptor, generated help, parser, and handler agreement test must share exported option facts. Do not pretend that `--SLOT` is one literal accepted option.

## Rendering and errors

The new human renderer matches the legacy run renderer for accepted output, terminal diagnostics, refusals, and exit. Progress stays on standard error only when it is a terminal, as today.

The JSON renderer emits one document and one trailing newline. It does not emit progress or human terminal diagnostics. A started fault, refusal, rejection, exhaustion, block, timeout, or signal remains `bot.run.result` on standard output. The process exit matches the result.

Pre-start refusals use the common error envelope with operation `run.start`. A bounded details array may retain the first refusal facts and must report the exact omitted count. Unexpected pre-start dependency failures use their immediate typed cause. No error document can exceed the same 65,536-byte result bound.

`--id-file` keeps its existing purpose and timing. It publishes the run id after `run_start` and before the terminal result. JSON output never substitutes for this early supervisor channel.

## Source ownership

`run.ts` owns the enriched started result and the boundary between pre-start errors and durable runs. `flow.ts` owns returning the exact ending and accepted output facts it already creates. `record-events.ts` owns the additive correlation field. A shared run-command module owns the one invocation and execution path. A new run-start renderer owns the bounded result. `cli-contract.ts`, `new-command-dispatch.ts`, and `help.ts` own discovery, routing, and generated help.

The invocation and runtime specification chapters should name the new spelling, correlation field, and result boundary. The record chapter should add the optional `run_start.correlation` field. The inspection chapter should keep usage as a record reading. The changelog should state that the record remains shape 1.

## Red tests

1. A real scripted successful run through `bot run start ... -j` returns one `bot.run.result` document. Its run, start, end, terminal stage, exit, cause, completion, and output descriptor agree exactly with the retained record and output artifact.
2. Small UTF-8 and binary outputs return exact text and base64 content. A large output and a control-heavy UTF-8 output return only the exact descriptor. Every newline-terminated result stays at or below 65,536 bytes.
3. Refused, exhausted, rejected, blocked, timed-out, faulted, and signalled started runs return a result on standard output, no JSON diagnostic on standard error, and their recorded exit. A forced `run_end` write failure returns the run identity with `complete: false` and no invented `endedAt`.
4. An invalid target, invalid assembly, unavailable model, malformed option, and unexpected pre-start fault return a bounded `run.start` error on standard error, no standard output, and no retained run. The error test includes enough refusal text to prove clipping and the omitted count.
5. Correlation records and returns the exact value. Repeated, empty, valueless, and over-256-byte values refuse before run creation. Reusing a value starts a second independent run.
6. `--id-file` contains the same run id before the terminal JSON arrives. `--json` and `-j` are byte-identical. Explicit home, `BOT_HOME`, request arguments, task files, piped input, the `--` boundary, authored options, and one declared slot all pass through the existing invocation behavior.
7. Capability discovery and generated help report `run.start` only after the handler lands. Agreement tests cover every fixed option, the dynamic declared-slot class, the 65,536-byte document limit, the 2,048-byte reason limit, and the 256-byte correlation limit.
8. Existing legacy run success, refusal, fault, signal, progress, raw output, id-file, request, option, and slot tests remain byte-identical. A call-count seam proves each spelling invokes `runCommand` once.

## Cost and deferred work

The runtime result gains several facts that it already creates but currently discards. The command also adds one additive record field for caller correlation. The output result may omit inline content, so a program needs the later output artifact command for a large accepted answer. The descriptor still lets it verify those bytes without parsing the run record.

Usage, resume, wait, correlation filtering, caller migration, and legacy deletion remain separate work.
