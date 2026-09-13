# Post-contraction strategy

Decided 2026-09-09. Ian asked for an Astra extra-high oracle review, a complete ticket set, and a strategy for the next Bot work. Astra reviewed the clean `c70cf08a` checkout, the specification, runtime, tests, ideal state, open issues, drafts, and planning records. It ran 44 focused tests under Node 22.22.3. All passed. Those passes do not explain intermittent full-suite failures.

## Decision

File bounded drafts. Repair unreliable proofs before relying on more complete-check results. Then update hosted action pins, correct the published contract, prove model choice at each real invocation path, add the one missing noun command with a current operational caller, and migrate that caller.

The 2026-09-09 execution review split work at two independent proof boundaries. Draft 0226 now covers the read-only runtime workflow and draft 0229 covers the privileged documentation workflow. Draft 0228 now builds `bot run show` and draft 0230 migrates its smoke callers. The manual workstream selects one source draft at a time and gives the implementation its own manual number. Design review records the final complexity score before model assignment.

## Options weighed

1. File every ideal-state gap and every missing noun command now. This would make the roadmap look complete. It would also turn tests, examples, and future ideas into invented demand. Rejected.
2. File only the repeated test timeout and wait for every other issue to recur. This would minimize current work. It would leave deterministic shared-output risk, published contradictions, mutable privileged workflow tags, and known proof gaps without owners. Rejected.
3. File the seven bounded drafts and keep speculative work behind evidence triggers. Selected. The cost is visible unfinished work and a longer-lived legacy command bridge.

## Why this order

Drafts 0222, 0223, and 0224 fix proof mechanisms that can hang, race, or clean up another invocation's state. Later results become easier to trust after those repairs. Drafts 0226 and 0229 update the read-only and privileged workflows separately. They land before 0225 sends corrected publication through the documentation workflow. Draft 0227 proves that model configuration reaches every place that spends a model call. Draft 0228 builds the one missing reader. Draft 0230 migrates the caller after the contract stands on its own.

## Commands not filed

The audit did not justify `bot assembly check`, `bot run session`, `bot run tools`, `bot home status`, or `bot home prune` as new noun commands. Current tests exercise their old interfaces. The smoke guide prescribes some of them. Neither fact proves current operational demand. A bounded caller audit can release one without asking Ian when executable use or recorded operator use appears.

## Held work

- 0136 stays held. One open websocket beside a stall does not prove the websocket caused the stall. Completed-operation evidence and independently identified stalls must support any liveness rule.
- 0208 stays held until a supported one-run reader has a caller. Its later design must separate the one-based attempt ordinal, additional attempts, actual send-backs, provider retries, blockers, exhaustion, machinery failure, and incomplete work.
- 0217 stays held until every retained current caller has migrated or been retired. Archived dispatcher and lifecycle callers do not justify replacement commands. The old dashboard checkout and Bot's own lifecycle scripts still need a current disposition.
- 0220 stays held until the project accepts a narrower storage guarantee set and identifies a concrete simplification worth its risk. The current home specification already names detailed guarantees.

## Other decisions made

- Remove the tracked dangling `docs/CLAUDE.md` symlink. The target was absent when the link was introduced. Workspace instructions still apply through the repository root. Git retains the link if that conclusion changes. The accepted cost is one fewer nested instruction marker.
- Give the subflow cleanup observation a one-month window. Close it on 2026-10-08 if it does not recur. Promote it earlier if a cause or another occurrence appears. The accepted cost is retaining a low-confidence issue for a bounded period.
- Keep the Pages build intact and leave deployment disabled. Enabling a public site is outward-facing and remains Ian's decision. The accepted cost is a green build followed by a known deployment failure when that job runs.
- Preserve the old CLI ledger as measured history and add a current re-audit. Do not treat archived dispatcher or lifecycle source as live demand. Do not inspect the dirty replacement working tree as evidence.

Ian can overturn the order, the one-month observation window, and the choice to leave the five candidate commands unfiled with a small planning edit. Publishing the Pages site still needs his explicit choice.

## Preliminary model routing

The design author will score each ticket with the shared five-factor rubric. Current facts suggest Sol Medium for 0222, 0223, 0224, 0227, and 0228 because they cross concurrency, process, durable-record, public-contract, or shared-state boundaries. Draft 0229 has a level-4 floor because it changes a privileged workflow. Current facts suggest Luna High for 0226, 0225, and 0230. Sol Medium still designs and reviews every implementation. The design score can change these assignments before code work begins.

## Risks retained

- Clone-install and subflow cleanup failures remain intermittent and unexplained.
- Provider-stall causation remains unknown. No safe timeout threshold exists.
- GitHub Pages remains disabled and the public site returns 404.
- The legacy CLI remains until real callers migrate or retire.
- The Pi adapter stays pinned until a replacement proves equivalent retry and streaming behavior.
- External find-cache cleanup still lacks an observed operator boundary.
- No unfamiliar author has completed the guide, no delegation comparison exists, and no second conforming runtime exists.
- A replacement workflow runner and a later web client can reveal new caller needs. Their future needs can change the command order.
