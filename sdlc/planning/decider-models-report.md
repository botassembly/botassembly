# Decider models and botassembly

Moved from `notes/jev/decider-models-report.md` on 2026-09-24.

A report for Ian, 2026-09-18. It gives an opinion and asks for decisions. It sets aside prior rulings, as he asked. "Decider model" is the generic name. Jev is the first one. Competitors and local open-source models are assumed to follow. Botassembly has to work with one or without one.

## The opinion in one paragraph

Botassembly already has the right shape for decider models. Its sentinel files already hold questions with listed answers. `CHOOSE.md` lists the branches with a description each. `LOOP.md` asks "go again?". Only the answerer is fixed today, and the answerer is always the agent. The redesign makes the answerer a setting, the same way `intelligence` is a setting. The assembly declares the question. The home's config says who answers: a decider model, a script, or the agent. With no decider configured, the agent answers and everything works as it does today.

## The dream case

- Three kinds of worker. Agents write. Deciders judge. Code does everything else. Every one of them leaves a record.
- One new idea in the grammar: a question. Two types: pick one from a list, or yes/no. A question appears at a choose, at a loop's end, and at a stage's exit as success criteria. Later it can appear before a tool call.
- One new key, `decider:`, resolved through named rows in config like `intelligence`. A lowercase `decide` program stays as the escape hatch for scripts.
- The record keeps the question, who answered, the model version, and the probability.

## The pitch

- **Reliability.** Three agent steps at 90% yield 73%. Today the agent grades its own work. With a decider, something outside the agent checks "done" for a fraction of a cent in a fifth of a second.
- **Cost.** Stages that are really classification stop needing an agent.
- **Loops.** A loop stops at the right time, because the judge has no stake in being finished.
- **Durability.** Every decision on disk is a labeled example. When a new decider vendor appears, replay your own history through it before you trust it. Bench is the natural home for that replay.
- **Understandability.** A domain expert reads the success criteria as plain sentences and reads the probability each one got.

How exciting: the design is sound and cheap to build. The pitch above is a promise, and the measurements below do not back the reliability claim yet. Botassembly's thesis says wherever a step can be a script it is a script. Decider models widen what a script can be. Today's first decider model is good at narrow questions about visible facts and poor at judging whether work is done.

## What the measurements say

Three experiments on this machine's 2,040 sealed run records, $0.33 in total.

- **Narrow questions over a real document work.** "Does the output answer the request it was given?" caught every swapped request on design reviews and rejected 1.7% to 3.3% of good work (b01).
- **Judging done does not work yet.** With success criteria written as outcomes, the decider rejected 18% to 46% of accepted work and caught 20% to 33% of attempts a real check had refused (b07). One pass of untuned criteria produced these numbers. Wording moves Jev a lot, so they can improve. They are the evidence on hand.
- **The agent's manifest makes the decider agreeable.** Adding the agent's claims halved false rejects and also cut every catch rate. Jev reads the agent's account and believes it (b07).
- **Showing the decider the other checks' results turns it into a relay.** Swapped requests then passed every time (b07).
- **A review verdict is out of reach.** Given a design, Jev approved all 150 at 0.98 confidence. The real reviewers refused 23%. They had run the tests and read the code, and none of that is in the document. High confidence was wrong here, so confidence alone cannot route (b03).
- **The receipts Ian described are not in `record.jsonl`.** It keeps no commands run and no files written. The receipts it does keep (turn counts, timings, tool tallies) moved nothing (b07). The Pi session files in each run folder may hold the commands. No experiment has read them yet.
- **No choose, loop, subflow, or fan-out has ever run on this machine.** Zero events in 2,039 records. A decider for them cannot be tuned against history here (b03).

## Biggest risks

1. **False assurance.** A wrong pass is worse than no gate, because the record says the work was checked.
2. **Thin evidence.** Three experiments, one machine, one family of flows, criteria written in one pass. The negatives for choose and loop do not exist at all.
3. **A decider judges only what it sees.** An agent-written manifest can be gamed. An agent's output can sway the decider.
4. **Pass marks do not carry between models.** A mark of 0.70 for Jev means something different for a competitor. Vendors also update their models.
5. **Grammar creep.** Every new name spends some understandability.
6. **Quality judgment stays out of reach.** Deciders cannot tell whether work is good.
7. **Hosted models and customers with strict data rules.** Customer sites will need a local decider or the agent fallback.

## Decisions for Ian

| # | Decision | Options | Recommendation | Cost of the recommendation |
| --- | --- | --- | --- | --- |
| 1 | Does the runtime call the decider itself? | Outside program only. Runtime binding only. Both under one contract | Both under one contract. Build the `decide` program first, then the config binding | The runtime makes a provider call outside Pi |
| 2 | Where do pass marks live? | In the assembly. In the home's decider row | The home's decider row. The assembly only marks a criterion as essential or advisory | Two homes can reach different verdicts on the same assembly. The record has to say which decider answered |
| 3 | No decider, or an unsure decider? | The agent answers. The run refuses | The agent answers, and the record says so | Success criteria fall back to self-grading where no decider exists |
| 4 | What is the manifest? | Agent-written receipts. The runtime's own receipts. Both | The runtime's own receipts, and the record has to start keeping them. b07 showed the agent's claims make the decider agreeable. Never show the decider the other checks' results | New record events for commands and files, and a new slot for gates and deciders |
| 5 | Include the score primitive? | Yes. Leave it out | Leave it out until a use appears. Pick-one and yes/no cover choose, loop, and success criteria | A later addition if a use turns up |
| 6 | How is the adapter built? | Wait for Pi. A tiny interface of our own. A gateway | A tiny interface of our own: state and questions in, answers with probabilities out. json-render's evaluator is the model. Jev is the first adapter | One small interface to specify and test. Added 2026-09-18: `thinkthen` is now a third option. The runtime would run that binary and carry no backend code. See question 8 in `repos/thinkthen/sdlc/planning/design-study.md` |

## Build order, revised after the measurements

1. Now, with no runtime change: the verdict tool runs as a gate in shadow mode on real flows. It records and never blocks. Start with the one question that measured well, whether the output answers the request.
2. Give the decider real receipts: commands run with exit codes, and files written. First check whether the Pi session files already hold them. If they do not, the record has to start keeping them. This helps script gates and human readers with or without a decider. The measurements say a decider needs a different kind of input, and this is that input.
3. The `decide` program for `CHOOSE` and `LOOP`, and a field in the record for who answered. It is cheap and vendor-neutral. It has no history to tune against, so a flow with a real `CHOOSE` has to run a few dozen times first.
4. A `## Success criteria` heading and a slot that hands gates the runtime's receipts. Blocking waits until shadow numbers on real flows earn it.
5. The `decider:` key with named config rows, a Jev adapter, and the agent fallback.
6. A tool-call gate, and settlement of classify-shaped stages. Both are the pick-from-a-list shape where decider models measure well.

## Evidence

- Experiments b01, b03, and b07: a private experiment repository, branch `botassembly-track`, one README each under `experiments/`. All pushed. 397 tests pass.
- Design study: `repos/botassembly/sdlc/planning/decider-study.md`. It still proposes only the `decide` program and waits on the decisions above.
- Thinking and sources: `jev-in-botassembly.md` in this folder.
