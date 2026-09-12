# Run list design

## Outcome

Ticket 0020 adds one new reading: `bot run list`. The command gives a person a bounded Markdown table and gives a program a bounded JSON document. It does not change run records or the legacy `bot runs` command.

The current implementation already has the required summary reader in `inspection.ts`. It exposes run identity, assembly, flow, start time, ending or unreadable state, and token total. The new command should separate the structured terminal facts that the legacy renderer joins as `exit/cause`. The legacy renderer can keep joining them.

## Command

```text
bot run list [--assembly NAME ...] [--flow NAME ...] [--state STATE ...] [--cause CAUSE ...]
             [--since TIMESTAMP] [--until TIMESTAMP] [--limit N] [--after CURSOR]
             [--fields FIELD,...] [--count] [--json|-j] [--home DIR]
```

Different filter names combine with AND. Repeated `--assembly`, `--flow`, `--state`, and `--cause` values combine with OR. Duplicate singleton flags and missing flag values are malformed requests. Assembly and flow matches are exact and byte-sensitive. Across all four repeatable filters, a request accepts at most 64 values and 2,048 UTF-8 bytes of values after duplicate removal. Assembly and flow values may not contain C0 or C1 control characters. These limits apply before a home read. They keep the normalized query and every emitted cursor within one safely reusable command-line argument.

`--since` and `--until` are inclusive timestamps in Bot's canonical writer form: `YYYY-MM-DDTHH:mm:ss.sssZ`, with a calendar-valid year from 0100 through 9999. Other offsets, omitted or longer fractional seconds, and years 0000 through 0099 are malformed. This accepts the exact millisecond UTC form Bot writes. It does not claim support for every RFC 3339 spelling. A since value later than until is malformed.

The supported fields are `id`, `assembly`, `flow`, `startedAt`, `state`, `exit`, `cause`, and `tokens`. The default uses that order. `--fields` accepts a nonempty comma-separated subset with no duplicates. Unknown fields fail. Projection changes rendering only. It never weakens record validation.

`state` is one of `ended`, `running`, `crashed`, `incomplete`, `invalid`, `no-record`, `bad-record`, `bad-version`, or `unreadable`. An ended run carries numeric `exit` and a cause. Other states carry `null` for facts that the record did not establish. The legacy human renderer keeps its compact `exit/cause` outcome. The new Markdown table presents the selected structured fields without joining them again.

The default page size is 20 and the maximum is 200. Limit zero is invalid. Rows sort by run identifier in descending bytewise order, so the newest normal run appears first.

`--count` returns the exact number that matches the filters and no run rows. It cannot be combined with `--limit`, `--after`, or `--fields`. Counting reads the same bounded record summary needed to decide assembly, flow, state, cause, and time. It never reads usage, sessions, captures, checks, requests, or outputs. This is the cheapest exact count the current file store can provide. A later index may make it faster without changing the result.

Usage attribution and correlation filters remain outside this ticket. Legacy `bot runs --usage --json` remains available until a later new-surface command owns that detail. A correlation filter becomes truthful only after run creation records caller correlation.

## Output

The JSON result is one newline-terminated document:

```json
{
  "schemaVersion": 1,
  "kind": "bot.run.list",
  "data": [
    {
      "id": "2026-09-05T12-00-00-abcd",
      "assembly": "review",
      "flow": "main",
      "startedAt": "2026-09-05T12:00:00.000Z",
      "state": "ended",
      "exit": 0,
      "cause": "success",
      "tokens": 1200
    }
  ],
  "page": {
    "limit": 20,
    "next": null,
    "through": "2026-09-05T12-00-00-abcd",
    "complete": true
  },
  "summary": {
    "returned": 1,
    "matched": null,
    "warningCount": 0,
    "warningsOmitted": 0
  },
  "warnings": []
}
```

`summary.matched` is `null` during an ordinary page because finding an exact total would require reading every candidate. With `--count`, `data` is empty, `page` has `limit: 0`, `next: null`, and `complete: true`, and `summary.matched` contains the exact count. `summary.returned` is zero. Both modes add `summary.warningCount` for the exact number of warning entries encountered by that scan and `summary.warningsOmitted` for the number excluded from the bounded `warnings` array. One row may contribute both a record-reading warning and one or more presentation warnings. Count scans every candidate. An ordinary page reports only the warnings encountered through its continuation position.

The default human result is a real Markdown table with the selected field names as headings. It uses humanized token counts and elapsed start age. One presentation sanitizer renders C0 and C1 controls visibly, escapes backslashes before pipes, and escapes HTML-significant `&`, `<`, and `>`. It never emits an embedded physical line. Clipping happens after all escaping for every field, including `id`. Each rendered cell is at most 480 UTF-8 bytes and each row is at most 4,096 bytes. A page remains below 1 MiB. Every clipped cell adds a `cell-truncated` warning that names the run, field, and omitted escaped-byte count. JSON never substitutes a truncated value for an exact fact. A summary text fact above 1,024 UTF-8 bytes becomes `null` and adds a `summary-field-too-large` warning, so both output forms remain bounded without publishing a false identifier or value.

