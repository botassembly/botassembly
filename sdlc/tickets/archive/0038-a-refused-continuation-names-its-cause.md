---
flow: build
priority: 7
---
# A refused continuation names its cause

A consumer project's first day: `--continue` refused with "it is missing,
live, unreadable, or incompatible" — four causes in one
sentence, three of which a caller would fix differently. The
actual cause (the assembly had changed; the sealed stages no
longer described what would run) was the one piece of
information that decides between "re-run and eat the loss" and
"go hunting for a permissions problem". The economics are real:
the sealed stages held two agents' finished work.

`bot/src/continuation.ts` knows which check failed; the refusal
says it. One cause per message, each naming its fix the way
refusals already do elsewhere: missing (no such run), live (a
run holds it now), unreadable (what could not be read),
incompatible (the assembly changed since that run — re-run
fresh). The exit vocabulary and the refusal's two-line shape do
not change.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/run-continuation.test.ts`, and
`bot/tests/gating.test.ts` / `bot/tests/cli-loop-pins.test.ts`
where they pin the combined sentence.
