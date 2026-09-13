# The optimize design (2026-09-05)

Ian asked on 2026-09-05 for a deep dive on optimization to match the one on bench, after an outside review raised questions about both. This note is the answer, revised the same day after the reviewer's second round and two rulings from Ian. It is written the way `archive/notes-2026-09-09/botassembly/bench/eval-format-design-2026-09-05.md` (archived; superseded by the bench repository) is written, as a folder format and a small set of contracts. The same thesis then carries: simple, durable, specified files drive the agent, drive its measurement, and now drive its improvement. It draws on the campaign notes archived at `archive/notes-2026-09-09/botassembly/bench/`, the reconciliation note archived at `archive/notes-2026-09-09/final-snapshot/botassembly/optimization/intelligences-reconciliation.md`, the derisking rungs O1 to O3 in the report `notes/reports/2026-08-25-optimization-derisking.md` and the experiments under `experiments/`, an outside review of the same date, and a survey of the optimizer code on disk. Two research agents read the sources on 2026-09-05 and every claim below names its file. Optimize has no repository. This document is held here because an optimization declares itself inside an assembly, which is this specification's business. It becomes optimize's first specification chapters when optimize gets a home of its own.

## The answer in short

An optimization is a folder inside the assembly, beside the evals, declared with the same `folders` key. It names the flow, the evals that must hold, the intelligence table it is tuned for, what may change, what counts as better, what may not get worse, the budget, the stopping rule, and the proposer. Optimize owns the loop and runs it over files: propose an overlay, compile a variant, let bench measure it, judge it with a gate that is conjunctive and never a single number, and write the candidate down with one of five verdicts. A candidate is a full assembly folder bot can run, identified by its own assembly hash. An overlay is the small folder of changed files that produced it. A rejection is a file that stays in git, marked categorical or conditional, so a bad trade is not proposed again under the same conditions. The proposer is either a tool-less model call that returns a patch as data, or an executable under the same exit-code table as a runner or a checker. The built-in proposers are the introspector Ian asked for and a blind rewriter that exists only to be beaten at equal budget. GEPA is a technique optimize may call, never the owner of the loop. Nothing lands by itself. Optimize writes a change report, and a person who records what they reviewed commits the overlay onto the source.


Vocabulary, 2026-09-05. One word, incumbent, names what a candidate is compared against and measured against for limits. The word anchor is gone. `parent` names lineage only, the variant a candidate was proposed from. Every mechanism in this note is after the bench beta; `archive/notes-2026-09-09/botassembly/bench/beta-tier-2026-09-05.md` (archived) says what the beta is.

## What stands from before

Ian's rulings hold and this note builds on them. The optimizer may touch everything but produces a compilation and never an edit of the source (`archive/notes-2026-09-09/final-snapshot/botassembly/botassembly-playbook.md`, archived, thread 4). The compiled variant is an overlay because scripts and schemas are immutable under optimization (same source). The optimizer is introspective: diagnose from the evidence, then propose one grounded candidate (same source). Evals come first and bench runs long enough to trust before any optimizer work (`archive/notes-2026-09-09/botassembly/bench/rulings-2026-09-05.md`, archived). The haiku calibration is cancelled and a judge is calibrated on the first real assembly's output pairs (`experiments/165-eval-design-campaign/PLAN.md:287-292`). On 2026-09-05 Ian added two rulings, recorded in `archive/notes-2026-09-09/botassembly/bench/rulings-2026-09-05.md` (archived). An optimization is specific to one intelligence table, may reassign a stage's tier, and counts cost as an objective. Optimize owns its loop, and GEPA is a technique it may call.

The measurements hold too. A single-call judge accepted a candidate that had gamed the gate, and majority of six rejected it (`PLAN.md:185-200`). Tier is the big lever and wording the small one, with one intelligence change moving a pass rate from 0.33 to 0.94 where a wording change moved a gate from 0.235 to 0.333 (`PLAN.md:76-84`). The output grid alone would not have detected experiment O2's real fix, and the record did, as a checklist bounce from 13 of 15 to 0 of 10 (`experiments/o2-hand-optimization-baseline/findings.md:17-36`). A loop of ten iterations costs about forty-four bot runs (`experiments/o3-gepa-harness-spike/findings.md:39-46`). GEPA's scalar gate cannot express our accept rule, its budget counts metric calls and never bot runs, and nine of its twelve calls in the dry run were cache hits (`:8-12`, `:28`).

