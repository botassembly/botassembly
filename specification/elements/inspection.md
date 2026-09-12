# Inspection

> **Stability: provisional.**
>
> Command presentation and the shapes of versioned machine documents may change
> in a later publication. This chapter still specifies the behavior that ships
> now.

Bot is not an operating-system sandbox. Inspection reports retained runtime
evidence; it does not provide containment.
`bot run events` reports retained direct tool calls. Bot does not watch the filesystem or claim a complete list of changes.

A run leaves two things behind: a record, which is specified, and one session
per stage, which is the runtime's own ([the record](record.md),
[the session](session.md)). Inspection is the interface for reading both.
Everything here reads retained state. Assembly management and authentication are documented in their own sections.

A record-controlled read — the record itself or a file path it names — validates
every component beneath the run directory. It refuses a missing, linked,
unreadable, or non-file component; otherwise it opens the validated regular
file and holds that object open through the read. Thus a replacement cannot
redirect the reading, while healthy regular files retain their existing,
byte-exact answers.

It is a command-line interface, and it obeys the conventions of one. Its
line-oriented commands write to stdout, one record per line, in a stable field
order, so that `grep`, `cut`, `awk`, and `jq` all work on them without a parser
being written for each. `bot run output` and `bot run request` stream retained
files unchanged. Diagnostics go to stderr. Every command here works in one
home, and `--home DIR` names it ([the home](home.md)).

Exit is `0` when something was found and `1` when nothing was. A human or JSON `bot home busy` reading exits `0` for either answer. Its quiet mode uses `0` for busy and `1` for idle. `bot assembly check` uses `0` when the assembly is well formed and `2` when it is not. That is the code a run of that assembly would have produced ([refusals](refusals.md)).

Finding nothing is an answer, and it says which nothing on stderr: no home at
that path, a home holding no runs, a name matching no run, a run with no
record, a stage or a repeat the run does not have, no tool call to report, no
tool call matching what was asked for. Exit is still `1`. Silence and exit `1` are what a crash
looks like, and a person cannot tell them apart.

A command that names one run and cannot read that run's record has found
nothing: it exits `1` and prints no part of the reading it could not finish. A
reading that stops early looks exactly like a run that stopped early, and
[the record](record.md) is where that distinction lives, so a partial reading
would be bot inventing an ending. The listing is the place a fault is reported
beside the runs it did not touch.

## The commands

| Command                     | Answers                                        |
| --------------------------- | ---------------------------------------------- |
| `bot capabilities`          | which structured commands this executable implements |
| `bot home busy <directory>` | whether a live run holds that exact directory  |
| `bot home show --home DIR`  | read one home's installation identity without mutation |
| `bot assembly check <assembly>[/<flow>]` | validate an assembly through the current structured read contract |
| `bot assembly list`          | list a home's assemblies through the current structured read contract |
| `bot assembly remove <name>` | remove one installation through the current structured mutation contract |
| `bot run start <target> [request]` | start a run and return its bounded result       |
| `bot run resume <run>`     | resume a retained run and return its bounded result |
| `bot run list`              | which runs match a structured bounded query    |
| `bot run check <run> <name>` | every recording for one named check, or one exact capture |
| `bot run checklist <run>`   | the checklist marks retained by one root run       |
| `bot run events <run>`      | the complete root or authorized child event sequence |
| `bot run session <run> <stage>` | one bounded rendered page or the exact raw session bytes |
| `bot run output <run> [stage] --raw` | one accepted output's hash-verified bytes |
| `bot run request <run> --raw` | the retained root request's hash-verified bytes |
| `bot run record <run> --raw` | the root record's retained bytes without endorsement |
| `bot run show <run>`        | one bounded root-run, stage, and subflow reading |
| `bot auth list`             | bounded safe provider authentication status      |
| `bot auth login <provider>` | stores one credential through the provider's sign-in |
| `bot auth logout <provider>` | completes one provider's idempotent credential deletion |
| `bot model list [provider]` | bounded current model availability             |

### Current assembly reads

