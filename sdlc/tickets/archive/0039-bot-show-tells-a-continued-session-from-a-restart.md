---
flow: build
priority: 3
---
# bot show tells a continued session from a restart

A consumer project misread `read nothing, inherited root` as proof that a
gate retry restarted the stage; the session record showed the
opposite (one `session.jsonl`, gate findings injected into the
same conversation, context intact). No behavior defect —
presentation only: the line conflates "no new slot input this
round" with "new session".

`bot show` says which it is, in the stage-start line's own
plain style — distinguishing a round that continues the
existing session from one that opens a new one. The reading
comes from facts the record already holds; no new record
fields.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/show-reading.test.ts` and
`bot/tests/cli-json-and-show.test.ts` where they pin the
current line.
