---
flow: build
priority: 5
---
# Observability read errors escape the CLI

Promoted 2026-08-21 from
`sdlc/issues/0105-observability-read-errors-escape-the-cli.md`
(severity should-fix, filed by the 2026-08-20 observability review).

`heldFile()` accepts a directory, or a path that disappears after
its check, and `output`, `session`, and `logs` then call
`readFile()` unguarded (`bot/src/one-run.ts:93,158,218`). Those
commands crash with raw `EISDIR` or `ENOENT` instead of their
normal diagnostic and 0/1 result.

Done, observably: a directory where a file was expected, or a file
vanishing between check and read, produces the existing
missing-output or missing-session diagnostic and the command's
normal exit code — never an unhandled rejection. One safe reader
serving all three commands is the suggested shape; the design
decides.