## Prior art on disk

A research agent read the local checkouts on 2026-09-05. GEPA's candidate is a dictionary of named texts, and its adapter returns per-example scores with an optional textual feedback set (`~/foss/gepa/src/gepa/core/adapter.py:12`, `api.py:46`). Its default reflection prompt tells the model to "Identify all niche and domain specific factual information about the task and include it in the instruction" (`strategies/instruction_proposal.py:13-29`). That line invites the model to copy the training answers into the prompt. The skilled-proposer plugin exists to say the opposite: "The specific entities, quantities, dates, and answers in these examples belong to the examples, not the task" (`~/foss/skilled-proposer/src/skilled_proposer/signatures.py:14-42`). GEPA keeps a per-instance Pareto front and lineage, accepts a minibatch candidate on strict improvement of a sum, then scores it on the full validation set (`core/state.py:245-246`, `strategies/acceptance.py:44-53`, `core/engine.py:661-662`). Its budget counts evaluator calls and its test set is scored once per run with nothing to stop a second run (`optimize_anything.py:147-152`). It stores whole texts and never diffs. DSPy's metric returns a score with a feedback string and falls back to "This trajectory got a score of" when there is none (`~/foss/dspy/dspy/teleprompt/gepa/gepa_utils.py:57-59`). SkillOpt edits one skill document with four bounded operations, protects a marked region in code, caps the number of edits per step as a textual learning rate, accepts only on strict improvement of a held-out validation score, shows rejected edits to the next analyst call, and runs its test set once at the end (`~/foss/SkillOpt/skillopt/optimizer/skill.py:152`, `evaluation/gate.py:76-142`, `engine/trainer.py:1408-1422`). pi-autoresearch is the simplest loop, keep or revert with a noise floor that only advises (`~/foss/pi-autoresearch/extensions/pi-autoresearch/index.ts:356-394`).

What this note takes from them. The overlay as a whole-file replacement with frontmatter frozen stays, because a diff is what a person reads and a whole file is what bot runs. SkillOpt's cap on edits per step becomes `max-files`, the number of files one overlay may change, with a default of two. The skilled-proposer's rule against copying answers becomes an instruction inside `reflect` and a copying check on the overlay, eight consecutive words from a develop case's input or expected file. It warns by default and refuses only when the declaration says literal copying is prohibited. The reviewer is right that passing it is no evidence of non-leakage, and the note says so where the check is defined. GEPA's lineage and rejected-proposal archive are the ledger's shape, and GEPA's reflection is one proposer under the contract below, per Ian's ruling. SkillOpt's strict-improvement gate on a sum is narrower than ours, since ours is per case and never a sum, and that stays. None of the three declares a benefit apart from its score, writes a change report, counts holdout reuse, or checks consumers of a shared text, and those are the parts this note adds.

## The optimization folder

```text
<assembly>/
  ASSEMBLY.md                        folders: [evals, optimizations]
  evals/<eval>/                      bench's folders, unchanged
  optimizations/<name>/
    OPTIMIZATION.md                  the declaration; frontmatter is the contract and the body is the why
    rejections/<variant-hash>.md     one remembered rejection, categorical or conditional; small, durable, in git
    accepted/<variant-hash>.md       the change report of an accepted candidate, with the landing record; stays after landing
    proposers/<name>                 optional executables that propose overlays
    README.md                        inert
    .optimize/                       the store; a dot-entry, gitignored
      candidates/<variant-hash>/
        CANDIDATE.md                 lineage, budget spent, verdict, and the gate's answers
        overlay/                     the changed files, mirroring the assembly's paths
        assembly/                    the compiled variant, a full assembly bot runs
        subject.md                   the bench subject that points at the variant
        reports/                     bench's reports for this candidate, copied
      ledger.jsonl                   one line per event, appended, never edited
```