`bot assembly check TARGET [request] [--json|-j] [--home DIR]` uses the shared
`readAssemblyTree` reader and invocation option resolver that `bot run start`
uses. It does not call a model,
change the home, or use the network. Human output keeps the existing stage
lines. JSON returns one newline-terminated `bot.assembly.check` document with
the target, an ordered bounded stage page, a page continuation, and a bounded
summary.

`bot assembly list [--json|-j] [--home DIR]` reads the home's assembly tree
through the same owner as the assembly listing. Human output keeps
the installed and linked lines. JSON returns one newline-terminated
`bot.assembly.list` document with bounded rows, an opaque keyset cursor, and a
summary. Both commands are read-only and network-free. The version-1 documents
use a default page of 20 rows and a maximum page of 200 rows.

### `bot capabilities`

`bot capabilities` reads the command contracts compiled into the executable and the Bot package's source identity. It reads no home, provider, credentials, network, or cache. Source identity may read the package files and invoke local Git. Markdown is the default. Immediately after its heading, Markdown prints `Runtime: VERSION; source: SOURCE; digest: DIGEST; source tree SHA-256: SHA256`. A null digest prints as `-`. `--json` and `-j` return the same newline-terminated `bot.capabilities` document. Its `data` contains `runtime`, `runtimeSource`, `runtimeDigest`, `runtimeTreeSha256`, and the unchanged `commands` inventory. The result stays at schema version 1. The source values use the same package-version and source-identity resolver as a fresh top-level `run_start`. The source-tree hash identifies observed package and TypeScript bytes on disk. It does not claim to identify modules Node already loaded or an atomic tree state. Missing Git or a non-checkout installation reports source `unknown` and a null digest. A required source-tree listing or read failure exits 4 with the common retryable `dependency-failed` result and cause `runtime-identity-unavailable`.

The command inventory contains only implemented commands from the new noun-based surface. Every command descriptor names its operation, command words, output contract, modes, home behavior, mutation behavior, network behavior, accepted options, and enforced limits. Structured output contracts name their schema version. Raw output has no envelope or schema version. Commands sort by operation. Options sort by long name. The complete result is at most 65,536 UTF-8 bytes.

The inventory contains `assembly.check`, `assembly.install`, `assembly.link`, `assembly.list`, `assembly.remove`, `assembly.update`, `auth.list`, `auth.login`, `auth.logout`, `capabilities`, `home.busy`, `home.show`, `model.list`, `run.check`, `run.checklist`, `run.events`, `run.list`, `run.output`, `run.record`, `run.request`, `run.resume`, `run.session`, `run.show`, and `run.start`. The `home.show` option descriptor marks `--home` as required. Optional options omit that property. It omits planned commands, deleted commands, and legacy spellings. Unknown arguments, `--home`, and repeated or combined JSON flags are malformed capability requests. JSON failures use the common structured error with operation `capabilities`. Human failures use one bounded inert line. Request failures occur before source identity work.

### `bot home show`

The command requires one explicit `--home DIR`; missing, empty, repeated, valueless, flag-valued, and ambient-only selection fails before filesystem work. It returns `bot.home.show`. Its Markdown and version-1 JSON results occupy at most 4,096 UTF-8 bytes. A valid absent reading exits zero with `initialized: false` and creates nothing. Other failures use the common bounded error contract. `bot home init` is unsupported.

### `bot home busy <directory>`

`bot home busy DIRECTORY [--quiet|--json|-j] [--home DIR]` uses the shared liveness predicate. It resolves a relative directory against the caller's working directory. Home selection uses explicit `--home`, then `BOT_HOME`, then the platform default. A missing home or `runs` directory answers idle. An unreadable or malformed live run tree answers busy because Bot cannot prove that the directory is idle. The command reads no network resource and changes no file.

Human output is exactly `Busy: yes` or `Busy: no` followed by a newline. JSON output is one newline-terminated version-1 `bot.home.busy` document with a boolean `data.busy` field. Both modes exit `0` for either answer. Quiet mode writes neither stream and exits `0` when busy or `1` when idle. Quiet and JSON modes conflict. Malformed requests fail with exit `2` before a reading. JSON requests receive the common structured error. Other requests receive the common bounded inert error.

