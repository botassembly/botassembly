---
flow: build
priority: 5
---
`bot run` should accept the conventional `--` end-of-options marker:
everything after `--` is positional (assembly/flow, then request),
never an option, so a request or ref beginning with a dash cannot be
misread as a flag.

Why: the sdlc dispatcher invokes `bot run` with a ticket ref it
treats as opaque. On 2026-08-07 it tried to protect a dash-prefixed
ref with `--` and every dispatch refused instantly
(`assembly-unknown --in`), because bot has no end-of-options
support. The dispatcher was reverted to the unprotected shape; this
ticket restores the protection at the right layer. Other CLI
callers get the same safety.

Scope: `run` only, spec first — the invocation grammar is specified
behavior, so the specification names `--` before the parser honors
it. `--help` documents it in one line. Existing invocations without
`--` behave exactly as today.
