---
flow: quickfix
priority: 4
---
# bot request verifies what it prints

`bot output` verifies the sealed output's bytes against the
recorded SHA-256 before printing. `bot request`
(`bot/src/one-run.ts:43`) does not: it prints whatever sits at the
request path, and the request file lives outside the read-only
chmod seal, so a modified request prints as if it were the one the
run answered.

Done, observably: `bot request <run>` refuses a request file whose
bytes no longer match the recorded hash, with the same shape of
refusal `bot output` gives a drifted output; an untouched request
prints as today.

From the 2026-08-19 review; this ticket carries the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing one-run tests.