### `bot run show`

`bot run show RUN [--json|-j] [--home DIR]` reads one root record through the bounded safe reader, derives the complete model from that held snapshot, samples the lock once when the record has a start and no end, and then checks each derived stage-repeat scratch directory in combined record order. It never follows a child reference or opens a child record. Empty records succeed as `incomplete`; ended, running, and crashed states follow accepted root events and the sampled lock.

JSON returns one newline-terminated `bot.run.show` schema-version-1 document with `data`, `summary`, and `warnings`. Data carries root facts plus stage and subflow arrays. A stage attempt comes from `stage_carried` or `stage_start`; carried, unreconciled, ended, and incomplete states use only the matching attempt facts. A started subflow child must equal its writer-owned `stages/STAGE/REPEAT/RETRY/subflows/CALL` path, but the command does not read that path. Markdown presents the same retained prefix in root facts and stage, subflow, summary, and warning tables.

The command retains at most 1,000 stage and subflow rows in one combined record-order prefix. JSON and Markdown use the same longest prefix for which both complete documents remain below 1 MiB. Retained source text is at most 4,096 UTF-8 bytes; optional oversized text becomes null with a warning, while required identity text fails integrity. Markdown makes source text inert, clips cells at 480 bytes, and limits each physical row to 4,096 bytes. Both modes compute the same first 20 warnings and exact omission counts before prefix selection.

Malformed requests fail before home access. Missing or ambiguous runs and missing records exit 1. Shared record faults and malformed consumed facts produce one exit-5 integrity failure without partial output. Unexpected home, run enumeration, lock, or scratch failures exit 4. The command changes nothing and contacts no provider. Bot smoke callers use this machine-readable one-run result.

### `bot run record`

`bot run record RUN --raw` writes the selected root run's retained `record.jsonl` bytes exactly as stored. It does not parse, validate, or endorse those bytes. `RUN` is a full run name or an unambiguous prefix. `--home DIR` follows the common home precedence. The command has no child selector and no rendered or JSON form.

The command uses the shared raw record reader. It safely opens one regular file, fixes the byte extent from that descriptor, and does not chase appends or later path replacements. Empty, malformed, incomplete, unsupported, structurally invalid, and oversized records remain available as exact forensic evidence. A failure before copying writes no standard output. A later input-read, standard-output delivery, or descriptor-close failure may leave exact bytes already written and reports one bounded diagnostic. A closed output pipe succeeds quietly.

### `bot run events`

`bot run events RUN [--child REFERENCE] [--json|-j] [--home DIR]` reads the complete semantic event sequence from one root record or one child that the parent record authorizes. Human mode preserves the established full-record reading. JSON returns one newline-terminated `bot.run.events` schema-version-1 document. Its data contains the selected root run identity, a nullable child reference, and the parsed events. `bot run record --raw` remains the exact-byte root-record command.

The semantic source stays at most 1,048,576 bytes and 10,000 segments. Each complete human or JSON result stays below 2,097,152 UTF-8 bytes. Parsing finishes before home access. Missing values, unknown or repeated options, duplicate home selection, duplicate JSON mode, and unsafe child syntax exit 2. Missing or ambiguous runs and absent or unrecorded children exit 1. Invalid, corrupt, unsupported, oversized, linked-component, disagreeing child, or over-limit results exit 5. Unexpected filesystem and synchronous output failures exit 4. Failures publish no partial result. JSON errors use the common structured error document. Human errors stay bounded. The command changes nothing and contacts no provider.

### `bot run session`

`bot run session RUN STAGE [--repeat N] [--limit N] [--after CURSOR] [--raw] [--home DIR]` reads one retained stage session through the current command surface. Rendered pages preserve format-3 direct entries and format-4 transactions. Pages default to 100 messages and permit 1 through 500. Version-1 and version-2 cursors preserve their existing continuation meaning. Raw mode returns the exact retained bytes and does not combine with pagination.

