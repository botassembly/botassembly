# Run record design

## Outcome

Ticket 0022 adds one new spelling for one existing reading. `bot run record RUN --raw` copies a selected root run's `record.jsonl` exactly as stored. It does not parse or endorse the record. The legacy `bot show RUN --raw` spelling stays supported and keeps its current bytes.

The new command has no rendered or JSON form. `--raw` is required. `RUN` is a full run name or an unambiguous prefix. `--home DIR` uses the common precedence of an explicit value, `BOT_HOME`, and the platform default. The command has no child selector.

## Existing reader

`inspectRawShow` in `raw-record.ts` remains the only record-byte operation. The new handler calls it with no child. The reader selects one run directory, safely opens its root `record.jsonl`, fixes the byte extent from that descriptor, and streams through `copyHeldRunFile`. The handler must use the CLI boundary's raw writable stream. A fallback writable may adapt the ordinary boundary for unit tests. No handler reads, buffers, parses, hashes, or reopens the record.

This delegation preserves the established contract. Empty files and files containing invalid UTF-8, malformed JSONL, a torn final segment, an impossible story, an unsupported record value, or more than the semantic reader's limit all copy exactly. A link, missing path, non-file, unsafe replacement before open, or initially unreadable file publishes no bytes and exits `1`. The opened descriptor survives a later path replacement. The snapshot does not chase appends. A short read, output failure, or descriptor-close failure exits `1` and may leave exact bytes already written. A closed pipe exits `0` without a diagnostic.

## Parsing and routing

Add `run.record` to the closed new-operation type and compiled command descriptors. The descriptor uses command words `run record`, mode `raw`, home behavior `reads`, mutation `false`, network `never`, options `--home` and `--raw`, and no content-size limit. Raw payloads have no schema version. Extend the descriptor output type with a raw-output variant instead of assigning a structured result kind to bytes that carry no envelope.

The new handler receives the suffix after `run record`. It removes one common `--home DIR`, then accepts exactly one `RUN` and exactly one `--raw`. A missing run, missing raw flag, repeated flag, repeated or valueless home, `--json`, `-j`, `--child`, `--check`, or any unknown option is malformed input. It writes no standard output, gives one bounded inert diagnostic, and exits `2`. Accepted read failures keep the existing reader's exit and stream behavior.

Descriptor recognition remains ahead of the legacy `run` parser. `bot run record ...` can therefore never start an assembly named `record`. Other legacy `bot run TARGET ...` requests keep their current route. `bot run --help`, `bot show --help`, and every legacy raw invocation keep their current output. Bare help gains the implemented command, and `bot run record --help` is generated from the descriptor plus short explanatory prose.

The descriptor infrastructure currently assumes every command returns a versioned document and supports only Markdown or JSON modes. Generalize only those two descriptor fields. Structured commands keep their existing descriptor objects and generated help bytes. The capabilities result gains one `run.record` row only after its handler exists.

## Source ownership

`cli-contract.ts` owns the `run.record` descriptor and the raw-output descriptor variant. `new-command-dispatch.ts` owns the typed handler entry. A small `run-record-command.ts` owns only suffix validation, home selection, and delegation to `inspectRawShow`. `help.ts` owns the command's prose and renders raw output without a fabricated schema version. `raw-record.ts` and `run-files.ts` keep all record selection, authorization, held-file, streaming, and failure behavior.

The inspection specification should name the new spelling beside the retained legacy spelling. The changelog should record the new route and state that it delegates to the existing root-record reader. No record, record shape, reader, or writer changes.

## Red tests

1. Through the real CLI, `bot run record RUN --raw` returns byte-identical output for empty, invalid UTF-8, malformed, torn, structurally invalid, unsupported-format, and oversized root records. Each result equals `bot show RUN --raw`.
2. The new route preserves the existing replacement-before-open refusal, replacement-after-open snapshot, append boundary, short-read partial output, output-failure partial output, descriptor-close result, backpressure, and quiet closed-pipe behavior. The tests exercise the new command through the real CLI. Existing reader tests remain the proof for the shared mechanism.
3. Missing `RUN` or `--raw`, repeated `--raw` or `--home`, a valueless home, JSON flags, child or check selection, and unknown options exit `2` with empty standard output. These requests do not reach the home or legacy run-start parser.
4. Explicit `--home` wins over `BOT_HOME`. `BOT_HOME` wins over the default. A missing, ambiguous, linked, non-file, or unreadable selected root record keeps the accepted reader's result.
5. `bot capabilities -j` reports exactly `capabilities`, `run.list`, and `run.record`. The new descriptor reports raw mode, root-home reading, no mutation, no network, and only its accepted options. Descriptor, handler, parser, and help agreement tests fail when one side drifts.
6. Bare help and `bot run record --help` advertise the implemented route. Existing `bot run --help`, `bot show --help`, and representative legacy raw output remain byte-identical.

## Cost and deferred work

The capability descriptor gains a small union because raw bytes do not have a structured result schema. The new handler adds routing and validation but no record-reading behavior.

Child records remain on `bot show RUN --child REFERENCE --raw`. Rendered and structured record readings belong to `bot run show`. Caller migration and legacy deletion remain later work.
