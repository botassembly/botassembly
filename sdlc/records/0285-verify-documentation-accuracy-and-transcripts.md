---
base: 4e9d0f5d2ab420337d9851a97a57e7bec70a6f07
head: 6184e12d18c4bcbd0f44dd7f9de247a1df870001
---

# Every example transcript and every accuracy claim now proves itself

`scripts/example-transcripts.test.mjs` runs `node bot/src/cli.ts assembly check` for every shipped example except `examples/data`, from a temporary private home naming provider `google`, model `gemini-3.5-flash-lite`, reasoning `low`, and compares stdout bytes and exit status to the ```console fence in that example's README. A second case pins the authored site pages that paste the same command, so a page and a README cannot disagree. `sdlc/scripts/examples` now names the same model, so one throwaway home serves both the resolution check and the transcript test. All four shipped transcripts already reproduced byte for byte, so no README changed.

Ten authored pages were corrected against the specification and against the behavior tickets 0281 through 0283: `possible_inputs` now appears on the triage paste; the `--json` refusal writes to standard error and the jq recipe redirects before it pipes; `run show` carries subflow rows and warnings beside its stage rows; `run resume` accepts none of `--intelligence`, `--timeout`, `--retries`, or `--local-context`; exit codes 3, 126, and 127 are described correctly; the command reference lists seven control tools; `bot assembly check` pages 20 rows at a time; the retired-credential notice is named with its file; the smoke ladder is described as ten live rungs plus one free inspection rung numbered 6; and the Start path states that nothing is released and this publication targets 0.1.0. The Makefile's smoke comment was also corrected to match.

Independent design review accepted the test's binary and home after one correction. Independent code review accepted the implementation after four minor findings were fixed before landing: an over-specific `possible_inputs` sentence, a site paste that disagreed with the README and could not be pinned, the free smoke rung named by the wrong number, and a stale Makefile comment.

The complete local gate passed on the rebased commit: 160 project tests, 214 runtime files totaling 1,730 tests, all 143 conformance cases, and static checks. The ratchet stayed at 18,817 nonblank lines. Hosted runtime run `34852835859` and hosted docs run `34852836201` both passed on commit `6184e12`.

Three limits stay open. The transcript test pins a model name that no provider call validates, so a renamed model must move in the READMEs, the site, and `sdlc/scripts/examples` together. Accuracy was checked by one reviewer reading the pages, not by a user study. The site's generated specification pages rebuild from `specification/` and were not re-read page by page.