An encoded cursor stays within 8,192 bytes. Bot checks this bound before decoding. Decoded bytes stay within 6,144 bytes. Bot checks this bound before parsing. Rendered stdout stays within 1,048,576 bytes. Each source pass starts with at most 4,194,304 bytes and scans at most 1,000,000 physical lines beyond its cursor. One rendered source line stays within 1,048,576 bytes. Raw input stays within 1,048,576 bytes and 10,000 physical lines. Scanner state resets at each cursor.

Malformed requests and malformed or oversized cursors exit 2 before home access. Cursor snapshot, selection, position, and ordinal conflicts exit 3. Missing homes, runs, stages, repeats, or sessions exit 1. Invalid record-controlled paths and integrity failures exit 5. Unexpected filesystem and synchronous output failures exit 4. Human and raw failures use bounded human diagnostics. The command changes nothing and contacts no provider.

### `bot run check`

`bot run check RUN NAME [--file PATH] [--stage PATH --retry N [--repeat N]] [--json|--raw] [--home DIR]` reads every record event whose required `check` field equals `NAME`. It preserves record order and retains failed and null-exit recordings. The Markdown table has the columns `Stage`, `Repeat`, `Retry`, `Exit`, `Capture`, `Executable file`, and `Executable SHA-256`. It renders retained text through the inert-text boundary. JSON returns `{ "schemaVersion": 1, "kind": "bot.run.check", "data": { "run": RUN, "check": NAME, "recordings": [...] } }`. A recording contains exactly `stage`, `repeat`, `retry`, `exit`, `capture`, `executableFile`, and `executableSha256`.

`--file` matches the optional executable file exactly. An attempt selector requires `--stage` and a positive `--retry`. An optional positive `--repeat` selects a loop repeat. Omitting it selects only an absent repeat. Repeat 1 also selects an absent repeat for an ordinary stage. Human and JSON modes list every selected recording. Raw mode with an attempt selector requires exactly one recording and permits any recorded exit. Raw mode without a selector requires at least one successful recording. Every successful recording must agree on its capture, optional executable file, and optional executable digest.

Every matching event must carry a nonempty stage, positive safe retry, optional positive safe repeat, optional non-negative safe exit or null, normalized relative capture, optional normalized relative executable file, and optional lowercase hexadecimal SHA-256. One malformed match fails the complete reading with exit 5. The executable digest identifies the gate executable. It does not authenticate the capture.

The semantic record reader keeps its 1 MiB document bound. Raw mode safely holds and buffers one capture of at most 16 MiB before standard output. It follows no links and rejects missing, unreadable, non-file, unsafe, oversized, or replaced evidence with exit 5 and no capture bytes. A standard-output delivery failure exits 1 and may leave the exact prefix accepted by the output boundary. Missing or ambiguous runs, missing records, empty selections, and raw selection ambiguity exit 1. Request errors exit 2. `--json` and `--raw` conflict. Structured errors go to standard error for JSON requests. Human and raw diagnostics stay bounded.

### `bot run checklist`

`bot run checklist RUN [--stage PATH] [--retry N] [--repeat N] [--json|-j] [--home DIR]` reads `mark` tool calls from one root record. It never reads a child record or captured assembly, changes the home, or contacts a provider. Each selector works alone or with the others and compares its field exactly. An explicit repeat of `1` does not select a mark with no recorded repeat.

The Markdown table and newline-terminated version-1 `bot.run.checklist` JSON document preserve record order. Both carry `stage`, nullable `repeat`, `retry`, `item`, `decision`, nullable `evidence`, and nullable `reason`. Markdown uses those seven columns in that order and makes each retained cell inert under a 480-byte limit. JSON contains `{ "schemaVersion": 1, "kind": "bot.run.checklist", "data": { "run": RUN, "marks": [...] } }`. The semantic record reader retains its 1 MiB limit.

