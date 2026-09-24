# Scratch keeps filling the disk — third time, and the tickets will not stop it

Moved from Ian's notes vault on 2026-09-24. Written 2026-08-21; nothing was rechecked on the move.

Written 2026-08-21 for the botassembly architecture team. Staging note: nothing here is authoritative until it lands in a ticket.

## What happened today

The disk hit 100% again. `~/.cache/bot/tmp` held **219G** across about 130 per-run scratch directories. 120 of those were created on August 20 and 21 alone — two days. The dispatcher had already health-stopped all five channels on the 10 GiB free-space floor, so no work was moving.

An operator deleted 115 of them by hand and recovered 194G. Free space went from 8.1G to 202G.

This is the **third** hand-deletion. 0043 records the first (2026-08-16, 43G). 0044 records the second (same day 0043 landed, 34G). Today is the third, at five times the size of the first.

## Where the bytes come from

Almost all of it is one thing: biomcp is a Rust project, and its test `tests/test_source_package_boundary.py::test_verified_package_compiles_focused_identity_test_after_extraction` packages the crate, extracts it into a pytest temp directory, and runs a full `cargo test` in there. That builds a complete `target/` tree from scratch inside a throwaway directory — about 4G, including a single 662MB `libbiomcp_cli` rlib.

Two multipliers turn 4G into 30G:

- pytest keeps the last three run directories by default, so each bot run's scratch holds three copies.
- A single bot run does many pytest runs. Inside one scratch directory there were `pytest-0` through `pytest-19`.

The largest single run scratch measured 33G. That number matters for the floor discussion below.

## Why the existing tickets do not close this

0043 and 0044 are both correct about what they say. Together they are still not enough, and the reason is worth the architecture team's attention because it is structural, not an oversight.

**0043 started as a lifecycle guarantee and was refused into a manual tool.** The original ticket said: when a run ends, on every exit path, its scratch is removed. That is the fix. It was refused three times. The first refusal addendum explains why — 33 shipped assertions observe scratch *after* a run ends. Post-run scratch is the test suite's window into what stages actually did. Deleting scratch at run end demolishes that channel, so the lifecycle deletion was withdrawn.

What survived is: `bot prune` learns to report and delete scratch. 0044 then adds a scratch-only selection so scratch can be reclaimed without also removing run directories that are still worth keeping.

**Both of those require an operator to type a command. Nobody types it.** Cron runs the dispatcher's sync and tick every minute and nothing else. There is no scheduled prune, no timer, no unit. So the design is: scratch accumulates forever until a human notices the disk is full. That is exactly the loop we have run three times.

0044's own text says it plainly — "the same day it landed, the disk refilled." The ticket observed the failure mode and still scoped itself to another manual verb.

**The deeper problem is that the test suite has pinned scratch's persistence into a guarantee.** Those 33 assertions were written to observe stage behavior, and in doing so they made "scratch outlives the run" a tested contract. That is why the obviously correct fix keeps getting refused. The suite is asserting on a cache. Until that is untangled, every proposed fix has to route around a guarantee nobody actually wants, and the result is always another operator-invoked verb.

## What I think is missing

Three gaps, roughly in order of how much they matter:

1. **Nothing reclaims automatically.** Whatever the mechanism — a scheduled prune, a size ceiling on the scratch root that evicts oldest-first, a check at run start that reclaims before it allocates — something has to happen without a human. This is the whole ballgame. 0043 and 0044 both stop just short of it.

2. **The health floor is too low to be a warning.** 10 GiB on a 915 GiB volume is about 1%. A single bot run can produce 33G. The floor cannot distinguish "getting tight" from "already too late" — today it fired only after the disk was at 100% and had crashed runs. A floor should be at least a few times the largest thing one run can make. Something like 60G would have stopped dispatch with room to work.

3. **The producer is unbounded and unowned.** No ticket in botassembly or biomcp says the crate-compile test must reuse a target directory or bound its temp usage. Pointing that extracted-crate `cargo test` at a shared `CARGO_TARGET_DIR` would cut per-run scratch by most of its size and make the test much faster. The trade-off is that it slightly weakens the isolation the test performs — but the test's claim is that the *packaged crate* compiles standalone, not that the target directory is pristine, so sharing it looks fine. That is biomcp's call, not botassembly's, but botassembly should not assume its consumers are well-behaved.

## The one-line version

Scratch cleanup keeps being designed as something an operator does, because the test suite made scratch's persistence a guarantee and the lifecycle fix cannot get past it. Operators do not do it. Until reclamation happens without a human, this recurs — and it is growing: 43G, then 34G, now 219G.

---

Status, 2026-08-25 (verified against the machine): currently healthy — `~/.cache/bot/tmp` holds 200M across 423 entries and the disk has 225G free. Since this report, the scratch-lifecycle ticket family landed in botassembly (0114 the tmp slot dies when the run settles, 0116 an agent is warned before its tmp is destroyed, 0129 cleanup tolerates what it cannot read, plus the earlier prune-safety set), and the nightly run-store backup runs at 03:30. Leaving this report open until a fourth fill does not happen for a month; if it fills again, this note is the history.
