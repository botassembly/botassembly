---
flow: build
priority: 5
deps: [0017]
---
# Containers' workdir semantics are pinned

Follows ticket 0017. The pilot proved the linear case only; the
container cases currently work by accident of implementation, and
accidental semantics drift. This ticket makes them deliberate:
specified in the specification element and pinned by conformance
coverage. The intended semantics are settled here, not left open:

- **PARALLEL:** each branch stage resolves its own authored
  `workdir`. Branches that name the same directory (or omit the
  field) share it — that is authored intent and stays legal, the
  same way stages share the root today. The specification warns
  plainly that concurrent branches sharing a writable directory is
  the author's own collision to manage.
- **LOOP:** every repeat of a stage uses the same authored
  directory, and files left by an earlier repeat remain visible to
  later repeats — accumulation is the point of a loop. Runtime
  scratch and session identity stay repeat-specific, as they
  already are.
- **Subflow within a container:** inherits the calling stage's
  resolved directory, exactly as in the linear case.

## Behavior

Conformance fixtures exercise a PARALLEL with distinct workdirs, a
PARALLEL sharing one, and a LOOP observing a prior repeat's file.
The specification element for workdir states the container rules in
the words above. `bot check` renders container stages' resolved
directories the same way it renders linear ones.

No runtime behavior is expected to change; if the implementation
disagrees with the semantics above anywhere, the implementation
moves to the spec, not the reverse.

The src line ceiling may rise by at most 10 lines.
