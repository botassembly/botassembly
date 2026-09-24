# Jev and botassembly

Moved from `notes/jev/botassembly.md` on 2026-09-24. Paths starting `notes/` are in the workspace vault.

Working notes on Ian's three thoughts from 2026-09-18: Jev-based tools, Jev decisions inside botassembly, and Jev as the judge in evals. Sources are the botassembly and bench specifications, the captures once in `notes/jev/inputs/` (archived 2026-09-24 to `~/workspace/archive/notes-jev-2026-09-24/notes/jev/inputs/`), and a web survey on the same day. Measured numbers live in a private experiment repository.

## What Jev is good at and bad at

- Good: it picks a label from a fixed list when you define the list and the evidence sits in the input. It answers yes/no questions about evidence visible in the input. (`~/workspace/archive/notes-jev-2026-09-24/notes/jev/inputs/Post by @drewdil on X.md`, `~/workspace/archive/notes-jev-2026-09-24/notes/jev/inputs/Six things I tried with Jev.md`, experiments 002, 003, 006)
- Bad: it judges quality against a rubric poorly. It misses contradictions. It fails at code review, arithmetic, dates, counting, and several judgments packed into one question.
- Bad: one question that asks "is this complete?". Experiment 004 found that question separates weakly. One presence question per required item did better.
- Confident answers repeat run to run. Low-confidence answers flip. Wrong answers usually carry low confidence. Option order and an added irrelevant option both move the odds.

The rule that follows: never ask Jev "is this stage done?". Ask one yes/no question per fact that must be true. Code combines the answers. This is Ian's decision matrix.

## Decisions a run makes today

| Decision | Who decides today | Best owner | Note |
| --- | --- | --- | --- |
| Is the output well formed? | `schema.json` or `schema.md` | Code | |
| Did the required commands pass? | A gate script | Code | |
| Did the agent do each checklist item? | The agent marks each item with evidence text. Nothing checks the evidence | The agent. This is self-grading by design | The marks are one source of receipts |
| Did the stage meet its goals? | Nothing. No stage declares success criteria | Jev over a manifest with receipts | Ian's model below |
| Does the output answer the request? | Nothing | Jev | |
| Is the output good? | Nothing. This is ideal-state gap 9 | An agent or a person | Jev fails here |
| Which branch runs? (`CHOOSE.md`) | An agent with the `select` tool. The spec says there is no other chooser | Jev fits the shape | Ian reopened this on 2026-09-18 |
| Loop again or stop? (`LOOP.md`) | The loop's last stage, an agent | Jev fits when the stop condition is a list of visible facts | Reopened with it |
| Which model tier? | Static, six rungs. The extension study rejects input-based routing because `bot check` could no longer verify it | Leave it | A CHOOSE between two branches with different `intelligence` stays inside the grammar |
| May this tool call run? | Nothing. The extension study ranks a `tools` gate first | Jev | LangChain's AutoMode middleware does this |
| Can a script settle this stage? | Idea only, `notes/ideas/deterministic-stage-settlement.md` | Jev for classify-shaped stages | Low confidence maps to "declined" |
| Which finished runs need a person's eyes? | Nothing | Jev over the record | Flath's trace triage |
| Did a change help? | Bench, by design | See Evals below | |

## Ian's model, ruled 2026-09-18

- A checklist and success criteria are different things. A checklist reminds the agent, and the agent grades itself. Success criteria define done for a stage, and something outside the agent decides whether they are met. Not every stage needs them.
- Three parts. The stage declares success criteria. The agent hands over a manifest with receipts: what it did and the results. A decider reads the criteria, the manifest, and possibly script output, and says whether the stage met its goals.
- The same decider can answer a loop and a choose. Ian reopened "no other chooser". His reason: a decision needs context. The agent that just finished holds the context and grades itself. A fresh agent has to load the context again. A manifest boils the context down for a small outside decider.
- Recorded as `repos/botassembly/sdlc/issues/2026-09-18-no-outside-decider-for-done-loop-or-choose.md`.
- Ian does not want Jev forced on anyone. The design has to work with Jev or without it, and it has to match the grammar: capitalized Markdown files declare, lowercase programs act. The design study is `repos/botassembly/sdlc/planning/decider-study.md`. Its proposal is one lowercase program named `decide` in a `CHOOSE` or `LOOP` folder. The sentinel already declares the question and the alternatives. Only the answerer changes: the agent, a field of the previous stage's output, or a program such as a Jev script.

An earlier draft of this note called the checklist marks "the manifest Ian described". That was wrong. The marks are self-grading about process. Experiment b01 showed it: half of the design stage's checklist covers work that never reaches the output. The marks are one source of receipts and nothing more.

Three thoughts to add to the model:

