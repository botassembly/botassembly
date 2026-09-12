---
flow: build
priority: 1
deps: [0246, 0253, 0254]
---
# Retained callers use supported current commands

## Outcome

Every maintained caller inside this repository with an existing current replacement uses that replacement. The retirement ledger states why each remaining legacy command stays.

## Current facts

Bot lifecycle scripts, smoke checks, examples, and maintained documentation contain legacy spellings. Several already have supported noun replacements. Session, logs, find, status, prune, and other flat-only operations do not all have replacements.

The direct blockers are 0246 (`assembly check` and `assembly list`), 0253 (`model list`), and 0254 (`auth list`). Tickets 0255-0260 add later assembly and authentication operations; they do not block this caller migration. Tickets 0253 and 0254 transitively require 0244 and 0245.

## Scope

Audit executable and documented callers in this repository. Migrate only calls whose current replacement exists. The maintained inventory includes tracked public example READMEs outside captured assembly trees because they are published documentation. Files under `examples/runs/**/assembly/**` are hashed sealed evidence and are excluded from migration; 0247 must not rebuild them. Refresh the retirement ledger with each remaining spelling, caller, and release condition. Preserve append-only history and exclude immutable records, archived tickets, the planning archive, active planning evidence, and deliberate legacy compatibility tests from mechanical migration checks. Record external callers as evidence without changing their repositories.

Do not create missing noun commands. Do not delete the legacy dispatcher, legacy help, or flat-only operations. Ticket 0217 owns final deletion after its hold clears.

Retain `bot show` where a caller needs the complete event record or a child record. `bot run show` is a bounded reading and is not an equivalent replacement for those callers. Retain flat-only `session`, `logs`, `status`, `prune`, `find`, and `config` callers until a separately accepted contract exists. Migrate lifecycle scripts to the exact quiet probe `bot home busy DIRECTORY --quiet` and to `bot run check RUN gate --file FILE --raw`. Update `sdlc/project/provenance.json` whenever their bytes change.

## Acceptance

A mechanical search finds no maintained in-repository executable or active-documentation use of an old spelling that has a supported current replacement. The search excludes immutable records, archived tickets, the planning archive, active planning evidence, compatibility tests and documentation, and captured `examples/runs/**/assembly/**` evidence. It must inspect maintained public example READMEs outside captured assembly trees. Focused smoke and lifecycle tests use the replacements. Lifecycle tests prove the exact `home busy DIRECTORY --quiet` argv, exit 0 for busy, exit 1 for idle, and empty standard output and error. Lifecycle provenance matches the migrated scripts. The ledger records every retained old operation, external caller evidence, concrete blocker, and the reason a full-record `bot show` or flat-only operation remains. README and active specification examples use available current commands while compatibility sections remain explicitly labeled.

## Design decisions

- Treat 0246, 0253, and 0254 as the only direct blockers. Do not wait for 0255-0260 or invent their future commands.
- Classify compatibility tests, immutable history, and active planning evidence separately from maintained callers. This avoids deleting proof of the bridge or rewriting decisions while still enforcing current commands in executable callers and active examples.
- Treat public example READMEs outside captured assembly trees as maintained documentation. Exclude `examples/runs/**/assembly/**` because those files are hashed sealed evidence, and do not rebuild them in 0247.
- Keep full-record and child `bot show` uses, plus flat-only inspection and configuration uses, until an approved equivalent exists. This preserves behavior instead of making a lossy lexical substitution.
- Require lifecycle callers to pass `DIRECTORY --quiet` to `bot home busy`. Tests must prove both answer exits and no output for busy and idle.
- Sanitize private consumer names in any mutable ledger rows touched here. Keep audited commits and exact source paths, and require `node scripts/check-public-tree.mjs` before completion.

The recommendation is to implement the migration as one focused caller change after the three direct blockers land, then leave command deletion and bridge-test removal to 0217. Reclassifying compatibility tests or changing the full-record `bot show` contract would expand this ticket and requires a new design review.

## Dependencies

Tickets 0246, 0253, and 0254 supply the changed command spellings used by maintained callers. Ticket 0255 depends on 0246; 0256, 0259, and 0260 depend on 0245 and 0254; 0257 and 0258 depend on 0255. Those tickets are downstream and nonblocking here.

## Implementation inventory and proof

The first migration pass covers `sdlc/scripts/examples`, `sdlc/project/before`, `sdlc/project/failure`, `sdlc/project/success`, their adoption tests, `smoke/run.sh`, `smoke/s6-inspection/validate.mjs`, `smoke/s10-lifecycle/validate.mjs`, `README.md`, maintained `examples/*/README.md` files and public READMEs outside `examples/runs/**/assembly/**`, the active guides and references under `docs/src/content/docs/`, and active command examples under `specification/`. Existing current `run list`, `run show`, `run output`, and management invocations stay unchanged. Captured assembly evidence is not regenerated.

Extend `scripts/smoke-run-show-facts.test.mjs` into a source guard for supported legacy smoke forms. Add focused assertions for the exact lifecycle argv and quiet output contract: `home busy DIRECTORY --quiet`, exit 0 when busy, exit 1 when idle, and no output in either case. Preserve legacy contract tests in `bot/tests/` and add or retain current-contract tests supplied by 0246, 0253, and 0254. Run focused tests, `sh sdlc/scripts/examples`, the documentation tests when their sources change, `sh sdlc/scripts/lint`, `sh sdlc/scripts/test`, and `make check`. Do not require paid live smoke without separate authorization.

The red state is the source guard, lifecycle argv assertions, provenance hash check, and active-example inventory failing on the retained supported spellings. The green state is the migrated caller tree with those checks passing and the ledger refreshed. Ticket 0217 later deletes only bridge-owned routing, parsing, help, rendering, and tests after an exact caller re-audit; it must preserve shared readers, runtime behavior, authentication, model/configuration behavior, and pruning decisions.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 4
- Minimum level floor: none
- Final level: 2
- Reasons: The change is a bounded in-repository caller migration. Final public command deletion remains outside this ticket.
- Selected model: `gpt-5.6-luna` with high reasoning

Re-score if implementation reaches another repository or deletes a command.

## Review

- Design review: accepted 2026-09-11 at remediation commit `35e65b3990c54350f4d5e4277c8cfddbcd0e978a`. The first remediation commit `e80c8c674db2cd0ac5a9916106d4d814b92ca8b9` was rejected for three findings: the lifecycle probe lacked the exact quiet argv and answer proof, captured example evidence was included in migration scope, and the retired dashboard remained a deletion blocker.
- The original accepted options and tradeoffs remain above. This revision records the public-alpha decision that retired the disabled dashboard for Bot compatibility and addresses all three findings.
- Code review: accepted 2026-09-11 at `a13c663031d74f811e224ff2ce1825e3aa75abdb`. Independent review found and drove repairs for incomplete source coverage, inaccurate documentation, weak exemptions, argv-array calls, stale authentication guidance, bounded example diagnostics, and explicit `--home` handling. The final review accepted the caller inventory, mechanical guard, authentication warning surfaces, example diagnostics, and home-selection boundary.