The folder is named for what it holds, the way `evals/` is. The assembly admits it with one more word in its `folders` list, and bot never reads inside. The rejections and the accepted reports are the durable asset, so they sit outside the store and travel with the assembly. Everything else is rebuilt from bench's records and the overlays, so it lives in the store. The rules of the eval folder apply unchanged: frontmatter and body, closed keys, dot-entries outside the identity, executables with a shebang, one hash algorithm.

Placement follows the evals ruling of 2026-09-05 and is the default convention that `optimize init` writes. An optimization may also live beside the assembly or in its own repository, with `assembly:` pointing where it must.

## The declaration

```yaml
---
assembly: ../..
flow: lesson
evals: [lesson, lesson-hard]
scope: [wording, intelligence]     # wording, intelligence, or both; nothing else exists
paths: [flows/lesson/**, skills/**]   # optional narrowing within the scope
bindings: [small, medium, large]   # intelligence names a stage may be moved to; the home maps them
improve: [cases, cost]             # what makes a candidate better; one must show past tolerance
objective: [unnamed-speaker, length-lower]   # check ids the proposer works on; default is every failing check
tolerance: 2                       # samples per case a non-critical check may lose before it counts as degraded
limits:                            # ceilings against the incumbent, as ratios, with absolutes beside them
  tokens: { ratio: 1.1, max: 200000 }
  retries: { ratio: 1.0 }
  wall: { ratio: 1.25, max: 900 }
prices:                            # per million tokens, by resolved model; without it, cost is unevaluated
  gpt-5.6-luna: { input: 1.25, output: 10.00, cache: 0.125 }
budget: { runs: 60, tokens: 5000000, wall: 4h }
stop: { rejections: 5 }
assess-uses: 3
max-files: 2
copying: warn                      # warn or refuse on eight consecutive words from a develop case
proposer: reflect                  # reflect, blind, gepa, or a path under proposers/
proposer-intelligence: smart
---
The lesson flow names the speaker wrongly in one case of five and runs long. This optimization may reword the writing stage and the two skills it reads, and it may move any stage between small, medium, and large. The eval marks the speaker attribution as critical, and this optimization may not trade it away. It may not add retries to buy quality.
```

`scope` is the mutation boundary and it is closed. `wording` means the bodies of stage files, checklists, and skill text, with frontmatter byte for byte unchanged. Experiment O1 already enforced that rule (`experiments/o1-overlay-mechanics/README.md:20`). `intelligence` means the `intelligence` key of a stage may change to another name in `bindings`, and the frontmatter is otherwise unchanged. Scripts, schemas, gates, hooks, `FLOW.md`, `ASSEMBLY.md`, slots, and the shape of the flow are never in scope. A proposer that writes outside the scope is refused `overlay-out-of-scope` and the candidate is never compiled. The outside review would open scripts and flow structure to the optimizer as declared variables. Ian's ruling keeps them closed, and this note keeps his line. Opening it later is one more word in `scope`, and it is his to open.

`bindings` is Ian's ruling of 2026-09-05 as a key. The assembly names tiers, the home maps each tier to a provider, a model, and a reasoning level, and an optimization is tuned against one such table. The table's digest is recorded on every run and every candidate, and a candidate measured under one table is stale under another, never silently carried over. A stage may be moved only among the names listed, so an optimization cannot reach a binding nobody approved. A binding change is confirmed on the full select set like any other change, and the eval's own coverage decides whether tool use, structured output, and refusals are represented. The reviewer's warning stands and is printed in the report: a resource ratio says nothing about a class of task the eval does not hold. Bench records the model each turn resolved to, from bot's record, beside the symbolic name. Judge bindings are pinned in the eval's calibration records and are never in scope, so the instrument does not move while the subject does.

