# botassembly: three-agent review, combined report

Moved from Ian's notes vault on 2026-09-24. Written 2026-08-22; nothing was rechecked on the move.

Three independent agents on the strong model, each reading the principles document, the specification, the docs, and the implementation code. One audited the principles, one reviewed from the builder's chair (evals, traceability, regression — deployment excluded), one worked out the marketing story. This document merges their findings, organized around the theme that emerged across all three: **ownership** — people own their own agents, no vendor lock-in, everything swappable.

## Headline verdict

The project is unusually honest about itself: most of what an adversarial audit would normally uncover, the project has already written down in its own invariants ledger, falsification ledger, and issue files. The record system is described by the builder-review agent as "the strongest run-record design I have seen at this size." The real findings are places where a stated principle and a specific sentence or line of code disagree — and the thin spot is consistent across both technical reviews: **the provider boundary**. The deterministic machinery is superbly recorded; the non-deterministic core is recorded only as well as the adapter happens to allow. Since evals and drift detection are *about* the non-deterministic core, that is where the highest-value work is.

## Fix first (both technical agents converged here)

1. **A broken failure hook rewrites the stage's true ending** (`bot/src/gating.ts:31-39`). A stage that honestly ended `exhausted` (exit 1) gets rewritten to the hook's `fault`/`timeout` (exit 2) if the failure hook itself dies. Exit codes are the dispatcher's whole contract — transient retries, refusals hold — so this flips what the dispatcher does with the run. Both agents found it independently.
2. **The spec promises one provider retry at a fixed 1,000 ms; the code does two with growing delay** (`credentials.ts:194-195, 249` vs `runtime.md:251-252`). One of them is lying, and this format's whole ethic is that its sentences don't.
3. **`bot worktree` answers confidently wrong for any non-default home** (issue 0061, untriaged — the only open issue with no ticket). A wrong "free" answer can precede destructive cleanup of a live run's working tree.
4. **Prompts are kept but not hashed into the record** (`attempt.ts:94-99`). `system.txt` and `first-turn.txt` have no record event and no SHA-256, unlike the request, outputs, checks, and executables. Edit them after the run and nothing can tell. The one integrity inconsistency in a system sold on "records you can trust later." Cheap to fix: hash them onto `stage_start`.
5. **Retry attempts record `received: []`** (`attempt.ts:121-124`) — every `stage_start` after the first claims the attempt received nothing. A record reader trusting it reads a falsehood.

## Principles audit — remaining findings, condensed

**Direct disagreements between principle and fact:**
- The principles page overclaims conformance: it says any runtime passing the corpus is conforming; `conformance.md:103-108` says the corpus covers only the model-free half, and the model-side half is "claimed by reading the invariants and meaning it." The principles sentence is the wrong one. Deeper: no cross-runtime test exists for the half the record's trustworthiness rests on.
- The record chapter hard-codes one runtime and one vendor into a supposedly program-agnostic spec: required fields `lock_sha256`, `node`, `provider_adapter`; a `provider_transport` event specified for "a Codex call"; `pi-tap.ts:199` special-cases `openai-codex` in the core. A Rust runtime with no Node cannot write the record as written. This is the clearest strain on ownership/agnosticism — the format itself names a vendor.
- Open record-honesty tickets the project already knows about: 0077 (container/retry events carry wrong numbers), 0078 (parent and child records contradict on whether the child existed), 0075 (`bot request` prints without verifying against the recorded hash), 0051 (the changelog claims a quiet period that is false).

**Ambiguity accepted where refusal is promised:**
- Schema validation runs with Ajv strictness off (`schema-check.ts:41`): a typo like `requird` yields a schema that validates everything, silently — a check that never checks, in the middle of paid work.
- A one-character checklist typo (`### Checklist`, wrong case) silently deletes the whole checklist; the format refuses near-miss sentinels by name but not near-miss checklists.
- The markdown dialect the format depends on (checklist items, choose alternatives, comment stripping) is never named, while YAML gets "1.2" and JSON Schema gets "2020-12." Two conforming runtimes can extract different checklists from the same folder.
- The subflow inline limit is measured in characters and lines in a format that is otherwise bytes everywhere; undefined for non-text outputs the spec elsewhere blesses.
- The timeout ceiling is runtime-chosen, so the same assembly is accepted on one machine and refused on another — contradicting "two runtimes resolve identically."

