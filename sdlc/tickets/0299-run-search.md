---
flow: build
priority: 2
deps: [0298]
---
# Search retained sessions and events by literal text

## Outcome

`bot run search QUERY` returns bounded, paged matches from retained root and child event files and stage session files. It prefers ripgrep, falls back to grep, loads no Pi, reaches no network, changes no file, and joins `bot/run-readings` as `runSearchReading`. This ticket closes `sdlc/issues/2026-09-14-retired-find-left-no-text-search.md`.

## Current facts and scope decision

Observed at `b209155` on main. The command inventory contains 26 operations. Fifteen read-only operations have live command-to-library comparisons. `bot run list` filters record summaries, and `bot run session` reads one selected session. Nothing searches text across runs. The retired indexed `bot find` stays retired.

The requirements note proposed run-list filters and an explicit file list. The later handoff narrows ticket 0299 to literal search of session and event files with one limit. This ticket follows that handoff and the issue's smallest outcome. It does not add summary filters, ranking, an index, stored queries, or search of requests, outputs, captures, prompts, or the sealed assembly. Filters can follow only after a consumer establishes them.

Search starts at `<home>/runs`. Top-level candidates use the existing `runNames` rule: direct directories that are not links when examined, except names ending in `.lock`, sorted bytewise. A deterministic recursive walk descends entries whose current `lstat` says directory and admits entries whose current `lstat` says regular file with basename exactly `record.jsonl` or `session.jsonl`. This includes root and authorized or orphaned child records as retained on disk. It does not infer authorization from record contents. Candidate paths sort bytewise relative to `runs/`. The later race contract governs replacements after each examination.

## Command and document contract

Add `run.search` with command words `bot run search [--limit N] [--after CURSOR] [--json|-j] [--home DIR] [--] QUERY`. `QUERY` is one nonempty literal of at most 4,096 UTF-8 bytes. NUL, CR, and LF are request errors because grep treats newline-separated patterns differently from ripgrep. `--limit` defaults to 20 and accepts 1 through 200. Options may appear before an optional standalone `--`. That marker ends Bot option parsing and is removed; exactly one query must follow it. A query beginning with `-` therefore uses `bot run search -- -needle`. Without the marker, a leading-hyphen word is an unknown option. Repeated options or markers, an absent or extra query, unknown options, and flag-valued option arguments exit 2.

The result is a newline-terminated `bot.run.search` schema-version-1 document:

```json
{
  "schemaVersion": 1,
  "kind": "bot.run.search",
  "data": {
    "query": "literal",
    "tool": { "name": "rg", "version": "ripgrep 15.1.0" },
    "hits": [
      {
        "run": "2026-09-14T09-00-00-example",
        "stage": "01-read",
        "repeat": 1,
        "retry": null,
        "file": "2026-09-14T09-00-00-example/stages/01-read/1/session.jsonl",
        "line": 4,
        "text": "bounded inert excerpt",
        "omittedBytes": 0
      }
    ]
  },
  "page": { "limit": 20, "next": null, "complete": true },
  "summary": { "candidateFiles": 2, "returned": 1 }
}
```

One hit represents one matching physical line, even when the literal occurs more than once on that line. `run` is the first path segment below `runs/`. `file` is relative to `runs/`. `line` is one-based. `text` is the line without its LF or CRLF terminator, decoded with UTF-8 replacement and clipped to 480 rendered UTF-8 bytes. `omittedBytes` records the number removed. JSON preserves tabs and other JSON-escaped controls. Markdown passes every cell through the existing inert-text boundary and prints `Run`, `Stage`, `Repeat`, `Retry`, `File`, `Line`, `Text`, and `Omitted bytes` after a `# Run search` heading and one bounded tool/version line. Null stage facts print `-`. An empty search succeeds with an empty table and `hits: []`.

For `session.jsonl`, derive `stage` and `repeat` from the final `stages/<stage path>/<repeat>/session.jsonl` suffix and set `retry` to null. For `record.jsonl`, parse the matched line only for optional metadata. A nonempty string `stage`, a positive safe integer `repeat`, and a positive safe integer `retry` are retained independently; absent or malformed fields become null. Invalid JSON remains a text hit with all three fields null. The relative file always disambiguates root and nested child records.

