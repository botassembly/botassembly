---
base: cff4313dc63ac9f577ddb6db447d19fc996a72c9
head: 5907e29f0215608c5c1edea632caa610856423c7
---

# The credential advisory line prints only from auth commands

The credential advisory about the retired store now prints only from `bot auth list`, `bot auth login`, and `bot auth logout`, exactly once per process when the retired store exists. `bot run start`, `bot run resume`, and `bot model list` write nothing to stderr about the retired store, on success or otherwise. The one mechanism for the change is deletion: the three calls to `boundary.beforeCredentialAccess()` in `run-command.ts` and `model-list-command.ts` are gone, so `cli.ts`'s advisory wrapper is reachable only from the three auth commands, which keep their existing calls unchanged. No argv-based guard was added. The now-byte-exact tests in `auth-transition.test.ts` and `cli-model-list-contract.test.ts` were rewritten to match: the three run and model-list surfaces assert zero occurrences of the warning, and the three auth surfaces keep asserting exactly one. The specification sentence at `specification/elements/auth.md:156-160` and its whitespace-normalized pin in `auth-transition.test.ts` now name three commands instead of six. `docs/src/content/docs/operate/providers-and-credentials.md:89` and its example block carry the same three-command rule. A `specification/CHANGELOG.md` entry records the narrowed set. Production size moved from 18882 to 18878 nonblank lines.

Design review rejected the first draft for two unnamed byte-exact pins, a stale docs citation, a missed live docs promise on `docs/src/content/docs/operate/providers-and-credentials.md`, a double mechanism, and wrong size arithmetic. The revised draft was accepted. Independent code review accepted the revised draft at `0e8f26a`, then applied three minor cleanups at `8923921`, rebased onto `5907e29`. The reviewer reproduced by command that `bot model list` prints nothing to stderr and that `bot auth list` prints the advisory exactly once.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, all 143 conformance cases passed, vitest ran 216 files and 1753 tests passed, and `node --test` ran 160 tests passed. Hosted runtime run `34879711581` and hosted docs run `34879712047`, both on commit `5907e29`, completed with conclusion success.

A run that will fail for lack of credentials still gets its actionable message through the credential-missing refusal from ticket 0283; the advisory itself no longer reaches a run. This closes the issue Ian filed 2026-09-14, `sdlc/issues/2026-09-14-a-credential-advisory-line-writes-to-stderr-on-every-command.md`.

**Decision Ian can overturn:** none. The accepted cost, that an operator with a stale retired credential file now learns about it only from an auth command instead of every command, was named and accepted in the ticket's size decision.