An empty result prints `No runs match.` as a Markdown paragraph and exits 0. A nonfinal human page writes one short continuation notice with the opaque cursor to standard error. JSON carries that fact only in `page.next` and writes no successful notice to standard error.

Unreadable or structurally invalid runs remain rows in an unfiltered reading. JSON retains at most the first 20 warnings in traversal order. Each diagnostic is rendered as one inert line of at most 512 UTF-8 bytes. Record-reading and presentation warnings accumulate independently; finding one never returns before the other is considered. Human mode writes the same first 20 warnings, each on a line of at most 1,024 bytes, followed by one omission line when more exist. The exact warning-entry and omission counts remain in `summary`. A filter whose required fact is unknown does not match that row. Projecting fields does not suppress its warning.

## Cursor

The cursor is opaque base64url data owned by Bot. Its decoded form is strict canonical JSON. It contains a contract version, a SHA-256 binding to the resolved home path, the first page's greatest run identifier as `through`, the last identifier examined as `after`, and the normalized semantic filters. It does not contain the home path, rendered rows, or record bytes. An encoded cursor is at most 8,192 ASCII bytes and its decoded document is at most 6,144 bytes. Bot checks the encoded limit and canonical base64url spelling before decoding. Inside one bounded failure boundary it decodes, checks the decoded limit and UTF-8, calls `JSON.parse`, validates the closed cursor shape and semantic values, and compares the canonical JSON re-encoding. Semantic validation requires an exact 64-character lowercase hexadecimal home hash; known state and cause values; safe-integer time bounds in valid order; and unique bytewise-sorted filter arrays that satisfy the same 64-value, 2,048-byte, and control-character rules as a direct request. It does not use the YAML parser. These checks finish before home or membership comparison. Every decode, text, parse, shape, version, semantic, and canonicalization failure is `cursor-invalid` with exit 2. Bot never emits a cursor above either limit. A valid cursor used with another home, ordering, or filter set fails with exit 3 and `cursor-conflict`. A caller may change the page limit and projection between pages.

The first page takes one sorted directory-name snapshot and hashes the names at or below `through`. A continuation recomputes that name-set hash before it returns rows. A new ordinary run above `through` does not enter the traversal. A created, removed, or renamed run at or below `through` returns `cursor-conflict` instead of silently changing membership. Record contents remain live. A running row may settle between pages. The cursor guarantees stable identifier membership and no repeated identifier. It does not claim that mutable row facts were frozen.

The scan continues below the last identifier examined rather than the last identifier returned. This matters when filters skip rows. It reads candidates until it has the requested number of matches or exhausts the identifier set. When a full page leaves candidate identifiers unexamined, `page.complete` is false and `page.next` resumes after the last examined identifier. The last page can contain fewer rows or no rows after a sparse filter. Conservative name-time checks may skip impossible time matches before a record opens. Record-backed filters still use validated summary facts.

## Failures and home selection

`--json` and `-j` are identical. A JSON failure writes one document to standard error and nothing to standard output:

```json
{
  "schemaVersion": 1,
  "kind": "error",
  "error": {
    "code": "request-invalid",
    "operation": "run.list",
    "cause": "field-unknown",
    "message": "Run list has no field named cost.",
    "retryable": false,
    "details": {"field": "cost"}
  }
}
```

Human failures write one inert physical line of at most 2,048 UTF-8 bytes to standard error and nothing to standard output. They use the same control, backslash, pipe, and HTML escaping before clipping. An absent home is `home-not-found` and exits 1. A malformed request exits 2. A cursor conflict exits 3. A filesystem dependency failure exits 4. An internal or integrity failure exits 5. An existing home with no runs and a valid filter with no matches both exit 0.

Home selection reuses `resolveHome` and `takeHome`. An explicit `--home` wins over `BOT_HOME`. An absolute `XDG_DATA_HOME` supplies the platform data root when neither is present. The final fallback is `$HOME/.local/share/bot`. Relative explicit and `BOT_HOME` values resolve against the caller's working directory, as they do today.

The resolved home must exist and resolve to a directory. A missing path is `home-not-found`. An existing non-directory is `home-invalid` with immediate cause `path-not-directory`. Both exit 1. A missing `runs/` directory means an empty valid home. An existing non-directory `runs` entry and an unreadable home are typed dependency failures rather than empty results. A symlink may name the home directory under the existing local-account trust model. Run-controlled paths retain their stricter confinement rules.

## Source ownership

`cli.ts` owns the temporary distinction between `bot run list` and the legacy `bot run TARGET` action. `bot run --help` keeps its legacy meaning because a current local service calls it. `bot run list --help` describes only the new reading.

`flags.ts` should not absorb another command-specific parser. Add a small new-surface parser module that returns a closed run-list query or a typed invocation failure. Add a small common CLI-result module for the envelope, structured error, and Markdown table. Later commands may reuse those parts after this ticket proves them.