`improve` declares the benefit, and it is separate from the constraints. Without it a candidate can only be admissible. `cases` means at least one select case where the candidate passed more samples than the incumbent by more than `tolerance`. `check:<id>` narrows that to one check. `tokens`, `wall`, and `retries` mean the sum across select cases fell by more than the same fraction as the tolerance's share of the floor, against the incumbent. `cost` means the same for money, and it needs `prices`. The reviewer asked what observation makes a candidate better rather than merely still acceptable, and this key is the answer, written down before the search starts.

`tolerance` is the decision boundary for non-critical checks, in samples per case. The reviewer's counterexample stands: two subjects at the same true rate, eight samples each, and strict per-case dominance rejects the unchanged one almost every time across twenty cases. So per-case counts are never treated as exact. A non-critical check counts as degraded only when the candidate loses more than `tolerance` samples on a case, as improved only when it gains more, and as inconclusive in between. Critical checks have no tolerance. The default of two at a floor of eight is a screening rule and not a guarantee, and the A/A proof in the plan measures how often it calls an unchanged subject degraded. Ian sets it per optimization.

`limits` are the ceilings, and they are the O2 experiment's lesson. Each ratio is against the incumbent as measured when the optimization started, and never against the immediate parent, so twenty accepted successors cannot each spend five percent more. An absolute `max` may sit beside each ratio and must when the incumbent's value is zero. Unknown is not zero: a run whose record cannot report a fact leaves that limit unevaluated, and an unevaluated limit fails the gate. Failed attempts and retries count, because bot's record sums every turn. Tokens are compared only within one binding. Across bindings the comparison is cost, and cost exists only when `prices` names every model the runs resolved to, per token category. Without prices, a cross-binding candidate is admissible on quality and its cost is printed as unevaluated.

`evals` names every eval that must hold. When `paths` reaches a root `skills/` folder, every flow in the assembly can see that skill, so `evals` must name one eval per flow in `flows/` or the declaration is refused `consumer-unevaluated`. A skill under one stage's own `skills/` folder needs only that flow's eval.

`budget` counts bench runs first, because a bench run is a bot run and that is what costs, with tokens and wall time as the other two ceilings. `stop` ends the search after that many consecutive rejections, and the search also ends when the budget is spent or when every objective check passes on every select case.

## The loop