Rows order by Bot's `bytewise` comparison of UTF-8 relative-path bytes and then numeric line. Pass the same bytewise-sorted explicit operand list to both tools. Do not ask either tool to sort: ripgrep's path comparator is not Bot's byte comparator, and tool-side sorting may reorder explicit operands. Ripgrep runs with one thread, so it processes the already sorted explicit operands sequentially. A platform with ripgrep installed must preserve that supplied operand order. The real-rg proof reports a clear skip when ripgrep is absent; controlled ripgrep still proves protocol and ordering there. The parser enforces a known candidate path, nondecreasing candidate ordinal, and a strictly increasing line within one file. Reordered, repeated, or regressing output is a dependency failure. Tool ordering never selects the page silently.

A page collects `limit + 1` rows. The extra row proves another page and is not returned. Once that row requests a page stop, later child stream bytes cannot change the accepted page; process-group termination and bounded settlement still complete. `page.next` is an opaque base64url cursor carrying schema version 1, SHA-256 of the resolved absolute home string, SHA-256 of the exact query bytes, the last returned relative file, and its line. The cursor has the existing 8,192 encoded-byte and 6,144 decoded-byte limits. Continuation excludes earlier files and matched lines through that position in the cursor file. A different resolved home or query causes `cursor-selection`; a missing cursor file or impossible line causes `cursor-position`. Both use code `cursor-conflict` and exit 3. Malformed and oversized cursors use code `cursor-invalid`, causes `cursor-malformed` and `cursor-limit`, and exit 2.

The cursor describes a live traversal position, not a filesystem snapshot. Appends after the position can appear. Insertions before it do not. A page enumerates once, then reports only the complete protocol lines that the selected tool emits through the first extra hit. Early completion need not open later candidates. `summary.candidateFiles` is the enumeration count. It never claims that every candidate was opened or scanned.

Markdown writes `More matches remain. Continue with --after CURSOR.` to standard error when `page.complete` is false. JSON carries the cursor and writes no continuation diagnostic. No result truncates silently.

## Tool and resource contract

Enumerate candidates before spawning a tool. Use byte-preserving directory reads. Reject a candidate path component containing CR or LF, or bytes that do not round-trip through UTF-8, with code `integrity-failed`, cause `source-invalid`, and exit 5. NUL cannot occur in a filesystem name. Refuse with code `integrity-failed`, cause `result-oversized`, and exit 5 when more than 4,096 candidates exist or their relative arguments exceed 131,072 UTF-8 bytes. This keeps one explicit argument vector below the supported platforms' practical process limits. Missing `runs/` in an existing home is an empty candidate set. A missing home exits 1 with `home-not-found` and cause `home-missing`. A non-directory or unreadable `runs/` entry and unexpected walk failures exit 4 with code `dependency-failed` and cause `runs-invalid`, `runs-unavailable`, or `filesystem-error`.

Start one absolute 10,000 ms monotonic operation deadline immediately before the `rg --version` probe. The probe and selected search share its remaining time. An `ENOENT` ripgrep probe falls back to `grep --version`. If both names are absent, refuse with code and cause `dependency-failed`, exit 4, and a message that names both accepted dependencies. Each probe has a 4,096-byte combined stream bound. A present tool whose probe fails or exceeds its bound fails and does not silently select the other implementation. Record the first nonempty version line, clipped to 256 UTF-8 bytes. Markdown makes that value inert at render time.

Spawn the selected search without a shell, with `cwd` set to `runs/`. Ripgrep receives exactly `--threads 1 --fixed-strings --json --no-config --text --with-filename --line-number -- QUERY FILE...`. Grep receives exactly `--null -a -H -n -F -- QUERY FILE...`. GNU grep on Linux and BSD grep on macOS both spell the NUL filename delimiter `--null`. `FILE...` is the bytewise-sorted explicit relative operand list. The search child receives only `PATH`, `LANG=C`, and `LC_ALL=C`; it receives no Bot, provider, or credential environment values. Explicit files replace the handoff's recursive `grep -r`, so both tools receive the same enumerated names.

