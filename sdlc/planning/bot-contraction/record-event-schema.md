# Record event schema

## Shared rules

Record shape 1 has a closed event-name vocabulary. The current names are `run_start`, `run_end`, `stage_carried`, `stage_start`, `prompt`, `stage_end`, `unreconciled`, `tmp_teardown`, `provider_start`, `turn`, `provider_retry`, `provider_transport`, `gate_start`, `check`, `tool_call`, `tool_denied`, `subflow_call`, `chose`, `loop_done`, `parallel_done`, `fanout_start`, `fanout_done`, `hook`, `hash_drift`, and `signal`. A shape-1 reader rejects an unknown event name. It permits unknown fields on a known event because additive fields remain compatible within the shape. Known fields must retain their defined types and relationships.

The implementation keeps a mechanically tied two-module split. A constructor registry beside the event constructors owns the event-name keys and derives the TypeScript event-name type and event union. Exhaustive typed validators and identity subsets remain in the record-shape module. The compiler and a mechanical coverage ledger tie those exhaustive structures to the constructor registry and fail when a constructor or field lacks coverage. The specification's event inventory is checked against the constructor registry.

Every event requires `ts` as an ISO 8601 string and `event` as its literal name. A stage identity requires a nonempty captured node path, positive integer `retry`, and optional positive integer `repeat`. The three identity fields appear together where identity is optional. Paths to retained material are normalized, run-relative paths with no empty, dot, parent, or absolute segment. A SHA-256 value contains 64 lowercase hexadecimal characters. Counts, byte sizes, token usage, delays, call numbers, depths, widths, and concurrency are finite safe integers. Counts and usage are nonnegative. Retry, repeat, call, width, and started concurrency are positive.

The current shape-1 story also binds trusted paths to the writer's directory layout. A top-level request uses `request.<input extension>` and source `argument`, `task`, or `stdin`; a separately opened child may use `subflow`. Every current stage start records workdir. An ordinary output-bearing stage records slots before settlement; CHOOSE omits them. A stage session uses `stages/<stage>/<repeat-or-1>/session.jsonl`. The root-relative resolved workdir and absolute `slots.pwd` agree. A check or hook capture uses the exact matching attempt directory and check or hook name. A stage output uses that attempt directory and its output extension. These semantic path rules apply to the current string fields. The later descriptor changes below must preserve the same ownership when they change those fields together.

Legal terminal pairs are `success/0`; `refused/1`; `exhausted/1`; `rejected/1`; `blocked/1`; `timeout/1` for agent work; `timeout/2` for machinery; `fault/2`; and one exact outside-signal triple: `SIGHUP/1/129`, `SIGINT/2/130`, or `SIGTERM/15/143`. A signal ending requires the matching outside `signal` event before `run_end`. The writer may append a stage, subflow, LOOP, or PARALLEL signal terminal fact before its queued signal row. That terminal fact creates a sequential pending requirement. A matching later signal satisfies it. A mismatch or `run_end` first is invalid. Known optional fields cannot appear with `undefined` or `null` unless their schema names that value.

The mutation suite covers every constructor field. It removes every required field, supplies a wrong type for every known field, breaks every conditional or partial group, adds nested extras where nested shapes are closed, and adds unknown top-level fields where additive compatibility applies. The coverage ledger compares those cases with the constructor registry and fails when a constructor gains an uncovered field.

## Required event shapes