1. **The incumbent.** Optimize points bench at the incumbent assembly for every named eval. Bench reuses grades whose assembly hash, case content digest, grading digest, and bindings digest already match, and tops up samples to the floor. The incumbent's grid and record facts are the baseline for the whole search.
2. **Propose.** The proposer receives the develop-role evidence only: each failing case's input, output, expected file, the checks' notes, the labels, the failure modes, the mutable files, and the rejection memory with its conditions. It writes one overlay. The introspector reads the evidence, diagnoses, and proposes one grounded change. That is Ian's rule against spaghetti.
3. **Compile.** Optimize copies the incumbent without its declared folders, lays the overlay over it, and hashes the result. The variant's assembly hash is its identity, exactly as experiment O1 found (`experiments/o1-overlay-mechanics/findings.md:11-14`). `CANDIDATE.md` records the incumbent hash and the bindings digest it was made against, and a mismatch marks the candidate stale rather than silently rebasing it (`intelligences-reconciliation.md:42`). A candidate whose variant hash appears in `rejections/` with a categorical rejection, or with a conditional one whose conditions still hold, is refused `already-rejected` before any run. An overlay that changes more than `max-files` files is refused `overlay-too-wide`. An overlay carrying eight consecutive words from a develop case's input or expected file is warned `copying`, and refused when the declaration says `copying: refuse`. None of these refusals costs budget.
4. **Screen.** Bench runs the develop cases once on the variant. If no objective check improved on any case, the candidate is rejected `no-gain` and the budget spent on it was one pass. This is search-time feedback, and it never promotes anything.
5. **Gate.** Bench runs the select cases with a predeclared total of samples per case, at least the floor, interleaved with the incumbent's own top-up so the afternoon's provider touches both. Every attempt is kept and none is rerun because it was unfavorable. The gate is conjunctive. Every critical check passes on every select case and no case flips. No non-critical check is degraded past tolerance on any case. Every limit holds against the incumbent, with unknown facts failing rather than passing. The pairwise judge, where the eval carries a calibrated one, finds no loss on the select pairs by majority of k, order-balanced, with the eval's tie rule. Then the benefit: at least one entry of `improve` shows past tolerance. A candidate that clears the constraints and shows no benefit is a `tie`, and it is not a win.
6. **Verdict.** One of five words. `releasable`: constraints hold and a declared benefit shows. `incumbent-only`: constraints fail only where the incumbent fails too, the benefit shows, and the candidate may seed further search without being landed. `tie`: constraints hold and no benefit shows. `inconclusive`: every difference lies within tolerance, or a limit is unevaluated. `rejected`: a constraint failed, with the case and check named. Two flags ride beside the word. `unjudged` when no calibrated pairwise judge exists, and `stale` when the incumbent or bindings moved.
7. **Record.** `CANDIDATE.md` and a ledger line are written for every candidate. A rejection also writes `rejections/<variant-hash>.md`. A scope, width, or copying refusal is `kind: categorical` and stands forever. A gate rejection is `kind: conditional` and carries `parent`, `bindings`, `eval`, `grading`, and `limits` digests. The proposer sees conditional rejections with their conditions, and one whose conditions no longer hold is history and not a bar.
8. **Repeat** until the stopping rule.
9. **Assess.** The search is over. The best `releasable` candidate is frozen, and bench runs the assess cases once against it and the incumbent, with a predeclared number of samples per case that is at least the floor. That is one assessment event rather than one stochastic attempt. Bench logs it. Any critical failure or flip rejects the candidate `assess-failed`. Per-case assess verdicts are stored and printed, and no search reads them, because no search is running. A new search in the same optimization counts the assess set as consulted once more, and when the count reaches `assess-uses`, optimize refuses to consult it again, `assess-exhausted`, and says a matched replacement set is due, new cases of the same shape and difficulty. The awesome-evals corpus prescribes the same remedy for a worn holdout (`~/foss/awesome-evals/PATTERNS.md:788`). The count is a consultation limit and never a validity guarantee, and the report says so in those words.
10. **Report and land.** The change report is written. `optimize apply <variant-hash>` verifies that the source tree's assembly hash still equals the candidate's incumbent and that the home's bindings digest still matches, refuses `incumbent-mismatch` otherwise, copies the overlay onto the source, and writes the landing record into `accepted/<variant-hash>.md`: who landed it, when, and what they reviewed, in their words. A hand-edited or rebased patch is a new candidate. A person commits.

Optimize never selects the best of several samples. A candidate is measured the way the subject will run.

## The proposer contract

`reflect`, `blind`, and `gepa` are built in and are tool-less model calls. Optimize hands the model the develop evidence and the mutable files as text, and the model returns a patch as data. Optimize validates and applies it. The proposer has no filesystem. That is the reviewer's cheapest strong isolation, and it is the default because the introspector never needed a shell. `reflect` is the introspector: one strong model reads the evidence and the mutable files, writes a diagnosis, and proposes one edit, with the skilled-proposer guards this folder already chose to borrow, the anti-overfitting instruction, the length ladder, and the per-model guidance (`dspy-refresh-2026-08.md:68-74`). `blind` exists to be beaten. It rewrites the same mutable files with the same model and no failure evidence. `gepa` runs GEPA's reflective mutation with our evidence as its feedback set and our overlay as its candidate, under our budget and our gate, per Ian's ruling that the technique is welcome and the loop is ours.

A path under `proposers/` names an executable, and that is trusted-author mode. It follows the one exit-code table. Exit 0 means it wrote an overlay. Exit 1 means it declined to propose and said why on stdout. The ledger keeps that reason. Exit 2 means it broke. That is a harness error and costs no budget. It receives `OPTIMIZE_BASE`, `OPTIMIZE_SCOPE`, `OPTIMIZE_PATHS`, `OPTIMIZE_BINDINGS`, `OPTIMIZE_EVIDENCE`, a folder holding the develop cases' outputs, notes, labels, and failure modes as files, `OPTIMIZE_REJECTIONS`, `OPTIMIZE_OVERLAY`, the empty folder it must fill, `OPTIMIZE_INTELLIGENCE`, and `OPTIMIZE_<KEY>` for its own frontmatter scalars. It is a process on the author's machine with the author's permissions, and the report prints the reviewer's sentence for it: only develop evidence is intentionally supplied, and filesystem isolation is not enforced. When that is not enough, the lever is a dedicated unprivileged account with deny-by-default access to the eval folders, and that is later.