- b01's main finding supports the manifest. A decider judges only what it is shown. The manifest is how a stage shows its work.
- Receipts differ in trust. The agent's claims are a self-report, and a decider that reads only claims can be talked into a pass. The runtime's own account (commands run, exit codes, check results) and the output of a script the gate runs are not self-reports. The decider should get all three under separate labels. Experiment b07 measures what each adds.
- `criteria.md` is a name and a format this session made up for the experiment tool. Nothing in botassembly is called that. It copies the shape of `## Checklist`. Where success criteria live in a real stage is open. A `## Success criteria` heading in `STAGE.md` beside `## Checklist` keeps the definition of done next to the instructions.

## Ways to weave Jev in

Ordered from least change to most.

1. **A success-criteria gate today. No runtime change.** A gate is already any executable. The gate is a two-line script that runs the verdict tool on a criteria file beside it: one plain sentence per fact that defines done, thresholds and a pinned model version in frontmatter. The stage instructions tell the agent to leave its manifest where the gate can read it. Exit 0 passes. Exit 1 fails and the failed sentences go back to the agent. Exit 75 reports Jev unreachable, the spec's external blocker. The record keeps a gate's printed text, so every probability lands in `record.jsonl`.
2. **Success criteria, manifest, and decider as first-class parts of a stage.** The runtime knows a stage has success criteria, collects the manifest, hands the decider the runtime's own receipts, and records the verdict in its own event. The decider stays a program with the shape of a gate, because ADR 0001 routes provider calls through Pi and the runtime is public.
3. **A program decider for `CHOOSE.md` and a loop's tail.** The program picks among the alternatives the file already lists, so `bot check` still knows the graph. The agent is asked only when the program declines. Descend fits less well. How an input divides is writing. Only the yes/no of whether to split is a decider's question. Experiment b03 measures how well Jev reproduces recorded picks and how much context it needs.
4. **Classifier settlement.** The settlement idea lets a script try a stage first and decline. A Jev script settles classify-shaped stages, such as `01-classify` in the triage example, and declines on low confidence.
5. **A tool-call gate.** The extension study wants a `tools` gate with the same shape as `gate`. When it exists, a Jev script that sorts each call into a risk class fits with no further change.
6. **Bot calls Jev itself.** This contradicts ADR 0001 and puts a hosted service inside a public runtime. Not recommended.

## What keeps it understandable

- The questions are plain sentences in a Markdown file. A domain expert reads them without the runtime.
- The file pins the model version and the thresholds. A reader of the record sees why a stage passed.
- The verdict has three states: pass, fail, undecided. The undecided band holds the answers that flip. The file says how undecided counts.
- A question earns the right to block. It starts as `(advise)`, recorded and never blocking. It blocks after a measured false-reject rate on known-good outputs.
- Stacked questions multiply. Five questions that each wrongly reject 3% of good work send back 14% of good work. Ian's deck says three steps at 90% yield 73% and gates restore the number. A noisy gate takes some of it back.
- A wrong pass costs more than no gate, because the record then says the work was checked.

## Tools

Two shapes cover the tools worth building.

- **Verdict shape.** A state and a questions file go in. A verdict and an exit code come out. The criteria gate, a bench checker, a pi-subagents gate, a commit hook, and a run triage all wrap the same command.
- **Edit shape.** Code tags the units. Jev answers a typed question per unit or per pair. Code applies the edit. Jev never writes text, so every output character traces to the input. TypeSafe's `docs/cookbooks/autoformat.md` is this shape: one yes/no per adjacent line pair to merge broken lines, one Choice per block for its kind, and code renders the Markdown.

Candidates, best fit first:

1. The criteria gate above. It is the shared primitive.
2. A prose lint for Ian's writing rules (cleft sentences, contrastive appositives, dash glosses, trailing clauses). Each rule is a yes/no per sentence. Every's test caught 6 of 7 planted writing defects. This turns a remembered rule into a check.
3. The vault inbox sweep. Each root file gets one label from todo, idea, clipping, social, junk. The list is fixed and the evidence is in the file. A Sonnet agent does this by hand today. See `notes/ideas/inbox-sweep-flow.md`.
4. A Markdown structure fixer for dictation and pasted clippings, built from the autoformat cookbook.
5. A dictionary scan with a Jev filter for named entities, from `~/workspace/archive/notes-jev-2026-09-24/notes/jev/inputs/Jev and aho corasick.md`.

Existing work to read before building: `jev-cli` (claims against evidence, best match, ad-hoc questions), `jevwire` (MCP server and an escalate-only Claude Code plugin), and pi-subagents v0.69.0, whose typed gates take a command that prints a JSON verdict. No tool built from the autoformat cookbook turned up.

## Jev and JSON

