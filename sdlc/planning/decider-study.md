# Who answers a sentinel's question

**A study, not a decision.** Written 2026-09-18 at Ian's direction, after he reopened "no other chooser". It answers the issue `sdlc/issues/2026-09-18-no-outside-decider-for-done-loop-or-choose.md`. Nothing here is ruled. No ticket exists for any of it. The recommendation at the end is the driver's and Ian's to overrule.

## 1. The ask

An author should be able to let something other than the stage agent answer three questions: which branch runs, whether a loop goes again, and whether a stage met its goals. A fast classifier model should be usable for this and never required. TypeSafe's Jev is the example in mind. It never writes text. It reads a state, answers a multiple-choice or yes/no question, and returns a probability. Whatever is built has to look like the rest of the grammar: capitalized Markdown files declare, lowercase programs act, and the folder is the graph.

## 2. What the grammar already gives us

The sentinel already declares the question. A `CHOOSE.md` body holds a question and a list of alternatives, each with a name in a code span and a description after it. A `LOOP.md` body holds the question the tail stage is asked. A fixed list with descriptions and a yes/no question are exactly what a classifier takes. The author has nothing new to write. Only the answerer changes.

The agent answers today through a control tool: `select` with a name and a reason, `continue` with an answer and a reason (`specification/elements/runtime.md`).

A lowercase program beside a sentinel already changes what happens around it: `before`, `gate`, `success`, `failure`. The name before the first dot is the role and the extension is for the reader (`specification/elements/stage.md:52-59`).

Structured output already drives control flow in one place. `FANOUT.md` names a key with `items:` and the runtime reads that array from the preceding stage's output. The agent never sees the sentinel.

The settled vocabulary rules out a deterministic chooser (`sdlc/planning/vocabulary.md:27-29`, ticket 0022). Ian reopened that on 2026-09-18.

## 3. Three answerers for one question

1. **The agent.** Today's behavior. No extra file.
2. **The previous stage's structured output.** The agent that holds the context decides as part of its work and writes the answer into a field of its output. A schema pins the field to the legal answers.
3. **A program.** A regex, a lookup, a classifier model, or a second language model. Bot does not know or care which.

Ian's reasoning for wanting the third: a decision needs context. The agent that just finished holds the context and grades itself. A fresh agent has to load the context again. A small outside decider avoids both costs when the context is boiled down for it.

## 4. Proposal: one lowercase program named `decide`

A `CHOOSE` or `LOOP` folder may hold a program named `decide`, with or without an extension, under the same executable and shebang rule as every other program.

- The runtime runs `decide` in place of asking the agent. It hands over the slots a gate gets, and the question and alternatives it already parsed from the sentinel.
- The program prints its answer as the first line of stdout: one of the listed alternative names for a choose, `continue` or `stop` for a loop. The rest of stdout is the reason. The record keeps all of it.
- Exit 0 means decided. A distinguished exit means declined, and the runtime then asks the agent as it does today. An answer outside the list, or any other exit, is a fault.
- The `chose` and `loop_done` events say who answered. The record never lies, and who decided is a fact a reader needs.
- `bot check` keeps its promise. The alternatives are still listed in the sentinel and matched to folders before the run. The program can only pick a listed name. `bot check` verifies that `decide` exists, is executable, and has a shebang.

One new name covers all three answerers. A three-line script that reads a field from `$INPUT` is answerer 2. A script that calls a classifier is answerer 3. Nobody is forced to use a model, and no provider call enters Bot, which keeps ADR 0001 intact.

A declined answer matters. A classifier's unsure answers are the ones that flip between runs. Declining sends exactly those to the agent. A toy language built on Jev, "Probably", reached the same shape on its own: a true branch, a false branch, and an `otherwise maybe` branch, plus a hard ceiling on its `while`. `LOOP.md` already has the ceiling in `repeat`.

## 5. A possible second step: a frontmatter key