**Hidden state a reader cannot see:**
- The liveness lock has no specified name, format, or stale window — prune's safety hangs on runtime-private state.
- The credential scrub is a hand-maintained list of 45 vendor names with no mechanical check against the pinned provider library. One missed name and every stage's shell sees a live key.
- The caller's whole environment and working tree go into runs unrecorded (PATH, locale, workspace state under `local-context: use`) — the unstated hole in reproducibility.
- Sessions are parsed with a YAML parser that silently skips bad lines — the record gets the principled refuse-don't-shorten treatment, the session gets the sloppy one. Terminal control characters in sessions are not escaped on display (`bot logs` can have its reader's terminal repainted by model-produced text).

**The honesty machinery itself has gone stale:**
- The witness and falsification ledgers cite ticket numbers that no longer resolve, and the renumbering means old citations now point at different subjects.
- Four of six open issue files describe defects whose fixes already landed.
- The docs site invents a refusal that doesn't exist, calls the checklist "a gate" (advertising "constrained" where the design deliberately hoped), and the reference pages demote themselves below spec while the corpus depends on them.

## Builder's-chair review — enablement scorecard

Judged against what practitioners actually worry about:

- **Trust the work was done** — strong. Outputs hashed at pass and re-verified at sealing; gates re-hashed before every execution (a rule that exists because an agent once rewrote its own gate to exit zero); checklist marks need evidence, skips need reasons.
- **Debug a bad run** — strong. Every attempt's output and every check's full text kept in order; sessions keep the send-backs; `bot logs --failed` surfaces losing tool calls.
- **Work-failure vs infrastructure-failure** — excellent and underrated. The cause vocabulary beside a small exit code is exactly what a retry policy needs; `blocked` (gate exit 75, no retry burned) is genuinely thoughtful. Undermined only by bugs 1–2 above.
- **Reproduce a run** — honest halfway by design (the reading is reproducible, the run is not), but the environment/working-tree hole is unstated.
- **Regression testing** — enabled: honest exit codes, `--id-file`, `bot show --json`, versioned inspection output, refuse-unknown-format readers. Gaps: no batch runner, no run-comparison tool, no `--json` for `bot logs`, token totals only as prose.
- **Evaluate a change before rollout** — well set up: a second home differing only in `config.yaml` is an A/B rig in one file; the assembly content hash groups records by variant; `bot check --json` resolves without spending a token.
- **Provider drift detection — the weakest leg.** The principles promise "diff this month's model against last month's," but the record stores only the model name asked for: no provider response ids, no served-model version, no snapshot date. When a provider silently updates what a name points at, nothing in the record changes — you can see the behavioral diff but never attribute it.
- **Cost control — accounting yes, enforcement no.** Per-turn tokens including cache land in the record, but there is no token, turn, or money ceiling at any level. Defensible for attended use; the first thing an unattended operator (the dispatcher, on cron, every minute) will want. Worse: the truncation-continue loop has no cap — a provider stuck on `length` loops at full price until the wall clock.
- **Resume expensive runs** — better than expected: `--continue` verifies donor hash, identical request, and every carried output's bytes.

**Walls for a future eval layer, ranked:** (1) the session is an unversioned provider format with no schema promise — any transcript-level eval parses an undocumented format that can change with a dependency bump; a version line or a spec'd normalized rendering would fix most of it; (2) prompts not hashed (fix #4 above); (3) no provider-side identity per turn; (4) environment/workspace unrecorded; (5) no spend ceiling; (6) annoyances — no `bot logs --json`, sampling parameters neither settable nor recorded, `bot check` accepts a model `bot run` refuses.

## Enhancement opportunities (merged, in the direction of existing principles)