Jev cannot write a JSON document. It returns only a picked option, a score, or a yes/no, each with a probability. json-render v0.21.0 (`~/foss/json-render`, commit 535f414) shows how to get JSON anyway.

- The developer writes every candidate element in advance, with its type, its props, and all its text. The code comment says it: "Prop values are platform content, never model-invented strings or code."
- Jev answers Choice questions whose options are the candidate ids and their descriptions: which candidates go in, under which parent, in what order. Follow-up edits are one Choice at a time: add, replace, remove, move, or finish.
- Code assembles the chosen pieces into the spec and validates it. Labels that must come from the user are copied word for word out of the prompt by code.
- Stated limits: 14 elements and nesting depth 4 in the playground, 255 options per Choice, no new prop values, no free text. The project's own README warns that root selection, grouping, and knowing when to stop need planning, a Jev weakness. Nothing detects required content that was left out.

The general rule: Jev decides structure and selection over a menu someone else wrote. Every string in the result comes from code, a template, the input text, or a writing model. "Probably", the toy language in `~/workspace/archive/notes-jev-2026-09-24/notes/jev/inputs/Post by @southpolesteve on X.md`, draws the same line: Jev decides, a language model writes, and a program ties them together. For botassembly this means Jev can fill an output whose schema is all enums, booleans, and picks from a list. It cannot fill a free-text field.

## Evals

- Bench checkers are executables that print JSON with a score. A Jev checker needs no change to the bench design. The verdict tool with `--json` is most of one.
- The eval format in `Test plugins with evals.md` writes each grader as PASS and FAIL conditions in Markdown. Each condition is one yes/no question.
- Bench's planned model judge is pairwise and comparative, and it waits on a calibration set. The set on hand is 14 pairs plus 4 held out (`experiments/164-smevals-inversion`, `experiments/165-eval-design-campaign`). The campaign report calls that size a blocker.
- A pairwise preference is a quality judgment, the shape where drewdil measured Jev failing. Expect Jev to serve as a battery of condition checks that abstains on low confidence. A large model judges the remainder. The numbers to report are coverage, agreement on the covered share, and cost.
- `jevals` (theyashwanthsai) is the one public project found. It is a research preview. It matched a hand-written key on 30 of 30 clear cases. No adapters turned up for Inspect, promptfoo, Braintrust, LangSmith, OpenEvals, DeepEval, or verifiers.
- The critic to keep in view: TypeSafe publishes no calibration curves or Brier scores. An outside probe measured 0.031 calibration error on one sample. Bench should measure calibration per eval and never assume it.

## Experiments

Register and results: a private experiment repository, branch `botassembly-track`, file `sdlc/planning/botassembly-track.md`. b01 used public-repo material only. Ian lifted that limit on 2026-09-18: no private data is on this machine, and anything here may go to TypeSafe.

| Id | Question | State |
| --- | --- | --- |
| b01 | On real accepted stage outputs, how often does a criteria gate wrongly reject good work, and how often does it catch a mismatched request? | Ran 2026-09-18 for $0.08 on 120 accepted pairs from public-repo runs. See below |
| b02 | Does Jev agree with the human labels on the 18 bench calibration pairs, asked pairwise and asked as condition checks? | Proposed |
| b03 | Does Jev reproduce recorded choose and loop decisions, and how much context does it need? | Ran 2026-09-18. No choose, loop, subflow, or fan-out event exists in 2,039 records. The stand-in was the design-review verdict. See below |
| b04 | Does a prose lint catch planted breaks of Ian's writing rules, and how often does it flag clean sentences? | Proposed |
| b05 | Does the inbox sweep label match where Ian's files ended up? | Proposed |
| b06 | Can Jev flag the runs a person would want to inspect, from the record alone? | Proposed |
| b07 | Does a manifest with receipts let the decider see? Output alone, against agent claims, runtime receipts, and all three | Ran 2026-09-18. See below |

### What b01 found

Numbers and tables: `experiments/b01-stage-criteria/README.md` on branch `botassembly-track`.

