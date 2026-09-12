---
flow: build
priority: 6
---
# `bot runs` answers at a glance and deep dives on request

`bot runs` with no arguments prints one line per run for every run the
home holds. On 2026-08-20 that is 480 lines and 41,975 characters;
`--json` is 70,383. The home is two weeks old, so this grows without
end.

Almost no question needs all of it. "What ran recently", "what is
running now", "what refused today" are each a handful of lines, and an
agent that has to read forty thousand characters to answer one of them
has paid a cost wildly out of proportion to the information.

`bot logs` in this same CLI already gets this right and is the model:
bare, it reads only the newest 20 runs, and it says on stderr when that
left something out so stdout stays clean for a pipe. It also carries
exact-match filters that combine. Nothing in `bot runs` is a harder
problem than what `bot logs` already solved.

Done, observably: `bot runs` bare answers the common question in a
small, bounded output, states on stderr what it did not show, and
offers filters that let a caller reach anything the full listing would
have reached. Asking for everything is still possible and is spelled
out. The bounded default and the filters both hold for `--json`.

The measure that matters: the characters a caller reads should be
proportional to the information they asked for. Read the ceiling this
repo carries for its own source as the precedent — a number that must
be paid for deliberately.

Settled choices:

- Match `bot logs`: bounded by default, the omission announced on
  stderr, stdout clean for a pipe. Do not invent a second convention
  for the same problem in the same CLI.
- Filters are for narrowing to an answer, not for pretty output. Prefer
  filters that compose over flags that reformat.
- `--json` gets the same default bound. A machine reader is exactly the
  caller that pays for the extra characters.
- Do not solve this by deleting runs. `bot prune` is a separate command
  with its own ticket surface, and a listing command must not be the
  thing that decides history is too long.

Named for restatement in the design and design-review commits: the test
files covering `bot runs` only.