1. Golden-record conformance cases driven by a scripted stand-in provider — moves sealing, holding, causes, and identity from "claimed" to "checked," and makes the principles-page conformance sentence true instead of softened. The single biggest step toward the ownership claim.
2. Hash the prompts into the record; give sessions a version line or a normalized `bot session --json`.
3. Capture provider response identity per turn (response id, served-model string) — unlocks drift attribution.
4. Record the environment variable names (not values) and a workspace note (git HEAD of `$PWD` when it's a repo).
5. A spend ceiling (tokens or turns) for unattended runs; a cap on the truncation-continue loop.
6. Name the markdown dialect; recast the subflow inline threshold in bytes; pin a spec-level timeout ceiling; specify the lock file.
7. Replace the credential denylist with a mechanically derived list that fails the build when the provider library knows a name the scrub doesn't.
8. Warn on near-miss checklists the way near-miss sentinels are refused; run Ajv strict.
9. Housekeeping for "Durable": close the four stale issue files, ticket the worktree defect, fix the stale spec sentences, backfill the changelog, restore or annotate the old ticket numbering the ledgers cite.
10. Extend byte-verification to everything the readers print (`bot request`, sessions).

## Latent principles — followed everywhere, named nowhere

The audit found twelve; the strongest candidates for the principles page:

1. **A promise without a test is treated as a lie in progress.** The witness ledger, the falsification ledger, "a rule with no case is not yet a rule," breaking the runtime on purpose to prove a test bites. The project's strongest actual discipline, and the page never mentions it.
2. **Names come from the filesystem; frontmatter carries only what placement cannot say.** Arguably the format's most distinctive rule.
3. **Stated limits over silent ones.** The system prefers a documented weakness to an implied strength.
4. **Blank is a true answer; an inferred one is not.** "Silence is not a zero," runs through all of inspection.
5. **When a wrong answer is possible, refuse.** Refusing is the safe direction of a wrong answer.
6. **Every error is the reader's next action.** Refusal codes name what to fix; gate reasons are repairs.
7. **Text the agent reads is fixed; text a person reads is free.**
8. **Bytes everywhere, decode nowhere.**
9. **Reading is free; destruction takes a typed word; nothing runs in the background.**
10. **Case is grammar.** Capitalized filenames are types; lowercase names are content; the wrong case is refused, never guessed.

## Marketing: the story

**Ownership is the organizing claim.** People own their own agents: plain files in your git, under an open specification, every vendor decision — model, provider, harness, sandbox, runtime — one swappable edit away. The vendor can't hold your workflow hostage because it was never inside a vendor's product. The two strongest advantages below are both sub-points of it.

**The 60-second pitch:** "It's a runtime for headless, repeated agent work — the kind that needs judgment in the middle and determinism on every side. The workflow is a folder of plain markdown and scripts: the folder order is the control flow, deterministic checks fence every stage, and every run seals a byte-exact record you can grep. No framework, no workflow language, no vendor's model baked in. When the runtime is gone, the folders still say exactly what the work was."

**The five defensible advantages:**
1. The folder is the program — nobody else's answer to "show me the workflow" is `ls`.
2. The format outlives the runtime — a spec with a conformance corpus, not a library; checkable, not aspirational.
3. The agent is fenced, not trusted — the gate ladder is the shape of the thing, not bolted on.
4. The record is the product, not a byproduct — designed to be trusted later; evals get built on top because the data was sealed first.
5. Agnostic all the way down, on purpose — not a sandbox, not an orchestrator; runs inside whatever you already have.

**Audiences:** engineering leaders/CTOs (reviewability, not betting the org on a dying framework — the peer audience and the strongest); ML/platform engineers (context-window discipline, caching, routing, eval-ready records — lead with mechanisms, they will stress-test); regulated-industry teams (proving what happened — speak from GenomOncology experience, never as compliance marketing); indie builders (no lock-in, low ceremony, markdown and shell — the Hacker News audience).

**Blog article pitches (twelve, in suggested order):**
1. *The Workflow Is a Folder* — the flagship; everything a DAG file expresses, placement expresses; demonstrable in one `tree` output.
2. *I Read My Agent's Homework: A Sealed Run, Annotated* — the proof piece; one real run walked through, no argument, just artifacts.
3. *Your Agent Framework Will Die. Your Files Won't.* — the anti-framework essay; framework fatigue is real; the conformance corpus makes it more than a slogan. (This is also the natural home for the ownership/lock-in argument — or a separate flagship, "Own Your Agents.")
4. *What My Agent Is Never Told* — the invariants as a list of surprising decisions: no stage, no repeat number, no retry count, no judge, no format.
5. *One Stage, One Context Window* — the sizing argument; testable performance claim; connects to cost.
6. *The Checklist Manifesto, for Agents* — beloved book, genuinely apt transfer.
7. *A Run Is Evidence* — the record as the answer to "how do you eval?": we sealed the data first.
8. *A Unix Command With a Non-Deterministic Core* — Unix-philosophy pieces travel; this one has receipts.
9. *Wherever a Step Can Be a Script, It Should Be a Script* — quotable engineering rule against the agents-do-everything current.
10. *Not a Sandbox, Not an Orchestrator — On Purpose* — the negative-space position statement.
11. *Buying Judgment by the Stage* — profiles and tiers as economics; real cost numbers from real records.
12. *The Send-Back: What Happens When the Gate Says No* — failure handling, where practitioners know these systems live or die.

**What not to say:** don't claim multiple conforming runtimes exist (say "designed so any runtime can implement it"); don't claim evals as shipped ("the data is ready for it"); don't claim a security boundary; don't say "audit-ready"/"HIPAA" — state the sealed-record facts and let regulated readers conclude; don't dunk on Temporal/LangGraph (different problems — contrast scope and artifact durability, not quality); don't let "same prompt anywhere" slide into reproducibility-of-results; don't call it no-code; no hype register — the material is differentiated enough that flat statement is the strongest voice.
