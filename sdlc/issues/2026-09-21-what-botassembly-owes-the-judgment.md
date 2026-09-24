# What Botassembly owes the judgment

Status: Open

Written 2026-09-21 at `06676fa`. No ThinkThen work is blocked on this repository, and ThinkThen has asked for nothing here. This page records the six things the runtime and the authoring side own, so they are not mistaken for ThinkThen gaps when Botassembly restarts. It extends `2026-09-18-no-outside-decider-for-done-loop-or-choose.md` and `2026-09-20-thinkthen-as-the-judgment-inside-a-stage.md`.

The findings behind these six, and the two that measured badly, are in `sdlc/planning/jev-in-botassembly.md` and `sdlc/planning/decider-models-report.md`.

## What ThinkThen already settles here

A question file is a complete declaration of a judge. Its first key names the verb, and the file carries the question text, the threshold, the evidence pointer `on`, and the model. So an answerer declaration in this repository reduces to three things: a question file path, an evidence pointer into the stage's artifacts, and a statement of what each outcome means. No new format, no new parser, and no hosted call inside the runtime.

`--details` gives one result object across all eight verbs, so the runtime needs no wrapper around the output either. That removes most of what `sdlc/planning/decider-study.md` was searching for. It leaves the six items below.

## 1. Name the judged evidence inside the run directory, always

Two halves, and the first already works. `specification/elements/record.md:393` retains a gate's exit code, its executable file, its hash, and its exact evidence capture, and `check.capture` holds the bounded output. A gate that prints a ThinkThen `--details` row therefore puts that row in the sealed record with no new mechanism anywhere.

The evidence behind the row has no home. A single-verb details row carries `meta.question_sha256` and no request digest, so a `decide` row alone cannot name what the judge was shown. The recording can, and `--record DIR` writes the exact request under a digest that names the entry.

The runtime owns this and the gate author does not, because a gate that forgets the flag writes a run record that cannot be audited and fails silently. The runtime should place a recording under the stage attempt directory and name it in a record event, so a reader holding a sealed record reaches the evidence with no convention to know.

**This is a change to the record layout, and a published record layout is a compatibility surface.** It should land before the layout is fixed, and it should use `--record` and never the shared XDG cache, because a cache is prunable at its size limit and a sealed record is not. A pruned entry leaves a digest that points at nothing, and that breaks the promise that a finished run can be re-read.

Item 1 of `repos/thinkthen/sdlc/issues/2026-09-21-what-a-procedure-runtime-asks-of-a-judgment.md` asks ThinkThen to put the digest in `meta` directly. That makes this cheaper and does not remove it, because the digest names an entry and the folder still has to exist.

## 2. Own the budget

ThinkThen holds a request cap and declined a ledger across runs, on the reasoning that the budget belongs to whatever sequences the work. That is this repository. A `LOOP` and a `FANOUT` spend across processes and across runs, and a flow that runs a hundred times has no ceiling today.

`specification/` should carry a bounded cost on a flow or a run. The runtime already keeps the sealed record, so it already holds the row count and the token count a budget needs.

### What to size it against, measured 2026-09-21

Measured from this machine's own home at `~/.local/share/bot/runs`, which holds 2,040 runs from 2026-08-06 to 2026-09-16.

| Measure | Value |
| --- | --- |
| Runs a day | 206 at the peak, about 49 across the whole span |
| Stage attempts in one run | median 5, p90 7, max 9, mean 4.0 (120-run sample) |
| Stage attempts that are a retry | 18.8% (208 attempts in 60 runs) |
| Checks in one stage attempt | 1 to 4, mean 3.33 (193 attempts) |

One run makes 4 to 13 judgments if every check became one, and a peak day makes 800 to 2,700. At the price ThinkThen measured, about 1.2 cents per thousand judgments, that is 1 to 3 cents a day.

**A ceiling on requests alone is not enough.** Measured stage output sizes, which are the evidence a gate would judge, run from 40 bytes to 1,433,440 bytes across 136 outputs: median 2,750 bytes, p90 16,253, mean 54,365. The spread is about 36,000 to 1, and one request at the top of it is roughly 350,000 tokens, five times over the vendor's 64,000 limit. A count-based ceiling lets that one call through.

So the budget needs two parts: a running count for the loop and a `FANOUT`, and an input-size guard that refuses before the send. This is the one item here that gates a feature rather than a convenience. Without it, handing a loop to a judgment is not safe to run.

## 3. Ship a band in every gate example

`specification/threshold.md` in ThinkThen measured answers inside an unresolved band flipping 5% to 14% between identical runs, and answers outside such a band flipping 0.5% to 2%. The default cut of one half hides that region entirely, so a gate at the default reports an unsteady answer as a confident one.

Every gate under `examples/` should open with a band such as `--threshold 0.1:0.9`. A gate that wants a hard pass reads exit 0 and gets exit 3 for free. This is a documentation change and it is also a correctness change.

## 4. Route exit 3 apart from a chosen label

ThinkThen reports an unresolved `choose` as exit 3, and that is not the same fact as a label named `other` winning. An unresolved pick means the model had no confident choice. A chosen `other` means the model made a choice.