- The plumbing works with no runtime change. A criteria file and a two-line script made a working gate. The exit codes matched the gate spec.
- A gate judges only what it can see. The design-review stage receives a real document as input. There the gate caught every mismatched request. At a pass mark of 0.60 it wrongly rejected 1.7% of accepted work. The design stage receives a ticket path as input. There the catch rate fell to two thirds or less.
- A pass mark of 0.80 is too high for this material. Jev's answers on good work sit between 0.78 and 0.99. At 0.80 the whole gate rejected 32% and 62% of accepted work on the two stages.
- Stacking causes the rejections. Most single questions averaged above 0.85 on good work. One question dipping is enough to fail a gate of seven.
- A free sweep over the stored answers found the best gate rule. The "answers the request" question blocks alone. The other questions block only when two or more miss. On design review at a pass mark of 0.70 this rule rejected 3.3% of good work and still caught every mismatch. The plain rule rejected 16.7% at the same mark.
- A lower mark and a counting rule could not rescue the design stage. Its gate catches a quarter of mismatches at 0.60, because the gate sees a ticket path and no ticket.
- No accepted output ever scored at or below 0.20 on a blocking question. Every miss was undecided. The fail mark adds little.
- The record keeps the agent's checklist evidence text. Real evidence scored well above swapped evidence on both stages. The design stage scored lower because half its checklist covers work that never reaches the output file.
- Verdicts flipped between two runs for 5% and 14% of answers inside the undecided band. Outside the band 0.5% and 2% flipped.

### What b03 and b07 found

Track spend after all three experiments: $0.33. Tables are in each experiment's README on branch `botassembly-track`.

- No `chose`, `loop_done`, `subflow_call`, or `fanout_done` event exists on this machine. A decider for them has no history to tune against. A flow with a real `CHOOSE` has to run a few dozen times first.
- Jev cannot reproduce a review verdict. Given the design, it approved all 150 cases at 0.98 confidence. The real reviewers refused 23%. They had run the tests and read the code. The decider needs a different kind of input, and a longer document does not supply it.
- High confidence was wrong here. Confidence alone cannot route.
- Success criteria written as outcomes measured poorly. The decider rejected 18% to 46% of accepted work and caught 20% to 33% of attempts a real check had refused. The criteria were written in one pass and never tuned.
- The agent's claims make the decider agreeable. They halved false rejects and cut every catch rate.
- Showing the decider the other checks' results turns it into a relay. Swapped requests then passed every time. A decider must never see those results.
- `record.jsonl` keeps no commands run and no files written. The receipts it keeps (turn counts, timings, tool tallies) moved nothing. The Pi session files may hold the commands. No experiment has read them.

## Sources

- LangChain, "Building a Harness with Jev", Sydney Runkle and Hunter Lovell, 2026-09-17. `ModelRouterMiddleware` and `AutoModeMiddleware`. Copy in `~/workspace/archive/notes-jev-2026-09-24/notes/jev/inputs/`.
- pi-subagents v0.69.0 release notes, typed gates: https://github.com/nicobailon/pi-subagents/releases/tag/v0.69.0
- jevals: https://github.com/theyashwanthsai/jevals
- jev-cli: https://github.com/Nasrallah-AL/jev-cli and jevwire: https://github.com/wesleydionisio/jevwire
- "Jev, Sorted", Pere Pages, 2026-09-16, the calibration critique: https://pearpages.com/blog/2026/09/16/jev-sorted-what-typesafes-system-one-model-actually-is-and-what-is-still-just-a-claim
- TypeSafe model page: no fine-tuning, 1,200 requests a minute, no training on customer data, zero data retention by enterprise contract: https://docs.typesafe.ai/models
- Botassembly: `specification/elements/gate.md`, `checklist.md`, `choose.md`, `loop.md`, `record.md`, `sdlc/planning/extension-surface-study.md`, `sdlc/planning/optimize-design.md`, ADR 0001 and ADR 0007.

## Outside sources

Clipped articles in the workspace vault. Each line gives the lesson for botassembly.

- `notes/clippings/Can Jev Be a Better Agent Evaluator?.md`, LangChain, 2026-09-20. Jev as a pass/fail judge matched a human label on all 500 repeated decisions. Three LLM judges matched on 80% to 99.8%. Jev had the lowest score variance and cost $0.00035 a call. The test covered five cases on one agent.
- `notes/clippings/Jev and AI Checkpoints Using Decision Models to Wrangle Agent Work.md`, ThruWire. The agent works freely between checkpoints and must leave receipts at each one. A decider inspects the work at that boundary. This is the stage-exit gate fed by runtime receipts.
- `notes/clippings/devagrawal09stanley-code Bounded TypeSafe Jev workflows for coding agents..md`. Deterministic workflows gather bounded evidence and ask Jev small fixed-choice questions. Code decides. An empty findings list is not an approval. An agent handles only unmatched requests, then writes a workflow for next time.
- `notes/clippings/Diogo doc.md`, from TypeSafe's founder. Routing to a smaller model can cost more, because the large model must reread the context. He proposes a yes/no per context chunk to build each prompt, and a decider as the router for tools and permissions.
- `notes/clippings/Contrastive Language Model (CLM) an ultra-fast System One Model.md`. A rival decider claims nine times Jev's speed. It reports that Jev fails as a verifier on long coding tasks. That matches b03 and b07 and argues for keeping the decider behind an adapter.