A claim that optimize improved an assembly counts only when the ledger shows `reflect` or `gepa` beating `blind` on the same declaration at the same budget, measured as releasable candidates per bench run. That is experiment O4 stated as a standing rule.

## Identity, staleness, and lineage

A candidate is its variant's assembly hash. An overlay is identified by the digest of its files, and the same overlay over a different incumbent is a different candidate. `CANDIDATE.md` carries `parent`, the variant hash it was proposed from, `incumbent`, the incumbent assembly hash, `bindings`, the intelligences digest, `overlay`, `proposer`, `evidence`, the case ids and grade digests the proposer saw, `budget-spent`, `verdict`, and `flags`. The ledger holds the same facts as one line per event, so the whole search can be replayed as a story and audited for luck. A stale candidate is one whose incumbent hash or bindings digest no longer matches the assembly and home it would land on. It is reported, excluded from claims, and never rebased by itself. Rebasing is a new candidate with a new parent.

## The store and the ledger

`.optimize/` is gitignored by `optimize init` and relocatable with `--store DIR`. Candidates and the ledger live there. Bench's own stores stay inside each eval, and optimize keeps copies of the reports it acted on, so a candidate folder explains itself without the eval's store. A rejection and an accepted change report are the two things worth keeping in git, and they are small. The rejection memory is durable for one reason. The next search, on the next day, on another machine, must not propose the same trade under the same conditions.

## The change report

`accepted/<variant-hash>.md` is what a person reads before landing. Its frontmatter is the candidate's identity, its verdict and flags, and after landing the landing record. Its body says what changed, file by file, in prose a domain expert can follow. Which benefit showed, as the `improve` entry and the cases or the sums behind it. Where it regressed. For a releasable candidate that is nothing past tolerance on select and assess, and any inconclusive case is still listed as inconclusive. What it cost to find, as bench runs, tokens, and wall time across the whole search including the losers. What the assess event said and how many times the set has now been consulted. Whether the pairwise judgment was made. When it was not, the report says in three sentences what the reviewer asked for: deterministic constraints passed, the declared benefit was observed, qualitative quality remains unjudged. It never says quality did not regress. The report is the proposal. A person lands it and records what they reviewed, and a general approval never stands in for an absent quality check.

## Measurements

Every fact used in a decision has a unit, a direction, a denominator, a missing-value rule, and a comparison rule. Bench's design carries the table for the facts it produces. Optimize adds: `cost`, in the price table's currency per million tokens times the resolved model's token counts by category, lower is better, summed over select cases, unevaluated when any resolved model lacks a price; the pairwise vote, a count of k order-balanced verdicts per pair, with the tie rule from the eval; and the benefit fraction for sums, the tolerance divided by the floor. An exit code says the verdict. This table says what the verdict meant.

## How this carries the principles

The eval principles in `archive/notes-2026-09-09/botassembly/bench/eval-principles-2026-09-05.md` (archived; carried into the bench repository) apply one for one, and the one that matters most here is the eighth. The measurement is not the subject's to change. The eval sits in a declared folder the assembly hash excludes, the compiled variant carries no declared folder at all, optimize refuses to write under one, the grading digest names the ruler, and the assess set is consulted once per search and counted. The folder is the optimization, and its rejections and reports are prose. Records are the truth and the change report is derived. Nothing is written into a run or an eval, and bench learns nothing of optimize. The ledger never claims more than what happened. A harness error costs no budget, an unknown fact fails a limit rather than passing it, a tie is a tie, and an unjudged acceptance says so. Everything measured is hashed, and a stale candidate says so. The built-in proposers have no filesystem, the executable ones say that isolation is not enforced, and the model sits only in the seat that needs judgment.

