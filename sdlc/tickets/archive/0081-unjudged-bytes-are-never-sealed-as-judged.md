---
flow: build
priority: 7
---
# Unjudged bytes are never sealed as judged

On the exhausted path, `finish()` (`bot/src/gating.ts:45`)
re-snapshots `$OUTPUT` after the checks failed and records the
fresh bytes in `stage_end` with `judged: true`. A gate receives
the output path as argv and may mutate the file before exiting 1;
when retries exhaust, the mutated bytes are re-read, overwrite the
attempt's captured output, and their hash is sealed as judged —
the record asserts judgment of bytes no check ever saw. The
success path already guards exactly this drift ("Output changed
after its checks passed", `bot/src/record.ts:195-206`); the
failure path does not.

This is the sealed record's core promise, and anything that later
trusts `judged` — resume most of all — inherits the lie.

The hard choice, settled: on exhaustion, the record keeps the last
bytes an attempt actually presented for judgment, and `judged`
states whether the recorded bytes are the judged bytes. Whether
that means preserving the attempt's captured snapshot or recording
the drift explicitly is the design stage's to work out; what done
prohibits is any path where `judged: true` accompanies bytes the
checks never saw.

Done, observably: a gate that rewrites `$OUTPUT` and exits 1
through every retry leaves a record whose sealed output either
matches what a check judged or is marked unjudged; the drift is
visible in the record the way the success path already makes it
visible.

This ticket exists because of
`sdlc/issues/0058-an-exhausted-stage-records-unjudged-bytes-as-judged.md`.

Named for restatement in `design:`/`design-review:` commits: the
sealing and record tests pin the current exhausted-path shape —
restatement is authorized in `bot/tests/run-capture-seal.test.ts`,
bounded to the exhausted path's output snapshot and `judged`
field; every success-path guarantee keeps full strength.
