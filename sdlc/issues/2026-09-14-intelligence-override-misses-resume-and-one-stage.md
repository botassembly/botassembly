# The command rung cannot name an intelligence on a resume or for one stage

Observed 2026-09-14 at commit `44d8dbf` on the Linux box.

`specification/elements/invocation.md:111-135` gives model choice six rungs, most specific first: command, task, stage, container, flow, assembly. The command rung is `--intelligence NAME`, and `bot run start --help` and `bot assembly check --help` both accept it. Two paths a run can take are missing from that ladder.

- `bot run resume --help` accepts `--correlation`, `--home`, `--id-file`, `--in`, `--json`, and declared slots. There is no `--intelligence`. `invocation.md:82` confirms it: a resume resolves intelligence again from authored configuration, the home, and defaults, with no command rung at all. A caller who started a run with an override cannot continue it with the same override.
- The command rung is run-wide. Being the most specific rung, `--intelligence NAME` repoints every stage of the run at once. There is no way to say that one named stage runs on one intelligence and the rest keep what the assembly authored, short of editing the assembly on disk and changing its hash.

Both are named outcomes for callers above the runtime. A scheduler that picks a stronger or cheaper model for one step of a procedure it did not author needs the per-stage form: today it either rewrites the folder or moves every stage together. A scheduler that recovers an interrupted attempt needs the resume form, or the recovered attempt silently runs on different models than the attempt it continues.

Smallest outcome that closes it: `bot run resume` accepts `--intelligence` with the same command-rung precedence and the same refusals as `bot run start`, and the command rung gains a per-stage spelling that names one stage path and leaves the other rungs alone. Every effective value keeps recording its source rung, so a record still says which rung decided.

Review trigger: 2026-12-14, or the first recovered attempt observed running on a different model than its donor.