Ripgrep's JSON supplies structured paths and lines. Grep `--null` supplies `PATH\0LINE:TEXT\n`. Parse its filename through NUL, require an exact known operand, then parse the first decimal field through `:` as the line. Colons in paths and text stay unambiguous. Reject CR, LF, and non-round-trippable path bytes before spawn even though `--null` frames them, because line-oriented diagnostics and the shared cursor remain text protocols. Real system-grep tests run on Linux GNU grep and macOS BSD grep and pin the exact invocation, NUL framing, colon-bearing paths, colon-bearing text, invalid UTF-8 content under `-a`, empty results, multiple files, and operand order.

Every probe and search starts as a detached process group on Linux and macOS with stdin ignored and stdout and stderr piped. A child may finish naturally only after `exit`, `close`, stdout EOF, and stderr EOF settle and the exit and close statuses agree. Search stdout and stderr share a 16 MiB stream budget, and one physical protocol line stays within 1 MiB. Parse ripgrep match events from JSON, including its base64 byte form. Reject malformed, out-of-order, unknown-file, diagnostic, or nonzero natural results except exit 1 for no matches.

The first of the absolute operation deadline, an abort, a stream or protocol failure, or the `limit + 1` complete hit activates one termination path. Send `SIGTERM` to the process group once, continue draining both pipes, allow 250 ms, then send `SIGKILL` to the group unconditionally. `ESRCH` proves the group is gone. A successful signal proves the group existed and starts the final 1,000 ms cleanup deadline. Repeat `SIGKILL` at that deadline: `ESRCH` proves settlement, success proves survival through the bound and fails, and another error fails. Never use signal 0 as a cross-platform survival probe. Dispose both local pipe endpoints after the forced kill and await agreeing `exit`, `close`, and pipe settlement. A cleanly settled deliberate page stop is success; the other triggers are failures. A missing settlement event, disagreeing status, signal error, or cleanup expiry uses `close-failed`. Signals reach descendants that remain in the spawned process group. A tool can escape its group; an escaped descendant cannot keep Bot waiting after pipe disposal, but Bot does not claim to terminate or contain it. Publish the work deadline, grace, cleanup deadline, group behavior, stream total, and protocol-line bound in the descriptor.

Enumeration is deliberately non-atomic. `lstat` excludes links that exist when each entry is examined. A file or ancestor can be replaced with a link before the external tool opens it, and the tool can then follow the replacement. Bot holds no descriptor or snapshot and makes no confinement claim. Replacement, disappearance, and permission races that make the tool fail use the tool dependency failure. If the tool succeeds, the page reports the bytes and paths that tool invocation observed through its stopping point.

Render at most 1,048,576 bytes in either mode. A larger document refuses with code `integrity-failed`, cause `result-oversized`, and exit 5, as ticket 0297 does. Standard output stays empty on every refusal. JSON requests receive the common structured error. Human requests receive one bounded inert diagnostic. A standard-output failure uses code `dependency-failed`, cause `output-error`, and exit 4.

The selected executable comes from the caller's `PATH` and runs with the operator's process authority. Bot does not authenticate it or claim containment. Bot passes no shell syntax or sensitive environment. Enumeration supplies only relative names below `runs/`, subject to the admitted replacement race above. The operation builds no index, writes no cache, stores no query, loads no model runtime, and reaches no network.

## Failures

