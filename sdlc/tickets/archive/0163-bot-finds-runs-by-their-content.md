---
flow: build
priority: 5
---
# Bot finds runs by their content

The home holds 1,174 runs and 2 GB of records, and no verb answers
a content question: which run mentioned this error, which tool
call touched that file, which session hit a compaction. Today that
job is grep over the run directories — slow, unranked, and outside
every contract. ADR 0023 rules the architecture; this ticket
builds it. The workspace's pi-log experiment
(`~/workspace/experiments/166-pi-log`) is the proven reference
implementation of the same shape: read its README and lib/ before
designing, and carry its lessons rather than rediscovering them —
tolerant reader, watermark incremental refresh, disposable index,
and a drift check whose own recount is tested (pi-log's doctor
found its own bug on first run).

Done, observably:

- `bot find QUERY` answers with the runs and entries whose
  transcript text, tool-call arguments, or error text match, via
  an FTS index in SQLite (`node:sqlite`, FTS5, zero dependencies).
- Filters compose: `--since`/`--until` (durations and dates),
  assembly, and entry kind (user, assistant, tool call, error).
  `--json` answers per ADR 0019's one-object rule; the human
  answer is a labeled table per ADR 0022.
- Every hit prints its join keys: run id, stage, entry position —
  enough to open `bot session` or `bot show` at the right place.
- The index is derived state: deleting it loses nothing, the next
  reading rebuilds incrementally by file watermark, and a schema
  version bump drops and rebuilds it.
- An entry the indexer does not recognize is skipped and counted,
  never a crash; a run record format version the indexer has not
  seen surfaces as a named tripwire in the answer.
- A sampled recount against raw records reports index drift, and
  the recount itself is pinned by a fixture test.

Hard choices, settled: the index lives beside the run store in the
home, never inside a run directory; sealed records are never
written; error clustering, loop detection, and latency views are
later tickets on the same index and out of scope here; no verb
other than `find` is added.

## 2026-08-27 addendum: feasibility is proven, with numbers

A spike ran the design against the live store the same day this
ticket was filed (workspace `experiments/167-bot-find-spike`; a
factory attempt cannot read that folder, so the numbers live
here). Measured: 150 runs, 630 files, 187 MB raw indexed into
67,537 FTS5 entries in 6.3 seconds cold via `node:sqlite`; zero
unparsed lines; queries answered in about a millisecond with
snippets and (run, stage, position) join keys. The index came out
at 92 MB — roughly half the raw size — so a full-store cold index
is about a minute and about 1 GB. Two design consequences: cap or
summarize oversized tool-result text at index time (the spike
capped entries at 8,000 characters and still hit 49%), and index
`record.jsonl` events alongside transcripts — error text and event
kinds live there and answered the error-hunting queries. The
extraction rule that covered every sampled line: take string
content, `content` arrays' text parts, and bare `text` fields.
