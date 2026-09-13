---
flow: build
priority: 8
---
# One run explains where its context and tool work went

Each reader answers a narrow question. `bot show` prints every turn
and a per-stage token table. `bot runs --usage --json` attributes
token totals to stage, retry, provider, and model. `bot logs --args`
lists each settled tool call with a target summary. `bot find`
searches content. None reports the shape of one run's work: how many
turns each stage took, how large its largest single turn grew, how
many tool calls failed, how much tool-result volume the calls
returned, which targets repeated, and whether a stage read its
supplied inputs or explored elsewhere. Answering those questions
today requires a custom parser over `record.jsonl` and every stage
`session.jsonl`.

A downstream curation project's run, `2026-08-28T00-48-15-475f`,
showed the gap. The run recorded 27.6 million total tokens across
164 turns in four stages. The two later stages recorded 8.8 million
and 12.9 million. The largest single turn reached 312,620 tokens.
The final stage settled 101 tool calls and 60 of them were shell
calls. Diagnosing this took a project-side parser, because the
useful reading was scattered across the record and four transcripts.
Three of the four session files exceed the 1 MiB inspection cap, so
`bot session` refuses them whole; their tool rows still stream
through `bot logs`. The evidence was sealed and complete the whole
time. No reading joined it.

Done, observably:

- One read-only reading explains a named run per stage and retry.
  Each row reports the stage outcome, model, turn count, fresh
  input, cache read, cache write, output, total recorded tokens, and
  the largest single turn's total. Labels keep cumulative recorded
  tokens and the largest live turn distinct, so a reader cannot
  mistake one for the other.
- The same reading aggregates each stage's tool activity from the
  stored transcript: settled calls, failures, calls per tool, total
  tool-result bytes, the largest individual results, and the most
  repeated call targets. Repetition is reported as a count, never
  judged as a loop.
- The reading groups the file paths the stage's calls touched
  against what its `stage_start` event offered: received inputs,
  skills, slot paths, and paths outside those groups. Everything
  comes from recorded events and the stored transcript. No
  re-execution, no inference beyond reading what was recorded.
- Every row binds to recorded identity: run, stage, retry, and the
  `stage_end` event's output, sealed, and judged facts. The reading
  never infers acceptance from a file merely existing.
- A transcript beyond the inspection cap is read by streaming, the
  way `bot logs` already reads one. The reading never refuses a run
  for a large session. Streaming is the required design; loading a
  whole oversized transcript into memory is denied.
- The reading narrows to one stage on request.
- `--json` answers per ADR 0019's one-object rule with documented
  field meanings and units; the human answer is a labeled table per
  ADR 0022. The design chooses the exact verb or flag under ADR
  0019's surface law. Ticket 0090's standard applies: the characters
  a reader must take in stay proportional to what they asked for.
- Running the reading on a run whose record holds multiple stages
  with `turn`, `stage_start`, and `stage_end` events reproduces the
  per-stage concentration and the tool-activity mix without any
  parser outside bot.

Hard choices, settled: the reading observes. Policy stays out of
it. The reading reports recorded sizes, targets, failures, and
identities. It does not classify a call as safe, wise, or clerical,
and it does not summarize or expose reasoning content. Sealed
records and transcripts stay untouched. Existing `show`, `runs`,
`logs`, `find`, and `session` output stays compatible. `logs
--args` remains the per-call detail source and `runs --usage`
remains the cross-run aggregate. Cross-run comparison is the
consumer's job on top of the `--json` form.

Boundary: change the reading surface and its help text in the bot
CLI only. Do not change what a run records, the session transcript
format, or the sealed layout under the home. Do not add cross-run
aggregation. Do not render transcript message content. Bounded
rendering of an oversized session is out of scope; a later ticket
owns it.