| Event | Required fields after shared fields | Optional groups and relationships |
| --- | --- | --- |
| `run_start` | `record: 1`, nonempty `runtime`, `run`, `assembly`, `assembly_hash`, and request descriptor | `flow`, `continued_from`, bounded opaque `correlation`, and absolute `workdir`; the current writer's runtime provenance group includes the observed source-tree SHA-256, while retained shape-1 groups without that additive field remain readable |
| `run_end` | legal `exit` and `cause` | complete stage identity; bounded `reason`; hashed capture descriptor |
| `stage_carried` | stage identity, `from`, and hashed output descriptor | none |
| `stage_start` | stage identity, `received` descriptors, option ladder, and current production workdir | a current ordinary output-bearing stage records slots before settlement; optional `slots.subflows` equals the exact supplied `SUBFLOWS` environment string and is absent when that variable is unavailable; CHOOSE omits slots; session uses the exact `stages/<stage>/<repeat-or-1>/session.jsonl` path; recorded slots are absolute; workdir authored and resolved forms agree; resolved workdir under the run root equals `slots.pwd`; tools, skills, and access retain their current closed nested shapes |
| `prompt` | stage identity and prompt-source array | none |
| `stage_end` | stage identity plus legal `exit` and `cause` | output, `sealed`, and `judged` appear together; bounded `reason`; hashed capture descriptor |
| `unreconciled` | stage identity, `started`, and `stopped` timestamps | none |
| `tmp_teardown` | bounded `reason` | complete optional stage identity and capture descriptor |
| `provider_start` | stage identity, provider, and model | the current writer emits one before each logical provider operation; a matching turn follows on completion, while an interrupted operation may retain only its start |
| `turn` | stage identity, provider, model, nonnegative input, output, cache-read, cache-write, and total usage, plus stop reason | none |
| `provider_retry` | stage identity, positive attempt, and nonnegative delay | none |
| `provider_transport` | stage identity, transport, and source | requested source has no diagnostic fields; diagnostic source requires configured transport, event-emission fact, phase, and bounded error, with optional fallback transport and `error.capture` |
| `gate_start` | stage identity, executable path, and hash | none |
| `check` | stage identity, known check kind, integer or null exit, and hashed capture descriptor | executable file and executable hash appear together only for a gate |
| `tool_call` | stage identity, known control tool, and decision | mark requires positive item and bounded evidence; bounded reason appears only when supplied; oversized fields use `evidence_capture` or `reason_capture` |
| `tool_denied` | stage identity, tool, and boundary | none |
| `subflow_call` | stage identity, positive call, flow, nonnegative depth, and started boolean | started ordinary outcome requires input descriptor, child, legal exit, and cause; a file-backed input path exactly names the normalized retained `request.<extension>` beneath that child; started machinery failure preserves that input and child and carries a bounded reason without exit or cause; unstarted call has no child or terminal pair and may carry input plus bounded reason; oversized reason uses `reason_capture` |
| `chose` | stage identity, selected alternative, complete declined array, and bounded reason | oversized reason uses `reason_capture` |
| `loop_done` | stage identity, positive repeat count, and current `ended_by` from `stop`, `limit`, `refused`, `exhausted`, `rejected`, `blocked`, `timeout`, or `fault` | bounded reason and optional `reason_capture` |
| `parallel_done` | stage identity, positive authored width no greater than 32, measured concurrency no greater than the started-row count, and branch rows | one row per branch; a started row has legal exit and cause; an unstarted row has neither; an all-unstarted table represents only fault or signal settlement |
| `hook` | stage identity, known hook, integer or null exit, hashed capture descriptor, and executable hash | none |
| `hash_drift` | file, expected hash, and actual hash | none |
| `signal` | one exact `SIGHUP/1`, `SIGINT/2`, or `SIGTERM/15` name and number pair | none |

Descriptors keep closed nested shapes. A hashed capture has run-relative `path`, `sha256`, and nonnegative `bytes`. A request adds nonempty `via`. A received input contains only nonempty `name`, run-relative `path`, and `sha256`; request-only `bytes` and `via` never enter `stage_start.received`. Output descriptors remain hashed paths. The executable `sha256` on `check` and `hook` identifies the executable and never doubles as the capture hash. This checkpoint changes their current capture string to the hashed capture object. Older pre-release records can remain available through raw access under ADR 0024.

## Variable text and the line ceiling

Every Bot-owned record line is at most 1 MiB. The append boundary checks the encoded line before writing. Producers must bound variable text first, so the boundary protects an invariant instead of creating an incomplete record during ordinary input.

One helper stores oversized UTF-8 text under the run, returns a deterministic head-and-tail excerpt, and returns a descriptor with run-relative path, byte count, and SHA-256. It serves control evidence, control and choice reasons, provider diagnostic names and messages, subflow failure reasons, temporary-cleanup reasons, and terminal reasons. Short text remains inline. Event-specific text ceilings are 10,000 bytes for model feedback and 2,048 bytes for record diagnostics. Complete evidence remains in the referenced capture. Each event uses the exact optional capture field named in the table. Invalid UTF-8 input remains bytes in the capture and the excerpt reports that text rendering was unavailable.

Inline subflow requests never enter the record as text. Bot retains the exact supplied bytes once and records the same path, byte count, and hash descriptor used for file input. The child still receives the exact original bytes. FANOUT uses its separately defined canonical request bytes.

The append boundary encodes and size-checks a proposed line before it mutates or closes the writer. An over-limit proposal returns a typed result to its producer. The producer retains or replaces the oversized fact and writes a bounded `fault/2` ending when it cannot do so. The record writer closes without `run_end` only when an actual append or durable-storage operation fails.
