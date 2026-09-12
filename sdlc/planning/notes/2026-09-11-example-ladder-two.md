# The ladder, rebuilt on everyday work

The four rungs under `examples/` were rebuilt on 11 September 2026. The shapes are unchanged; the domains, the prompts, the data, and the front matter are new.

## Why the domains changed

Ian's ruling: no pathology, no laboratory, nothing biomedical, and nothing about code. This is a framework for background, asynchronous, repeatable knowledge work that needs no human in the loop, and a reader who has to learn a specialty before the ladder makes sense learns the wrong thing first.

| Rung | What it does now | Was |
| --- | --- | --- |
| `hello` | Turns a joining note into a three-sentence welcome for a new teammate. | Restated a request in three plain sentences. |
| `triage` | Sorts an inbound customer request into an urgent or a routine queue and writes the routing memo. | Sorted a molecular pathology lab note. |
| `brief` | Turns a week of short team notes into one digest with a title and a tag list. | Same shape, laboratory notes. |
| `outline` | Plans a report from a rough topic, expanded section by section. | Same shape, a quarterly platform review. |

Each one is one line a stranger recognises, each runs unattended, and each is the kind of work a person would happily hand over. The sample inputs are `data/request-urgent.txt`, `data/request-routine.txt`, `data/notes-week.txt`, and `data/topic.txt`.

## What front matter the format actually accepts

Ian asked for real front matter with names and descriptions. The format has no `name` key anywhere and no `description` outside a flow. Read against `bot/src/model.ts`, `bot/src/documents.ts`, `bot/src/graph.ts`, and `bot/src/stage.ts`, the closed key sets are:

| File | Keys it accepts |
| --- | --- |
| `ASSEMBLY.md` | `intelligence`, `timeout`, `retries`, `local-context`, plus `slots`, `tmp-max-bytes`, `strict`, `folders` |
| `FLOW.md` | `description` (required), `tmp`, plus the four inherited options |
| `DESCEND.md` | the flow keys plus `max-depth` (required) |
| `STAGE.md`, `01-name.md` | the four inherited options plus `workdir` and `access` |
| `LOOP.md` | the four inherited options plus `repeat` (required) |
| `PARALLEL.md` | the four inherited options plus `width` |
| `CHOOSE.md` | the four inherited options and nothing else |
| `FANOUT.md` | its own `items`, `subflow`, `width`, `max-items` |

An unknown key refuses the whole assembly by name, so nothing here is invented. A human-readable name lives where the format puts it: the folder's own name, and the body of `ASSEMBLY.md`, which is the purpose statement every stage sees.

No file in the ladder carries an empty fence any more. Every assembly names an intelligence. Every flow carries its `description` and one budget key. Every stage sets a `timeout` or a `retries` of its own, chosen to say something true about the work: 120 seconds for a copy-through stage, 300 for a classification, 900 for the stage that drives the descent, and two retries on the arms of the choice that write a memo with required sections.

## The runs

Four real runs, one per rung, against a throwaway home whose `default` intelligence is `google` / `gemini-3.5-flash-lite` / `low`. Every one exited 0 with cause `success`. They are published whole under `examples/runs/<assembly>/<run-id>/` with absolute paths replaced, exactly as the previous triage run was.

| Rung | Run id | Record lines | Turn tokens |
| --- | --- | --- | --- |
| `hello` | `2026-09-11T17-54-50-82ce` | 30 | 20,643 |
| `triage` | `2026-09-11T17-55-02-443e` | 89 | 78,962 |
| `brief` | `2026-09-11T17-55-28-2640` | 142 | 115,415 |
| `outline` | `2026-09-11T17-57-33-d1d1` | 112 | 109,361 |

The triage run replaces `2026-09-11T12-36-58-eb14`, which is deleted. It is the run the home page walkthrough reads, so `docs/scripts/walkthrough-steps.mjs` names it and the extractor's test counts its 89 lines.

## What Ian can overturn

- **The four domains.** Support triage, a weekly team digest, a report outline, and a welcome note. Any of them can be swapped for another everyday task without touching a shape.
- **Publishing all four runs rather than only triage.** The four run folders are 6.9 MB and 349 files. Only the triage run is read by anything; the other three are evidence that the rungs run. Deleting three of them costs nothing but the evidence.
- **Taking the `bot check` pastes against a Google home.** The pastes name `google` / `gemini-3.5-flash-lite` / `low` because that is the home the runs used, so the pastes and the records agree. Every README says the reader's own home will differ.
- **`tmp: flow` on the triage flow.** It is there to show the key exists. The flow does not need a shared scratch directory.

## What did not change

The stage names, the container placements, and the memo's `Queue` / `Why` / `Action` headings. The walkthrough, the extractor, and its tests all lean on those, and the point of the rebuild was the subject matter, not the skeleton.
