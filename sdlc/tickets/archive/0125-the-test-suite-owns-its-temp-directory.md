---
flow: build
priority: 6
---
# The test suite owns its temp directory

Eight tests fail when the environment supplies its own `$TMP`
(`sdlc/issues/2026-08-22-suite-scratch-path-environment.md`): they
expect `/tmp/bot-*` paths and receive the redirected scratch path.
The tests are wrong, not the environment. A suite that asserts what
the ambient temp directory *is* already fails on a Mac (where
`/tmp` is a symlink to `/private/tmp`), under systemd's private
temp, or for any user who sets `TMPDIR`. This repo's own 0115 — a
redirected, capped stage temp for every agent — is merely the first
member of that class scheduled to run here: the deadline, not the
justification. Tests must pass anywhere — a laptop, bare CI, inside
a flight — which means they may never depend on where the ambient
temp directory points.

## What done looks like, observably

- The vitest global setup creates one fresh per-run directory
  inside the checkout (gitignored), points `TMPDIR`, `TMP`, and
  `TEMP` at it, and removes it at teardown. The setup is the
  enforcement: a hidden `/tmp` assumption now fails every run on
  every machine, not just under a redirected environment — and
  every test artifact lands in one directory that vanishes,
  instead of littering the shared `/tmp`.
- Every test that needs a directory makes its own unique one under
  that root and cleans it up. No literal `/tmp` path appears in
  test files, and a lint check proves it.
- Path assertions compare resolved paths (`realpath` both sides),
  never spelled ones, so a symlinked temp cannot fail an equality
  that is true.
- Tests that exercise the temp machinery itself keep working by
  the pattern they should already use: they set the child's temp
  environment explicitly and assert about the value they set.
- The full suite is green with the temp variables pointing at a
  symlink and at a directory that is not `/tmp` — the issue's two
  reproductions, kept as cases.

## Boundary

No runtime or product code changes — not 0115, not the slots, not
scratch-root selection. The stage environment is composed whole and
gates legitimately see the redirected temp; the fix is that the
tests stop caring. The issue file closes with this ticket.
