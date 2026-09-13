# Record state and reading bounds

## Structural record state

One shared reader classifies bounded record bytes. A `valid` record starts with one matching `run_start`, gives every stage attempt a usable identity, starts each attempt before its work or ending, uses a legal terminal cause and exit, records at most one container ending for an identity, records at most one matching outside signal, ends once with `run_end`, and contains nothing after that ending. Known events carry parseable timestamps. An `incomplete` record is an empty newborn record or a possible prefix without `run_end`. An `invalid` record violates one of those structural rules.

The reader does not reproduce detailed writer rules for paths, check order, hooks, control decisions, container aggregation, workspaces, or retained artifacts. Writer and conformance tests cover those rules. Each operation validates the fields and artifacts that authorize its own action.

One unterminated final line is omitted and leaves a possible prefix incomplete. An invalid interior line is invalid. Any bytes after an accepted `run_end` are invalid. The semantic reader fixes one held descriptor snapshot at the existing 1 MiB and 10,000-segment bounds and parses complete lines incrementally. The torn segment counts and must be valid UTF-8. A failed read or final stability check publishes none of the partially visited record.

A handled outside signal is `SIGHUP/1/129`, `SIGINT/2/130`, or `SIGTERM/15/143`. A stage or child terminal may record the matching signal cause before the queued `signal` event. That prefix remains incomplete until the signal event arrives. The final `run_end` must agree with the recorded outside signal. Internal cancellation and root lock compromise use `fault/2` and emit no outside-signal event.

## Operational consumers

A local validation failure returns no artifact or authorization. It does not make the whole record structurally invalid.

| Consumer | Facts and artifacts it validates before use |
| --- | --- |
| Run list and summary | Run identity, optional assembly and flow, start time, nonnegative safe-integer turn counts, and terminal pair. Missing or malformed optional display facts stay absent. |
| Resume | A valid complete donor; assembly identity and hash; request path, bytes, hash, and source; carried stage identity; sealed output path and hash. Retained request and output bytes pass through the held-file boundary. The same first-fresh plain root stage may receive bounded prior-failure facts only when its stage ending and the terminal run ending agree. |
| Live assembly management | A nonempty assembly identity for every structurally readable live run. Missing identity keeps management fail-closed. |
| Request read | A normalized path beneath the run, nonnegative byte count, content hash, and safely held matching bytes. |
| Output, draft, and rejection read | An exact successful sealed and judged result, exact refused unjudged draft, or exact rejected or exhausted judged result; plus a normalized path, content hash, and safely held matching bytes. |
| Capture read | The recorded assembly hash and safely held matching capture tree. |
| Check read | Matching attempt identities, successful capture paths, agreeing optional executable hashes, and a safely held capture beneath the run. |
| Session and tool read | Matching stage identity, normalized session path beneath the run, and bounded readable session lines. |
| Search index | Usable run identity, assembly, timestamp, stage identity, and normalized session paths from one held valid snapshot. A malformed run contributes no sources. |
| Child traversal | Parent child reference and input descriptor; child identity, source, flow, request bytes, and terminal outcome. `child-record.ts` owns this agreement. |
| Busy detection | Absolute root workdir, matching stage identities, relative stage workdirs, the run lock, and process-group evidence. Malformed ownership remains busy while independent live evidence exists. |
| Cleanup | A stopped invalid record may be selected by exact name, bytewise keep position, or the calendar-valid UTC second in its writer-shaped name. Deletion still requires independent lock, process-group, selected-name, and ownership evidence. No event in the invalid record authorizes removal. |

A live unreadable or invalid record keeps assembly management fail-closed. Automatic cleanup refuses a missing, unreadable, unsupported-version, or non-file record. A stopped structurally invalid record remains eligible for safe cleanup under exact name, age, and keep selection.

## Retained artifact boundary

Child traversal compares the parent and child identities, flow, request descriptors, retained request bytes, and terminal outcome. Held-file reads reject observed links, detected replacement, and changed leaf bytes. Resume writes the output bytes that passed this boundary into the new run. It does not reopen the donor path after validation. A same-account race that replaces an intermediate directory during open remains outside the local-account trust boundary.

`bot show RUN --raw` copies the selected top-level record exactly from one opened regular-file descriptor. `--child PATH` first requires one exact started child authorization in a structurally valid parent, then copies the child record without validating or endorsing it. The descriptor fixes the snapshot size. Later appends are not chased, and later path replacement does not redirect the open descriptor. A failure before open publishes no bytes. A read failure may leave bytes already written and exits one. Structured and human summaries never infer an outcome from invalid bytes.

## Evidence bounds

Executable capture keeps its current 16 MiB combined output ceiling. Gate output remains exact in `check.capture`. A valid UTF-8 model view is unchanged through 10,000 bytes and a gate-derived terminal reason is unchanged through 2,048 bytes. Larger views use deterministic code-point-safe head-and-tail excerpts with original and omitted byte counts. Invalid UTF-8 produces one fixed message and exposes none of its decoded bytes. Rendered sessions use stable pages of 100 messages by default and at most 500. A page emits at most 1 MiB and scans toward a 4 MiB source target before completing the current source line. A rendered-session source line has a 1 MiB logical bound and is refused before decoding or parsing when larger. Tool-log inspection retains its 16 MiB logical-line bound. One terminal carriage return does not count toward either line bound. Opaque cursors bind the record-selected session and one held snapshot to the next source-byte boundary. The diagnostic distinguishes proven remaining messages from unread session data. Raw sessions retain their existing exact-byte bound.