`CHOOSE.md` therefore needs three outcomes and not two: a picked alternative, an unresolved pick, and a failure. The record has to say which happened. If an unresolved pick falls back to the agent through the `select` tool, that path should stay distinguishable from the agent being sent back after a check failure.

Item 3 of the ThinkThen issue also stands here. An unresolved answer inside a question set arrives as `null` per field, and the gate reads that with `jq`. The runtime should not treat `null` as a no.

## 5. Build the manifest from runtime receipts, and not from the agent's account

The experiment that showed the judge the agent's own claims turned the judge agreeable, and the report recommended the runtime build the manifest. The retired idea note, now at `~/workspace/archive/notes-jev-2026-09-24/notes/ideas/jev-decisions-in-botassembly.md`, still records Ian saying the agent builds it. That is unsettled and it is the largest open question on this page.

The `thruwire/foreman` checkout at `~/foss/foreman` answers it by construction. `src/foreman/observation.py` builds the evidence from git status, a bounded diff, changed file names, process exit codes, and the event history, and it never reads the worker's report of itself. Its own weakness carries the other half of the lesson. `src/foreman/observation.py:172` hardcodes `test_results` to an empty list, so its judge never sees a structured test result.

The sealed record in this repository holds exactly what that judge lacks: check results, gate verdicts, exit codes, and output hashes. A manifest built from this repository's own record is strictly better evidence than Foreman's, and that is the whole argument for it.

The size measurement in item 2 says the manifest must also select and bound. Stage outputs run from 40 bytes to 1.4 MB, so a manifest that carries the raw output would blow the request limit on the long ones and waste money on all of them. Foreman bounds its diff at 20,000 characters and each output tail at 12,000 for the same reason. A receipt list plus bounded excerpts is the shape.

Three mechanisms from Foreman are worth taking with it. `src/foreman/policy.py:21` decides the action in a deterministic function and the judge never acts. One steer per worker, a grace window, and a verification flag that cannot re-trigger stop the policy oscillating on noisy probabilities. Three consecutive model errors continue the work with a recorded reason, and the fourth escalates.

Foreman's overall shape is not worth taking. It supervises one un-authored loop and lets a policy decide when to stop. This repository's claim is that the author owns the graph, and a supervisor that adds or skips a stage would contradict it.

## 6. Record the shadow history first

Ideal-state gap 6 says no history of choose or loop decisions exists to tune a judgment against. The b03 experiment found no `chose`, `loop_done`, `subflow_call`, or `fanout_done` event in 2,039 sealed records.

A gate that records and never blocks produces that history at a cost of cents. Every threshold in item 3, and every quorum rule over a question set, depends on it. It is the cheapest of the six and it should run first.

## Order

Name the judged evidence inside the run directory, because the record layout is a compatibility surface and the default cache can prune what a digest points at. Record the shadow history. Ship the band in the examples. Own the budget. Settle the manifest. The answerer setting is last, and it needs a ruling on where a question file lives in a stage folder and how the answers reach the stage after.

## What Ian can overturn

Item 5, in whole or in part. He described the agent building the manifest and this page argues the runtime should. Items 1, 3, and 6 are mechanical. Item 2 commits this repository to owning a run's cost, and he may want that decision at the scheduling layer instead, because that layer already owns the attempt and its settlement.

Review trigger: the ThinkThen version one surface freezes, or 2026-10-21.

## Rulings of 2026-09-24

Ian ruled on 2026-09-24. `sdlc/planning/adr/0031-the-specification-is-the-smallest-contract-every-runtime-keeps.md` and `sdlc/planning/decisions/2026-09-24-restart-rulings.md` record the rulings.

- **Item 1 lands before `0.1.0` ships.** Any run-record change lands before the release. This item is ruled and waits for a ticket.
- **Item 2 leaves the specification.** Cost limits are a runtime concern. Any budget arrives as `bot` configuration or a hook. The 2026-09-14 ruling in `sdlc/planning/plan.md` against a whole-run ceiling in `bot` stands. Whether a judgment loop needs a count and an input-size guard in `bot` configuration is still open. So is whether the scheduling layer owns it instead.
- **Item 4 is judged against ADR 0031.** A third `CHOOSE.md` outcome is a specification change. It enters only if every runtime must support it.
- **Item 5 rests on provisional evidence.** The b07 finding that the agent's claims made the judge agreeable predates what Ian now knows about ThinkThen and Jev. Bounded new experiments replace it before a ruling.
- Items 3 and 6 need no specification change. They stay open as documentation and example work.

### Ticket 0303 waits

Ticket 0303 sits on `ticket/0303`, with its design accepted at `66fac0d`. Its starting facts are stale. It says the issues folder held no work. This folder has held open issues since 2026-09-18. Its scope forbids a record contract change, and item 1 is one. Editing the ticket would void its accepted design review, so the ticket text stays unchanged. At restart the queue owner lands item 1 through its own ticket. Then 0303 gets fresh starting facts, a dependency on that ticket, and a new design review.
