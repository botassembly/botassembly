---
flow: build
priority: 9
---
# Install sources are confined

The 2026-08-10 outside review's top bot finding after the board
drains: installation trusts the source tree. A source-controlled
`.bot-source` symlink can make installation overwrite a file OUTSIDE
the assembly target, and a `#../sibling` subdir locator can escape the
selected source directory. An assembly source is an untrusted
filesystem boundary and must be treated like one.

## Behavior

- The `#subdir` component is validated after full path resolution: the
  resolved directory must remain beneath the source root, or the
  install refuses with the two-line refusal shape.
- A `.bot-source` (or any provenance-marker path the install writes)
  that exists as a symlink or non-regular file is refused or safely
  replaced without ever being followed.
- The rule covers local sources and cloned sources equally.
- The proof is behavioral: a test stages a hostile source with both
  tricks and shows the outside target file byte-identical afterward
  and the install refused (or completed without touching it).
- Composes with 0011's staged-and-renamed install: confinement is
  checked against the staging copy before the rename.

## Tests you are authorized to restate

- Management install/update tests may be restated where they pin the
  copy path mechanics; refusal-shape assertions keep their strength.

The src line ceiling may rise by at most 25 lines.