Answerer 2 could be purely declarative, in the way `FANOUT.md` uses `items:`. A key in `CHOOSE.md` or `LOOP.md` would name the field of the preceding output that holds the answer. `bot check` could then verify before the run that the producing stage's `schema.json` pins that field to the listed alternatives. A program cannot offer that guarantee.

This is sugar over `decide`. It earns its place only if the three-line script turns out to be common.

## 6. Whether a stage met its goals

Ian drew a line the specification does not draw. A checklist reminds the agent and records that the agent says it did a thing. Success criteria define done, and something outside the agent decides whether they are met. Not every stage needs them.

Mechanically, a verdict on finished work with a send-back is what a gate already is. A stage does not need `decide`. It needs three things a gate lacks today:

- **A declared place for the criteria.** A `## Success criteria` heading in `STAGE.md`, matched exactly, in the way `## Checklist` is. One list item per fact that must be true. The definition of done then sits beside the instructions where a domain expert reads it.
- **Sight of the work.** A gate sees `$INPUT` and `$OUTPUT` only. A new slot would hand gates the runtime's own account of the stage so far: commands run, exit codes, check results, checklist marks with their evidence text. Script gates gain from this too.
- **Possibly a manifest from the agent.** Ian's model has the agent hand over receipts: what it did and the results. One shape is a tool like `mark`, answered once per criterion. This is the costliest part, and it is a self-report. Whether it adds anything over the runtime's own account is being measured. If it does not, leave it out.

`bot check` should refuse a stage that declares success criteria and has no gate, because nothing would judge them.

## 7. What a classifier can and cannot do here

- It picks from a list the author wrote, and it answers yes/no about facts visible in what it is shown. Both sentinel bodies are already that shape.
- It cannot write. It cannot split an input for a descend, produce fan-out items, or compose a reason in prose. The json-render project shows the general rule: the developer writes every candidate element in advance, the model picks and places them, and code assembles the document. No character of the result comes from the model.
- It judges only what it is shown. It should never be asked "is this done?" or "is this good?" as one question. One yes/no per fact works, and code combines the answers.
- Stacked questions multiply their misses. The rule that measured best lets one essential question block alone and lets the rest block only when two or more miss.

## 8. Evidence so far

An experiment outside this repository ran a classifier gate over 120 accepted stage outputs from sealed run records, with no change to Bot. Where the gate saw a real input document it caught every request that code had swapped for another run's, and it wrongly rejected 3.3% of accepted work at a pass mark of 0.70. Where the stage input was only a ticket path it caught about a quarter of swapped requests. Verdicts inside the unsure band flipped between runs 5% to 14% of the time, and outside it 0.5% to 2%.

Two more experiments are running: whether a classifier reproduces recorded `chose` and loop decisions and how much context it needs, and what the agent's claims and the runtime's receipts each add to a done verdict. Their numbers belong here when they land.

## 9. Open for ruling

1. Reverse the "no deterministic chooser" ruling in the vocabulary and in `choose.md`, in the form of a `decide` program.
2. The name. `decide` is one word for one concept and collides with nothing in the vocabulary. The alternative is to name the program after the control tool it stands in for, `select` and `continue`.
3. The declined exit code, and whether exit 75 keeps its gate meaning of an external blocker.
4. How a program gets a credential. The runtime scrubs provider credentials from everything it starts, and no built-in path hands a named secret to a gate or a decider.
5. Whether success criteria become a heading, and whether gates get a slot with the stage's own account.
6. Whether the agent's manifest is worth a new tool, once the measurement is in.

## 10. Recommendation

Build `decide` for `CHOOSE` and `LOOP` first. It is one new name, it serves a script, structured output, and a classifier alike, and it leaves the graph static. Cost: specification text for two elements, a `by` field on two record events, one new refusal or fault cause, conformance cases, and the reversal of a settled ruling that authors may have read.

Hold the success-criteria heading and the gate slot until the running measurement says what a gate needs to see. Leave `DESCEND` and `FANOUT` alone. Their decisions are writing.
