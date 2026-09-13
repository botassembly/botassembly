---
flow: build
priority: 5
---
# `bot config example` emits a valid starting config.yaml

`bot config` answers what a home says and is structurally read-only —
no path from a secret to stdout, and no path from the command to the
file (`bot/src/config.ts`). Nothing scaffolds the file it reads. An
operator who wants profiles today writes `config.yaml` from the
specification's prose, and the 2026-08-20 fresh-reader review found
the seam: the site sells profiles on its landing page while a
teammate receiving a `profile:`-bearing assembly has no path from
"it refused" to a working table beyond reading the home element
end to end.

Done, observably: `bot config example` prints to stdout a complete,
commented `config.yaml` — defaults block and a two-profile,
two-tier table — that passes the home reader unchanged
(`bot/src/home-config.ts`); a test pipes the emitted bytes through
`readYamlOptions` and asserts zero faults. The command writes no
file (the operator redirects it) and takes `--home` for the path it
names in its comment header.

Budget: 60 net src lines.
