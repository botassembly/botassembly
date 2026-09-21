# Thinkthen as the judgment inside a stage: exit, loop, choose, and structured output

Observed 2026-09-20 at commit `06676fa` on the Linux box. Ian asked for this issue on 2026-09-20. It extends `2026-09-18-no-outside-decider-for-done-loop-or-choose.md`.

Thinkthen is a command-line tool that puts a judgment model in the shell. It reads evidence on standard input, takes a bounded question as arguments, prints a bare answer, and sets an exit code. It never writes text and never acts. Its `annotate` command reads a question file that holds several named questions and adds each answer to the record as a new field.

Ian wants Botassembly to use Thinkthen in the decisions a run makes. He named two uses.

## Use one: a judgment decides exit, loop, and branch

When the author configures it, a judgment decides whether a stage exits, whether a `LOOP` continues, and which `CHOOSE` alternative runs. With nothing configured the agent decides. Ian's words on 2026-09-20: the agent builds a manifest and asks the judgment model to make a decision, and the system is configured so that the judgment determines whether the stage exits, a loop continues, or which path a choose takes.

The specification closes this door today. Only an agent answers `CHOOSE.md`, and only an agent ends a `LOOP.md`. The earlier issue records that Ian reopened the rule.

## Use two: structured output from a judgment

A judgment can take a stage's output, classify it, and emit structured fields. Ian first described this as a stage of its own with no agent. The specification refuses that shape today. `specification/elements/stage.md` makes every part of a stage optional except the agent loop, and a stage with an empty body is refused as `body-missing`.

Ian then described a smaller shape, and he calls the choice between the two a big open question. His second shape needs no new stage. At the end of an ordinary stage the agent writes its manifest. `annotate` then runs over the manifest and the output with a question file. A gate reads the answers. The gate says whether the stage finished, and the same answers become the structured information the next stage reads. One `annotate` call plus one gate may be sufficient.

## What the answer has to settle

1. Whether the end-of-stage shape covers every case the separate judging stage would. If it does, the specification keeps its rule that every stage has an agent loop.
2. Where the question file lives in a stage folder, and how the stage names it.
3. How the answers reach the next stage: as a named output slot, as fields merged into the stage's output, or as a file beside it.
4. How an author hands exit, loop continuation, and branch choice to a judgment, and what the run record says about who decided.
5. What happens on an unresolved answer and on a backend failure. Thinkthen keeps yes, no, unresolved, and failure as four separate exit codes. The earlier report recommended that the agent answers when the judgment is unsure, and that the record says so.
6. Who builds the manifest. One experiment showed the judge the agent's own claims, and the judge turned agreeable and missed most bad work. The report from that experiment recommended that the runtime build the manifest from its own receipts. Ian describes the agent building it. This needs a measurement before it needs a ruling.

## Constraints

- Bot calls no provider except through Pi, and the runtime is public. A hosted judgment model cannot live inside Bot. Thinkthen runs as an ordinary command, the way a gate script already runs, so this constraint holds.
- A gate is already a program in any language that answers by exit code and printed text. A gate that calls `thinkthen decide` needs no runtime change. The first experiment ran exactly that way.
- No recorded history of `CHOOSE` or `LOOP` decisions exists to tune a judgment against. A judgment on those two controls starts untuned.
- A narrow yes-or-no question over a real document measured well as a gate. Judging whether a whole stage is "done" measured badly. Criteria should be several narrow questions, which is the shape `annotate` takes.

## Status

Open. Botassembly work is paused while Thinkthen ships. `sdlc/planning/decider-study.md` holds the earlier design options, and nothing there is ruled. The ideal state for Botassembly carries these as gaps as of 2026-09-20.
