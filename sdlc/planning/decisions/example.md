# Decisions — `example.md`

*Historical (pre-ADR). Superseded by the specification and planning/adr/ as of 2026-07-31 — details below may contradict current truth (invariant numbers, command counts, identity format have all moved). Kept for the reasoning, not the rulings.*

Written 2026-07-30. The specification described sixteen parts and never showed
them assembled.

## The decisions

**1. One example, not a library of them.**
Options: a worked example per element; one end-to-end assembly; a directory of
runnable example assemblies. Chose one end-to-end assembly in one markdown file.
Its job is to show how the parts fit, and a second example would mostly repeat
the first. Cost: it cannot show every feature, and hooks and skills appear only
in passing.

**2. A markdown walkthrough rather than a real folder of files.**
Options: `specification/example/` as an actual assembly a runtime could run; a
document. Chose the document, because there is no runtime yet and an example
assembly nothing can execute rots silently. When a runtime exists, this should
become a real folder with the document narrating it.

**3. The example is a review flow.**
Chose work that is genuinely agent-shaped — reading a change, assessing it,
recommending, deciding — so the stages have reasons to exist. An arithmetic
example would be shorter and would demonstrate nothing about why gating matters.

**4. Four stages, one of each container, no nesting.**
Sequential, then `PARALLEL`, then `LOOP`, then `CHOOSE`. Nesting is legal and
was left out: the example is for understanding the pieces, and a `LOOP` inside a
`CHOOSE` would be showing off.

**5. `$INPUT` named at every step.**
This is the actual payload of the document. Every stage's section says what is
in `$INPUT`, because the directory-of-named-files rule is the thing that is
hardest to hold in your head from the element documents alone.

**6. Real file contents, not placeholders.**
The schema is a real JSON Schema; the gates are shell scripts that would run.
Placeholder contents would let a reader skip past exactly the parts that are
easy to get wrong.

**7. It ends with the inspection commands.**
The last section shows reading the run afterward, so the example covers the
whole life of a run rather than stopping when the output is produced.

## Questions for Ian

- Should this eventually be a real, runnable assembly checked into the repo and
  exercised by a test, rather than a document?
- The example uses `bot run review/change` — a flow addressed as
  `assembly/flow`. That syntax is invented here and is not in `invocation.md`.
  Is that the addressing form?

## Follow up

- The stage identity `03-recommend/pass-2/02-critique` is invented in this
  document and needs to match whatever `record.md` eventually specifies.
- The example does not show a hook, a skill being used, or a refusal. All three
  are worth adding once the document has settled.