| Phase and failure | Code | Cause | Retryable | Exit |
| --- | --- | --- | --- | --- |
| Request syntax, missing or extra query, invalid literal, invalid limit, repeated or unknown option | `request-invalid` | the exact admitted parser cause: `argument-extra`, `argument-invalid`, `argument-unknown`, `limit-invalid`, `option-repeated`, `value-empty`, `value-missing`, or `value-oversized` | false | 2 |
| Cursor exceeds its encoded bound | `cursor-invalid` | `cursor-limit` | false | 2 |
| Cursor encoding or shape is invalid | `cursor-invalid` | `cursor-malformed` | false | 2 |
| Cursor names another resolved home or query | `cursor-conflict` | `cursor-selection` | false | 3 |
| Cursor file or line no longer exists | `cursor-conflict` | `cursor-position` | false | 3 |
| Home is absent | `home-not-found` | `home-missing` | false | 1 |
| Home exists but is not a directory | `home-invalid` | `home-invalid` | false | 1 |
| `runs/` has the wrong type | `dependency-failed` | `runs-invalid` | true | 4 |
| Walk is unreadable or an unexpected filesystem call fails | `dependency-failed` | `runs-unavailable` or `filesystem-error` | true | 4 |
| Candidate path is unsafe for the portable tool protocol | `integrity-failed` | `source-invalid` | false | 5 |
| Candidate count or argument bytes exceed the bound | `integrity-failed` | `result-oversized` | false | 5 |
| Both tool names are absent, a present probe fails, spawn fails, a tool exits unexpectedly, emits stderr before a page stop, or violates framing or order | `dependency-failed` | `dependency-failed` | true | 4 |
| Absolute work deadline expires | `dependency-failed` | `timeout` | true | 4 |
| Child stream or protocol-line bound is exceeded | `dependency-failed` | `result-too-large` | true | 4 |
| Child status disagrees, group signaling fails, or termination does not settle | `dependency-failed` | `close-failed` | true | 4 |
| Rendered document exceeds its bound | `integrity-failed` | `result-oversized` | false | 5 |
| Standard output cannot accept the prepared result | `dependency-failed` | `output-error` | true | 4 |

All causes in this table already belong to the closed cause vocabulary. Standard output stays empty on every failure. JSON requests receive the common structured error. Human requests receive one bounded inert diagnostic.

## Implementation ownership

1. Add the contract constants and descriptor in `bot/src/cli-contract.ts`, register the Pi-free handler in `bot/src/new-command-dispatch.ts`, and add its overview and command help in `bot/src/help.ts`.
2. Add `bot/src/run-search-command.ts`. Keep parsing, byte-preserving candidate enumeration, cursor handling, tool protocol, rendering, and the injected process seam in this owner. Reuse `newCommandFailure`, `inertText`, `bytewise`, and the command-reading boundary. The byte-preserving walk applies `runNames` semantics without calling its string-decoding implementation. Do not add matching logic in TypeScript.
3. Add `runSearchReading(home: string, query: string, options: { json?: boolean; limit?: number; after?: string }, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>>` to `bot/src/public-run-readings.ts`. It drives the command handler and returns identical stdout, stderr, and exit.
4. Add `run.search` to `COUNTERPARTS` and the live comparison in `bot/tests/library-contract.test.ts`. Raise its read-only, compared, and total counts. No package export path changes.
5. Add `run.search` to `bot/tests/capabilities.test.ts`, the Pi-free table in `bot/tests/cli-lazy-model-runtime.test.ts`, the operation sentence and 27-name pin in `bot/tests/spec-operation-inventory.test.ts`, and every exhaustive `NewOperation` map.
6. Add a `### bot run search` contract to `specification/elements/inspection.md`, a ticket 0299 entry to `specification/CHANGELOG.md`, and republish the generated specification page if the publication test requires it. Add the command, options, page row, and twenty-seven count to `docs/src/content/docs/reference/commands.md`.
7. Delete `sdlc/issues/2026-09-14-retired-find-left-no-text-search.md`. Raise `sdlc/ratchet.json` only to the measured production total.

## Acceptance

Red first: add `run.search` to `NEW_OPERATIONS` and `CLI_CONTRACTS` alone. `library-contract.test.ts` must name the missing counterpart, `spec-operation-inventory.test.ts` must name the missing prose operation, exhaustive help typing must fail, and the lazy-runtime inventory must fail before production registration.

Focused tests then prove:

