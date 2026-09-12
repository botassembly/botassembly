---
flow: build
priority: 7
---
# Install is atomic

`fetchInto` copies the source tree straight onto the target
(`cp(from, target, { recursive: true })`). A crash or refusal midway
leaves a half-copied assembly at its final name, indistinguishable from
a whole one; the next run seals and executes whatever survived. Flagged
by the 2026-08-10 outside review.

## Behavior

- An install or update materializes the incoming tree beside the
  target and renames it into place, so the target is only ever the old
  whole tree or the new whole tree. On failure the target is untouched
  and the partial scratch is removed.
- The rename choice must respect the existing no-half-made-namespace
  rule (the mkdir comment in fetchInto) — a refusal still leaves no
  debris.

## Tests you are authorized to restate

- Management tests pinning the copy mechanics may restate to the
  stage-and-rename shape. A new test kills the copy midway and shows
  the target still whole.

The src line ceiling may rise by at most 15 lines.
