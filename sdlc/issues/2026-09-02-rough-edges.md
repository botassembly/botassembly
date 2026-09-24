# BotAssembly gaps, inconsistencies, and rough edges

Moved from Ian's notes vault on 2026-09-24. Written 2026-09-02; nothing was rechecked on the move.

Companion to `botassembly-endorsement.md`. The endorsement says what the framework promises. This note says where the promise and the machine still disagree. Written 2026-09-02 by Jarvis. Each item names what was checked. Nothing here is a ruling. Decisions are Ian's.

## 1. The eval-and-optimize loop is a promise, not a feature

The endorsement's strongest claim is that assemblies get better by measurement as models improve. Today that loop exists as notes and experiments, not as a shipped command. Checked: `bot --help` lists 21 verbs and none of them grades, compares, or optimizes. `docs/src/content/docs/` never mentions evals or optimization. The design lives in `notes/botassembly/bench/` and `notes/botassembly/optimization/`, with a proven harness in `experiments/o3-gepa-harness-spike/` paused since 2026-08-26. The principles page says "a diff between how this month's model and last month's handled the same request" and no tool produces that diff.

Cost of leaving it: the model-agnostic story is half true. Swapping a model is one edit. Knowing whether the swap helped is still a hand job.

Lever: resume the O3 live spike per `optimization/handoff-2026-08-26.md`, or ship the thin `eval` bench first so real runs become cases before any optimizer exists.

## 2. "Witness" means two unrelated things inside one repository

Checked: `specification/elements/invariants-witnesses.md` uses "witness" for a test that proves a specification invariant. The sdlc flow `flows/build/05-verify/gate/06-witness` uses "witness" for the receipt naming the verified commit. Both live under the botassembly umbrella. Ian already flagged the word as non-obvious on 2026-09-01.

Cost of leaving it: every new reader learns the word once and applies it wrong somewhere.

Lever: rename the sdlc gate to `06-receipt` or `06-verified-commit`. The invariant ledger's use is older and matches ordinary test vocabulary. Rename touches sdlc, the five lifecycle scripts, and every consuming repo, so it is a propagation ticket.

## 3. The vocabulary carries too many coined words

Assembly, flow, stage, slot, skill, intelligence, rung, subflow, descend, choose, gate, checklist, sealed, honest ending, refusal, witness. Checked: `specification/elements/` has 28 chapters and the conformance corpus has 34 accept and 108 refuse cases. A domain author who wants to write a five-step procedure meets most of these words in the first guide.

Cost of leaving it: the "domain expert can read and write it" benefit weakens with each term the expert must learn before the first run.

Lever: a one-page glossary in the docs, plus a review pass asking of each term whether an ordinary English word would do. "Intelligence" versus "model" is the clearest case. The spec uses "intelligence" 30 times and "model" 3 times. The rest of the industry says model. The abstraction is real and the word for it could still be "model tier" or "model role."

## 4. The runtime is small and the shell around it is not

Checked: `bot/src/*.ts` totals 12,968 lines, guarded by a size ratchet. The five canonical lifecycle scripts in the sdlc repo total roughly 2,500 lines of shell, copied verbatim into eight repositories, with no ratchet. The 2026-09-01 outage came from those scripts, not from bot. The complexity audit of 2026-09-02 found seven of ten findings in the shell layer.

Cost of leaving it: the layer with the least test discipline holds the most git logic and breaks most often.

Lever: a ratchet on the shell scripts in the sdlc repo, and the replay gate from `sdlc/planning/witness-simplification-2026-09-02.md` that runs `success` against checked-in real run records.

## 5. Premises about neighbors are not tested against reality

The ten-why analysis found the root cause of the outage: the dispatcher demands machine-checked proof for claims about its own code and accepts a sentence for claims about a neighbor. This is still true. Checked: no gate in any repo replays real sealed records through a consumer's parser. 1,758 records sit on disk and none feed a test.

Cost of leaving it: the next rule written from documentation instead of from samples will break production the same way.

Lever: a fixture corpus of real records, ugly ones included, checked into sdlc and replayed by the test gate. This is the single highest-leverage item on this list.

## 6. Twenty-one CLI verbs for a runtime that promises "a folder in, a record out"

Checked: `run`, `resume`, `check`, `assembly`, `auth`, `config`, `models`, `busy`, `runs`, `show`, `output`, `draft`, `rejected`, `request`, `capture`, `logs`, `session`, `explain`, `status`, `find`, `prune`. Nine of them read one run record in slightly different ways.

Cost of leaving it: consumers guess which verb holds the fact they want. The awk parser the outage deleted existed because the right verb did not, and `bot show --check` was added on 2026-09-02 to fill that hole.

Lever: audit which read verbs the dispatcher, dashboard, and SDLC scripts actually call. Collapse the rest under `show` with flags, or document a stable minimal set and mark the others as convenience.

## 7. The docs describe a package but the install path is a Makefile

Checked: the principles page says an assembly is a package installed by `bot assembly install`. Installing bot itself is `make install` writing a launcher to `~/.local/bin`, with Node 22.22 or newer as a manual prerequisite. There is no npm package, no release tag policy visible in the README, and the two Makefiles differ on purpose.

Cost of leaving it: an outside reader cannot try it in under a minute. Durability claims land better when the runtime is one command away.

Lever: publish the runtime as an npm package or a single-file release. Keep the Makefile for development.

## 8. The endorsement's proof points cite private projects

The endorsement mentions a clinical trial curation pipeline and a software factory. Checked against the workspace ruling of 2026-08-28: public repos must not name private projects. The endorsement lives in notes, so the rule does not bind it yet. If any part of it moves into the botassembly docs or the marketing repo, the examples must be described generically or drawn from the public repos alone.

Lever: when promoting, replace the private examples with the public ones: biodata, biomcp, pangopup.

## 9. Small inconsistencies found while reading

- `docs/src/content/docs/principles.md:60` reads "A intelligence is a semantic name." Should be "An intelligence."
- The README says the runtime is in `bot/` and the gate is `bot/`'s Makefile. The root Makefile packages. A reader needs to know which `make check` is the whole gate, and the README says it, but only in the last paragraph.
- The principles page lists thirteen principles. The README's summary sentence lists nine. Either list is fine. Two lists drift.
- `bot show --check` was added on 2026-09-02 and appears in `help.ts`. Checked: `docs/src/content/docs/reference/inspection.md` mentions `bot show` and has not been updated for the new flag.

## What was not checked

Runtime behavior under a provider outage. Cache-hit rates on the stable-prefix claim. Whether every one of the 28 spec chapters has a corpus case. Those are real questions and this note does not answer them.

## Suggested order

Item 5 first because it prevents the next outage. Item 1 second because it is the promise the endorsement rests on. Item 2 and item 3 together as one vocabulary pass. Items 4, 6, and 7 as ordinary tickets. Item 8 when the endorsement moves. Item 9 as a five-minute docs fix.
