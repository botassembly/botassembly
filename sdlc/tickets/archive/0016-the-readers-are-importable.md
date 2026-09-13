---
flow: build
priority: 5
---
# The readers are importable

Raised by the 2026-08-11 deck planning session.

The observability deck must render run records and pi session
transcripts. The record file format is a specified contract a
stranger may parse; the session format deliberately is not — bot's
own `session.ts` is the only sanctioned reading of it, and
`record-lines.ts` is the only sanctioned record reader (dialect
refusal, truncation handling, UTF-8 discipline). The deck must not
re-implement any of that: one parser, owned here, shared outward.

Today it cannot share. The package is `private: true` with no
`exports` field; nothing outside the repo can import the readers
without reaching into `src/` by path, which pins the deck to file
layout instead of to a named door.

## Behavior

An external package that depends on this one can import the reading
modules by stable names — the record reader, the session readers,
and the static inspection entry points — and use them against a run
directory. A test proves the door from outside: importing by the
exported names, not by `src/` paths, resolves and works.

Naming which modules are the doorway is the design's choice; the
principle is that the doorway is the *readers*, never the runtime.
Nothing about running assemblies is exported. The record spec
remains the wire contract for strangers; the exports are how kin
avoid writing a second parser.

## Consumers

The deck repo is the first consumer. It has no code yet, so nothing
breaks and no consumer ticket is required; the deck's first run-page
work adopts these imports when it starts.

## Tests you are authorized to restate

None — this is additive. New tests only.

The src line ceiling may rise by at most 10 lines.
