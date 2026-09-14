---
base: 1340782
head: 6aa4137
---

# List the home's intelligence table

`bot intelligence list` is a new read-only operation. It prints the home's `intelligences` table in Markdown and JSON, loads no Pi, reaches no network, and is exported through the admin-readings door as `intelligenceListReading` on `bot/admin-readings`. The live comparison in `bot/tests/library-contract.test.ts` runs `["intelligence", "list", "--json", "--home", home]` against `intelligenceListReading` and searches `bot.intelligence.list` on stdout, byte for byte. The operation inventory now stands at 26.

## Verification

Design review rejected the first draft on three grounds: refusal codes were used where causes were required, the missing-file acceptance case was unreachable, and the exit code was stated without a spec sentence backing it. The revision was accepted.

Code review rejected the first implementation on four grounds: a flag-valued `--home` value was accepted as a path, no malformed-option tests existed, an oversize refusal went undocumented, and a code was derived from an exit rather than stated directly. The revision was accepted.

The full test rung then failed two pinned inventory suites the ticket had not named, `bot/tests/capabilities.test.ts` and `bot/tests/cli-lazy-model-runtime.test.ts`, fixed in a second commit that joins the new operation to both. Gate spec, lint, and test all exit 0 on the final commit: 219 test files, 1804 tests, conformance 143/143.

## Honest limitations

No implicit `default` row is synthesised; the row named `default` is the one an unnamed resolution takes because `bot/src/options.ts:85` hardcodes that name. A malformed table refuses with code `request-invalid` at exit 2, matching `bot assembly check`, which Ian can overturn by changing one spec sentence. A table over 65,536 bytes refuses with code `integrity-failed`.

## Hosted runs

Hosted runtime run `34890404837` and hosted docs run `34890405093`, both on commit `6aa4137`, completed with conclusion success; the runtime run's `wsl` job shows skipped, the expected state for a push run.

**Decision Ian can overturn:** the malformed-table refusal reuses `bot assembly check`'s code and exit by matching precedent rather than by a distinct rule; changing one spec sentence changes it.

- Origin: `sdlc/tickets/0297-intelligence-list.md`, requirement A1 and proposed ticket 8 of the 2026-09-14 admin surface note, and the issue filed 2026-09-14.