1. Real ripgrep, when installed, finds a literal containing regex punctuation in a root record, a child record, and two sessions. Its test skips explicitly when the executable is absent. Rows have the specified metadata and bytewise path/line order. A repeated literal on one line produces one hit. Regex interpretation would change the fixture's answer. The proof passes explicit candidates such as `a+/record.jsonl` and `a/b/record.jsonl` in Bot bytewise order and requires real ripgrep with `--threads 1` to preserve that operand order. The fixture also demonstrates that a tool-side path sort can choose a different order, so the invocation carries no sorting option. Controlled ripgrep proves the protocol and refuses reversed files, regressing lines, or repeated rows on every platform.
2. A fixture `PATH` with no `rg` and a controlled grep executable returns the same rows. Both searches receive the exact arguments, minimal environment, explicit sorted files, and query after the tool's `--`. A fake ripgrep configuration cannot change the result. The repository's Linux and macOS platform legs run Linux GNU grep and macOS BSD grep against the same `--null -a -H -n -F -- QUERY FILE...` fixture and prove NUL framing, colon-bearing names and text, invalid UTF-8 content, empty results, multiple operands, and operand order.
3. No tools produces the structured `dependency-failed` refusal. Probe failure, search exit, timeout, output overflow, overlong protocol line, malformed rg JSON, malformed grep framing, stderr, reordered output, and output failure each match the failure table and leave stdout empty.
4. Injected process tests cover natural success, natural no-match, spawn error, abort, absolute timeout despite continuing output, early-page termination, post-stop stream bytes before direct close, SIGTERM grace, unconditional SIGKILL, ESRCH at grace, SIGKILL success followed by ESRCH, signal errors at grace and cleanup, group survival through cleanup, a descendant holding each pipe, an escaped descendant holding each pipe, exit/close disagreement, missing exit, missing close, stream failure, pipe disposal, and cleanup timeout. Every case returns inside its outer bound and leaves no in-group process. Escaped descendants are test-owned and removed by the fixture.
5. Symlinked run directories, nested directory links, and linked candidate files that exist during `lstat` never enter the argument list. Replacement after `lstat` is tested both ways: a tool failure returns the specified dependency error, and a successful tool observation is reported without a confinement claim. Requests, outputs, captures, prompts, and assembly files stay excluded. CR/LF paths, invalid UTF-8 names, candidate-count overflow, and argument-byte overflow fail before spawn.
6. Limits 1 and 200, an empty result, and a three-page result prove bytewise file/line order, no duplicates, no omitted stable hits, `limit + 1` stopping, the continuation diagnostic, resolved-home and query binding, cursor bounds, cursor position failure, and the documented live-file behavior. Relative and absolute spellings that resolve to the same lexical absolute home agree. Another absolute spelling, including a symbolic-link alias, conflicts because existing cursors bind the resolved string rather than filesystem identity.
7. A 480-byte excerpt boundary, invalid UTF-8 content, CRLF content, Markdown controls, `bot run search -- -needle`, a colon in a candidate path, a colon in retained text, and a matched invalid event line produce bounded inert rows with exact omitted-byte counts. Without Bot's `--`, the leading-hyphen query fails as an option. Empty, multiline, NUL, oversized, repeated, missing, and extra query forms fail before home or process access.
8. `runSearchReading` and the real command agree byte for byte on success, continuation, no hits, malformed request, missing home, and missing tools. `capabilities.test.ts`, `cli-lazy-model-runtime.test.ts`, `spec-operation-inventory.test.ts`, and the documentation publication test pass.
9. Run the focused search and library suites, `npm -C bot run typecheck`, `npm -C bot run lint`, `git diff --check`, the production-size check, `make check`, and both hosted platform legs that own the real-grep proof.

## Size decision

- Starting production size: 19258 nonblank lines
- Ending production size: 19677 nonblank lines
- Production ceiling: 19677 nonblank lines. The implementation stayed below the accepted 19708-line maximum, so the ratchet uses the measured total.
- Simpler approach tried: recursively invoke each tool on `runs/` and return its text.
- Why insufficient alternatives were rejected: recursive tool defaults admit different files, path links and user configuration can change the answer, grep output is not the public document, and raw lines leave the result, child output, and continuation unbounded.
- Accepted cost: one process-protocol owner, an injected process-group observer, a live keyset cursor, and an external executable selected from `PATH`. No second matcher or durable index is added.
- Mechanical exception: the one process-protocol owner joins the exact catch budget with twelve named platform or parser conversions and raises only that file's complexity ceiling to 22 for the bounded option and stream state machines. The CLI and public reading inject the monotonic clock through a dedicated process-clock boundary. Ambient clocks, casts, and serialization remain banned in the owner.
- Production code deleted: the CLI's private 18-line real-clock constructor moved to the dedicated process-clock boundary; no behavior was deleted.