A mark needs a nonempty stage, positive safe integer retry and item, optional positive safe integer repeat, and a `done` or `skipped` decision. Current marks carry nonempty evidence. A historical mark without evidence reads as null. Present evidence and reason must be nonempty strings. A skipped mark requires a reason. A malformed mark fails the complete reading. Other event kinds remain outside this reader's field checks. Additive fields remain readable. A valid incomplete record prefix remains readable.

A valid record with no selected marks exits `1` and writes no stdout. A malformed request exits `2` before home access. An invalid, unsupported, unreadable, non-file, non-UTF-8, or oversized semantic record exits `5`. Missing and ambiguous runs and missing records retain the reader exit `1`. JSON errors use the common structured error with operation `run.checklist`.

### `bot run output`

`bot run output RUN [STAGE] --raw` reads the selected accepted output. The command requires raw mode and accepts only one run, one optional stage, and one optional `--home DIR`. Malformed options fail before Bot reads the home. It safely opens one source descriptor and fixes the initial byte extent. A bounded-memory first pass must match the recorded hash before standard output begins. A second pass streams the same held extent and computes its delivery hash. Path replacement cannot redirect the descriptor, and an append cannot extend the fixed extent. An in-place change between or during the passes may reach standard output. A changed delivery hash returns the integrity failure and never reports success. A caller must honor the exit status. A read or standard-output failure may leave bytes already written. The command has no rendered or JSON form and never contacts a provider.

### `bot run request`

`bot run request RUN --raw` selects the retained root request from a structurally valid record. The recorded path must be normalized and owned by the run. Its recorded byte count and SHA-256 must match the initial fixed descriptor extent before standard output begins. A bounded-memory second pass streams that same held extent and must produce the same hash for exit zero. Path replacement cannot redirect delivery, and appends do not extend the fixed extent. A late in-place change may leave bytes on standard output before the command reports an integrity failure. The command accepts one run and one optional `--home DIR`. It rejects malformed arguments before reading the home, has no rendered or JSON form, has no request-size limit, and never contacts a provider.

### `bot run list`

`bot run list` is the composable bounded run summary. Markdown is the default and prints a pipe table. `--json` and `-j` print one versioned JSON document followed by one newline. The default fields are `id`, `assembly`, `flow`, `startedAt`, `endedAt`, `duration`, `state`, `exit`, `cause`, and `tokens`. `--fields` selects and orders a nonempty subset. `--count` returns an exact count without rows and cannot be combined with paging or projection options.

The command accepts repeatable `--assembly`, `--flow`, `--state`, and `--cause` filters. Values repeated for one filter are alternatives. Different filters all apply. The four filters accept at most 64 values and 2,048 UTF-8 bytes of values in total after duplicate removal. Assembly and flow filter values contain no C0 or C1 controls. `--since` and `--until` are inclusive and accept only Bot's canonical UTC millisecond form, `YYYY-MM-DDTHH:mm:ss.sssZ`, with a calendar-valid year from 0100 through 9999. A summary whose required fact is absent does not match that filter. The states are `ended`, `running`, `crashed`, `incomplete`, `invalid`, `no-record`, `bad-record`, `bad-version`, and `unreadable`.

Rows use descending bytewise run-name order. `--limit` accepts 1 through 200 and defaults to 20. A nonterminal page returns an opaque `--after` cursor. Its decoded form is strict canonical JSON. The cursor binds a hash of the resolved home path, semantic filters, first-page upper bound, last examined name, and the run-name membership at or below that bound. Runs created above the bound do not enter the traversal. A created, removed, or renamed run at or below the bound produces a cursor conflict. A caller may change the limit or projection between pages. An encoded cursor is at most 8,192 bytes and its decoded document is at most 6,144 bytes. Bot checks both limits before parsing and emits no larger cursor. It uses no YAML parser. Before membership comparison, it requires an exact 64-character lowercase hexadecimal home hash, known state and cause values, safe-integer ordered time bounds, and unique bytewise-sorted filter arrays under the direct request's value, byte, and control limits. Every decoding, UTF-8, JSON parsing, shape, version, semantic, and canonicalization failure is `cursor-invalid` with exit 2.

