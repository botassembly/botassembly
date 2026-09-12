# The second public example

The examples program issue (`sdlc/issues/2026-09-11-no-public-examples-program.md`) asks for one runnable assembly per capability. `vtriage` covered skills, checks, hooks, and `CHOOSE`. This branch covers the control flow the first example did not touch: `PARALLEL`, `FANOUT`, and `LOOP`.

## What landed

`examples/digest` turns three short notes into one digest. `01-list` writes a checked JSON list, `02-summarize` fans out over it to a flow-scoped subflow, `03-collect` folds the per-note files into bullets, `04-frame` runs three branches at once, `05-assemble` loops on the combined digest with a gate inside it, and `06-emit` hands the result out. `bot check ./examples/digest/brief` resolves in ten lines and exits 0.

## Decisions

**Three containers in one flow, not three examples.** The program issue lists `LOOP`, `PARALLEL`, and `FANOUT` as separate single-capability examples. They ship as one assembly because the interesting thing about containers is placement, and placement only shows up when several of them have to share a sequence. Three one-container examples would each have shown a folder with a sentinel in it and taught nobody where it may sit. This is reversible: split it if a reader ever asks for the minimal case.

**The shape is what the rules forced, and the README says so.** `01-list` and `03-collect` exist because a fan-out cannot be first and cannot be followed by a parallel stage. `06-emit` exists because every sequence ends in a stage. An example that shows the containers without showing why they sit where they sit is a picture of a tree.

**A `bullets` branch that copies its input.** Only the immediately preceding node's outputs reach the next stage, so the summaries would have died at `04-frame`. A branch that carries them through is the honest fix and it is what an author would write. The alternative — dropping the bullets from the digest — would have made the loop's question unanswerable.

**The subflow sits at flow scope.** The container experiment found that an assembly-root subflow is a tool on every stage, and a later stage called the fan-out's worker three more times on its own. `flows/brief/subflows/summarize/` is the narrowest scope that works, and it keeps the subflow out of every other stage's tool list.

**`repeat: 3` with a body.** A loop with a body fails with `rejected` when it runs out, so the ceiling is a budget and not a safety net. Three is the smallest number that lets the agent ask for a second pass and still leaves room.

**No run proof.** The README pastes `bot check` only, produced with the throwaway home `sdlc/scripts/examples` writes. Running it calls a model three times over for the fan-out alone. A record excerpt from a real run belongs to the live smoke ladder, the way the first example's note left it.

## Where the spec and `bot check` disagreed

One, filed as `sdlc/issues/2026-09-11-fanout-accepts-the-option-ladder-the-spec-forbids.md`. The specification and the authoring guide both say `FANOUT.md` has "exactly these four keys". `bot check` accepts `retries`, `timeout`, and `intelligence` on it as well, refusing only `workdir` and genuinely unknown names. The fan-out's `options=` column prints empty, so an author cannot see whether an accepted key did anything. The example writes the four documented keys and nothing else.

Everything else the specification claims about placement, `bot check` enforced. A fan-out followed by a parallel stage is refused with `value-invalid` and "Put one ordinary stage immediately after FANOUT". An emptied subflow is refused with `folder-empty`, so the pre-flight does resolve the subflow even though it prints none of its stages — which the authoring guide already documents.

## Left open

- `DESCEND` still has no example. `bot check` prints only the entry flow's root stages, so a descend example's proof would show almost nothing.
- Nothing proves this example still produces a digest. `sdlc/scripts/examples` proves it resolves. The gap is the same one the first example left.
