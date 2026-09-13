---
flow: quickfix
priority: 3
---
# An install name that looks like a flag is refused

`bot assembly install --name --something` installs the literal
name `--something`, and a trailing `--name` with no value silently
falls back to the default name (`bot/src/management.ts:159`). Both
are almost certainly typos, and both succeed quietly.

Done, observably: a `--name` value beginning with `-` is refused
naming the value; a trailing `--name` with no value is refused as
the usage error it is; a legitimate name installs as today.

From the 2026-08-19 review; this ticket carries the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing management tests.