## Complexity

- Contract: 2
- State and timing: 2
- Reach: 1
- Proof: 2
- Cost of error: 1
- Total: 8
- Minimum level floor: level 3 for child-process timeout, deliberate termination, stream settlement, and partial-failure handling.
- Final level: 3.
- Reasons: the ticket adds a public command, versioned document, cursor, and import. Correctness depends on two external-tool protocols, live files, hostile text and paths, bounded streams, and platform behavior. A wrong answer is user-visible and locally correctable.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. An independent `gpt-5.6-sol` with medium reasoning reviews the design and code.

Re-score if implementation needs a filesystem snapshot, shared durable state, more than one search child per page, or a new compatibility decision.

## Review

- Origin: plan item 29, requirement A4 and Search S1 through S5 in `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`, the ticket 0299 brief in `sdlc/planning/notes/2026-09-14-handoff-admin-surface.md`, and `sdlc/issues/2026-09-14-retired-find-left-no-text-search.md`.
- Historical context: archived tickets 0163 and 0190 describe the retired indexed design. Ticket 0297 supplies the current operation inventory and export pins. This ticket does not revive the retired architecture.
- Design review: rejected once. The first draft did not prove ripgrep output order, overstated link safety across enumeration races, left child and descendant settlement incomplete, omitted Bot's `--` grammar, used ambiguous grep framing, left cursors unbound to the home, and scattered failure choices.
- First design response: added enforced output order, one honest non-atomic `lstat` contract, a process-group lifecycle with absolute and cleanup deadlines, explicit Bot end-of-options parsing, NUL-delimited grep framing, resolved-home cursor binding, and the exact failure table above.
- Design re-review: rejected. The revision used grep's nonportable short spelling and falsely equated ripgrep's path-sort comparator with Bot's bytewise comparator. Tool sorting could also reorder the explicit operands Bot had already ordered.
- Second design response: uses the GNU/BSD common `grep --null` spelling and pins the complete invocation on Linux and macOS. Ripgrep receives Bot's pre-sorted operands without a sorting option; real-platform fixtures cover the `a+` versus `a/b` comparator divergence, and the parser still fails closed on any emitted reordering.
- Second design re-review: rejected. Ripgrep could process explicit operands concurrently and emit a later operand first even without a sorting option.
- Third design response: adds `--threads 1` to the exact ripgrep invocation. Single-threaded processing preserves Bot's already bytewise-sorted explicit operand sequence. The parser still rejects reordering, and the Linux and macOS `a+` versus `a/b` proof remains.
- Third design re-review: accepted. Single-threaded ripgrep preserves the explicit bytewise operand order; portable grep framing, bounded child settlement, cursor binding, race semantics, and the failure table remain consistent.
- Hosted repair: Ubuntu lacked ripgrep. The real-ripgrep proof now reports an explicit skip there while controlled ripgrep retains protocol and ordering coverage; the mandatory real-grep proof still runs on Linux and macOS.
- First hosted macOS repair: the BSD grep paging leg returned a refusal at the 250 ms grace boundary after the extra row requested an early page stop; the old test hid its cause by parsing empty stdout first. Stream admission now closes at that stop boundary while process-group cleanup continues. The paging test reports exit and stderr before parsing, and the injected lifecycle test covers post-stop bytes followed by direct child close.
- Second hosted macOS repair: the rerun still returned generic dependency failure at the grace boundary. The remaining platform-dependent operation was signal 0 on the process group. Settlement now uses unconditional SIGKILL observations, with injected ESRCH, success, survival, and error sequences. Signal failures report `close-failed` with a process-group message. The hosted macOS rerun remains the proof against real BSD grep and Darwin process groups.
- Code review: pending.
