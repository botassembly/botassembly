---
flow: build
priority: 8
---
# A local install remembers where it came from

`fetchInto` (bot/src/management.ts) resolves a local assembly locator
against the caller's current working directory:
`resolve(input.cwd, locator)`. Install from one directory, later run
`bot update` from another, and a DIFFERENT source tree can be fetched
and installed silently — same locator text, different assembly. The
2026-08-10 outside review flagged this as its top bot finding.

## Behavior

- Installing from a local path stores canonical absolute provenance
  (the resolved real path, plus the `#subdir` when one was given).
- Update reads the stored provenance and fetches from exactly there,
  regardless of the caller's cwd. If the stored path no longer exists
  or no longer carries the assembly marker, refuse with the two-line
  refusal shape naming the stored path — never fall back to resolving
  against cwd.
- Remote locators are untouched; their provenance is already absolute.
- `bot assemblies` (or the existing listing surface) shows the stored
  provenance so an operator can see where updates will come from.

## Tests you are authorized to restate

- Management tests that pin the stored provenance shape or the update
  fetch path may be restated to the canonical-absolute shape. Do not
  weaken refusal-shape assertions.

The src line ceiling may rise by at most 20 lines.