## Fix passes against the outside review

The first round adopted the closed scope with a refusal for writing outside it, the shared-text consumer rule, record-fact limits, required budget and stopping rule, the screen as search-time feedback that never promotes, the ledger with lineage and exact diffs, the blind baseline and the equal-budget rule, and the change report as a proposal that a separate act lands. It declined opening scripts and flow structure, a plug-in search framework larger than the proposer contract, optimizing the grader, and a separate benchmarking system.

The second round, the reviewer's reply to ours, changed more, and each change is one key, one rule, or one word:

- `improve`, the declared benefit, and the five verdicts. Passing the gate never silently becomes improving the agent.
- `tolerance`, and per-case states that treat counts as samples rather than as exact performance, with the A/A proof to measure the false-degradation rate.
- The assess event at the end of the search rather than after each acceptance, with predeclared repeats, per-case verdicts stored and never read by a running search, and the wording "consultation limit, never a validity guarantee".
- Exposure that follows the case's content digest, so a metadata edit, a new id, or a copied case does not reset it. Bench owns that digest.
- Limits against the incumbent with absolute ceilings beside them, unknown as unevaluated rather than zero, retries counted, and cost only with a price table.
- Judge bindings pinned and never in scope.
- Categorical and conditional rejections, so a noisy result is not an eternal fact about an edit.
- Tool-less built-in proposers, and the honest sentence on executable ones.
- The copying check as a warning by default, with normalized duplicate detection and family grouping moved to bench where the split boundary lives.
- Landing that verifies the incumbent and the bindings, and records who reviewed what.
- The compiled variant built without declared folders, so hash-excluded material is not in the candidate's tree. The reviewer's point that this is not an access boundary stands and is printed.

Declined or narrowed in the second round:

- Sequential sampling designs. A predeclared fixed total with every attempt kept is the beta's rule, and the reviewer said the same.
- A general trade-off policy beyond `improve` and `limits`. Declaring a benefit in quality with a token ceiling above one is the trade-off, written down, and nothing more is needed yet.
- An unprivileged account for executable proposers and for the evaluated agent in the beta. It is named as the lever and not built.

## Decisions for Ian

Both decisions this note first carried were ruled on 2026-09-05 and are recorded in `archive/notes-2026-09-09/botassembly/bench/rulings-2026-09-05.md` (archived). Optimize owns its loop and GEPA is a technique it may call. The `intelligence` scope exists, an optimization is specific to one bindings table, and cost is a declared benefit. Nothing here waits on him.

## Decisions taken here

Ian can overturn any of these.

- The folder is `optimizations/`, named for what it holds, declared with the same `folders` key as `evals/`, and placed inside the assembly by the same ruling. Renaming it is one word.
- An optimization names its evals, and bench is invoked with `--subject FILE` so optimize never writes into an eval.
- The budget counts bench runs first, with tokens and wall as ceilings.
- Rejections and accepted change reports live in git. Candidates and the ledger live in the store.
- A candidate's identity is its variant's assembly hash, and an overlay over a different incumbent is a different candidate.
- An acceptance without a calibrated pairwise judge is allowed, flagged `unjudged`, and never lands without a person who records what they reviewed.
- `blind` ships as a built-in proposer, and the equal-budget rule is a standing rule of the report rather than a one-time experiment.
- Landing is `optimize apply` and a human commit now, and an automation draft ticket later, mirroring bench's decision on who runs the batch.
- The `limits` ratios default to 1.1 for tokens, 1.0 for retries, and 1.25 for wall time, from experiment O2's observed swings, against the incumbent. Each is one line to change.
- `tolerance` defaults to two samples at a floor of eight, `max-files` to two, and `assess-uses` to three. Each is one line to change, and the A/A proof calibrates the first.
- `copying` defaults to `warn`. The eight-word span is a copying heuristic and is described as one.
- The assess event runs once per search, at the end, on the frozen best candidate. A search that continues after it is a new search.