JSON success has `schemaVersion`, `kind`, `data`, `page`, `summary`, and `warnings`. Numeric facts remain numbers and absent facts remain `null`. An ended row's `endedAt` is the exact timestamp from its accepted `run_end`. Its `duration` is the signed integer millisecond difference from the accepted `run_start` timestamp to that end timestamp. Bot does not round or clamp the difference. Bot does not use the reading clock. A row without an accepted start and end pair carries null for both facts. The result remains `bot.run.list` schema version 1 under the pre-release change-in-place policy. A summary text fact above 1,024 UTF-8 bytes is unavailable rather than truncated and produces a warning. At most 20 warnings appear. `summary.warningCount` names the exact number of warning entries encountered through that response's continuation position and `summary.warningsOmitted` names how many do not appear. One row may contribute record-reading and presentation warnings; neither suppresses the other. A count scans every candidate. Count traversal retains no run rows and uses the same bounded warning set. JSON failure writes one structured error to stderr and nothing to stdout. The error names the failed `run.list` operation, a stable code and cause, a bounded message, retryability, and structured details. Invalid requests exit 2, cursor conflicts exit 3, dependency failures exit 4, and internal integrity failures exit 5. A missing or non-directory home exits 1 with `home-not-found` or `home-invalid`. A missing `runs/` directory is an empty valid home. An unreadable home or non-directory `runs` entry is a dependency failure. Empty valid results succeed.

Markdown renders retained text as inert data. `endedAt` uses the same elapsed-age presentation as `startedAt`. `duration` renders the exact signed integer followed by `ms`. Either absent fact renders as `-`. C0 and C1 controls become visible escapes. Backslashes are escaped before pipes, and HTML-significant characters are escaped. Clipping happens after escaping for every field, including `id`. A cell is at most 480 UTF-8 bytes, a row is at most 4,096 bytes, and a page is below 1 MiB. Every clipped cell produces a warning that names the run, field, and omitted escaped-byte count. Human warning diagnostics use the same first 20 warnings, one physical line of at most 1,024 bytes each, followed by one omission line when needed. A human failure is one inert physical line of at most 2,048 bytes and uses the same escaping before clipping.

The command reads only run names and the bounded record facts needed for summaries. It does not read sessions or detailed artifacts. State follows one order. A live run directory without a record is omitted. A dead recordless directory is `no-record`. A held-record fault supplies its fault state. A readable record without `run_start` is `incomplete`. A record with `run_end` is `ended`. A remaining started record is `running` or `crashed` according to its lock.


### `bot model list`

`bot model list [provider] [--live] [--offset N] [--limit N] [--json|-j]` lists the models in Pi's local catalog. It sorts exact provider and model identities bytewise before applying offset paging. JSON returns one schema-version-1 `bot.model.list` document with model rows, page facts, and summary counts. Human output retains the model columns and ends with the number shown and the snapshot total. An empty valid snapshot succeeds.

Without `--live`, the command reads Pi's local catalog and does not contact a provider. `--live` compares that set with current catalogs and may contact providers. A model seen only before is `local-only`; one seen only afterward is `live-only`; a shared identity has a null status and uses the post-refresh model facts. `PI_OFFLINE` vetoes catalog network during that refresh. A failed or aborted live refresh exits 4 and emits no model rows. A named provider without a credential is reported before contacting that provider.
## What a runtime has to provide

- A record that `bot run events --json` can emit in one versioned document.
- A session per stage, reachable from the record.
- Tool calls with a stage, a name, and an outcome, where the underlying agent
  library reports them.
- Rendering for its own session format.

A runtime that cannot report some of this reports nothing for it. Blank is a
true answer; an inferred one is not ([invariant 17](invariants.md)).

## Reading a run that is still going

The record is append-only, so a run in progress is readable the same way a
finished one is: the lines that exist are the lines that happened, and the last
one is where the run currently is. `bot run events` on a live run is a status display
that needed no separate mechanism.