`inspection.ts` owns the run-directory walk and supplies the held record and lock fact. `run-state.ts` owns one structured per-run state fact that both renderers consume. Apply this order exactly: omit a live directory whose record does not exist; report a dead recordless directory as `no-record`; report a held-record fault; report a readable record without `run_start` as `incomplete`; report a record with `run_end` as `ended`; report the remaining started record as `running` or `crashed` from the lock. The new renderer may add `exit`, `cause`, and projected fields, but it must not clone this precedence or parse the legacy renderer's bytes.

`run-list.ts` owns bounded query traversal and rendering. Ordinary paging retains at most the selected page and 20 warnings. Count traversal retains no rows. It increments numeric match and warning totals and retains only the first 20 bounded warnings. Both modes read the same per-run summary and use the same diagnostics.

Capability discovery is a separate observable command and does not belong in this ticket. The new parser can export its field and filter constants later. No test in this ticket should require a capability command or a complete shared command registry.

Bot cannot mechanically prevent another repository from typing a legacy command. New Bot help, examples, and nonhistorical specification text should use `bot run list`. Existing legacy help and tests remain allowed. Each consumer migration will replace its own caller. The final legacy-deletion ticket will search all supported consumer sources and remove the old dispatcher only when none remain.

## Red tests in order

1. Through the real `main`, `bot run list` returns the newest 20 rows in descending order as a Markdown table. `bot runs` returns byte-for-byte legacy output before and after the new call.
2. `-j` and `--json` return identical envelope bytes. Exact numeric and null fields remain exact. A valid empty home and an unmatched filter return `data: []` and exit 0 without standard-error prose.
3. Repeated assembly, flow, state, and cause filters apply OR within one name and AND across names. The 64-value and 2,048-byte aggregate limits fail before a home read. Exact canonical UTC millisecond since and until bounds use the recorded start timestamp. Offsets, other fractional precision, invalid calendar values, and years below 0100 fail.
4. Limit 1 produces one row and a cursor. The next page has no repeated id. A run created above `through` does not enter it. A run created, removed, or renamed below `through` causes `cursor-conflict`. Reusing the cursor with another filter or home also conflicts. Raw cursors above 8,192 bytes and decoded cursors above 6,144 bytes fail before parsing. Invalid base64url, invalid UTF-8, JSON syntax, duplicate or unknown shape, wrong versions, noncanonical JSON, malformed home hashes, unknown states or causes, unsafe or reversed time bounds, and duplicate, unsorted, over-limit, or control-bearing filter arrays all return `cursor-invalid` and exit 2 before membership comparison. A maximal accepted filter request emits a cursor within the encoded limit and that cursor succeeds as one later argument.
5. A sparse filter proves that continuation advances from the last examined id rather than the last returned id. The final page sets `next: null` and `complete: true`.
6. Field projection controls both JSON keys and Markdown columns. Unknown, empty, and duplicate fields fail. An invalid record still gets validated and warned about when its visible fields are projected away.
7. `--count` streams across 500 matching invalid runs without retaining row objects or an unbounded warning array. It returns the exact match and warning-entry totals, no rows, the first 20 warnings, and the omitted count. A row carrying both a record warning and clipped presentation fields contributes every warning rather than returning after the first. Its forbidden flag combinations fail before inspection. The ordinary page uses the same warning policy and human diagnostics.
8. A live recordless directory is omitted. A dead recordless directory is `no-record`. Record faults retain their fault state. A readable record without `run_start` is `incomplete`; one with `run_end` is `ended`; a started record without `run_end` is `running` or `crashed` from its lock. Mutations that remove each branch or change their order make the test red. The legacy renderer still joins exit and cause exactly as before.
9. Hostile record and invocation text cannot add a Markdown row, HTML, terminal control, or second diagnostic line. Tests include every projected field and an over-limit `id`. Backslash escaping precedes pipe escaping, and clipping is measured after all escapes. Every clipped cell has one warning with its run, field, and omitted escaped-byte count. Cells, rows, tables, diagnostics, warnings, and summary text facts meet their byte bounds. JSON never publishes a truncated string as an exact fact.
10. JSON invocation failures carry `code`, `operation`, immediate `cause`, message, retryability, and details on standard error only. Human failures stay bounded and stdout stays empty. Home precedence is exercised through the real command. A regular file at the home path returns `home-invalid`; a missing `runs/` directory is empty; an unreadable or non-directory `runs` entry is a typed dependency failure.
11. Help for `bot run list` names every accepted flag, the timestamp form, input limits, and the network-free behavior and contains no legacy invocation. `bot run --help`, every legacy `bot runs` behavior test, and the public legacy JSON root remain unchanged. The new command test reaches the new parser directly rather than rewriting into the legacy parser. External caller migration remains separately owned.

## Cost and deferred work

The cursor's directory-name hash makes continuation perform another directory listing. It avoids retained snapshot storage and gives a precise conflict when membership changes. Record facts can still change while a run is live. Freezing those facts would require retained snapshots or an index and is deferred.

Exact filtered counts scan every candidate's bounded summary. They do not scan usage or artifacts or retain matching rows. A future disposable index can improve that cost.

This ticket intentionally leaves capability discovery, correlation recording and filtering, usage detail, other noun commands, external caller migrations, and final legacy deletion for later tickets.
