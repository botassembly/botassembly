---
flow: build
priority: 8
---
# Record symlinks disclose files outside a run

Promoted 2026-08-21 from
`sdlc/issues/0108-record-symlinks-disclose-files-outside-a-run.md`
(severity blocking, filed by the 2026-08-20 observability review).

The lexical containment check accepts a record-controlled path that
passes through a symlink inside the run, and later reads follow the
link; `record.jsonl` itself is also read through a symlink
(`bot/src/one-run.ts:38-40`; `bot/src/record-lines.ts:87-96`). A
crafted record can make `request`, `output`, `session`, or `logs`
disclose any file the reader can read, and a replacement race has
the same effect.

Done, observably: no read of a record-controlled path follows a
symlink in any component — a crafted record pointing outside the
run gets a diagnostic, not the file's contents — and the
check-then-read race is closed, not narrowed. A no-follow file
descriptor held from validation through read is the suggested
shape; the design decides.
