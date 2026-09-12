---
flow: build
priority: 6
---
# Status inspects a home of ordinary size

`bot status` refuses every real bot home. On this machine, from any shell, it exits 1 with an empty stdout and `This bot home is too large to inspect.` on stderr. `--json` does the same. The home it is declining is healthy: 702 runs, 1.4 GB, nothing stranded, nothing leaking.

The cause is `STATUS_MAX_ENTRIES` in `bot/src/inspection.ts`. It is 1,000, and it is a single budget shared by every walk status performs — the run-name listing, the size walk, the assembly walk and the stranded-copy walk all increment the same counter. This home holds 90,512 filesystem entries. Listing `runs/` alone consumes 702 of the 1,000 before any measuring begins, and the size walk exhausts the rest within the first few run directories.

So the ceiling is not a large home defeating a reasonable limit. Roughly twenty runs crosses it. Every bot home that has done more than a day's work is uninspectable, and has been since the bound was added.

`bot prune` cannot help and should not be expected to. Its business is scratch and stranded assembly copies; here it correctly reports about 56 KB. The 1.4 GB is 702 sealed run records, which is what 702 sealed run records weigh. Weight is a thing to observe, not garbage to collect.

## What the refusal gets right, and must keep

The refusal itself is good and this ticket does not touch it. A partial walk has no truthful total, so status declines rather than print a byte count it knows is short — the same discipline that made deck's panels report "not available" instead of inventing a zero during the 2026-08-23 outage. That honesty is why this defect was diagnosable at all. Whatever changes, status must still refuse rather than report a total it did not finish measuring.

The hostile-tree guard is also real work and stays. `bot/tests/inspection-resource-limits.test.ts` builds a directory of 1,001 flat entries and a tree past the depth limit, and status refuses both. That behavior is correct and must survive.

## Done when

- `bot status` run against a home holding the number of runs a working machine accumulates reports its totals, in both text and `--json`, instead of refusing.
- A home that is genuinely pathological — unbounded width in a single directory, or depth past the limit — is still refused, and still refused by declining rather than by reporting a partial total.
- The bound does not degrade as a home accumulates runs: a home that inspects today still inspects after another few hundred runs, without anyone editing a constant.

## The choices this ticket settles

**Not a flag.** An `--allow-large` switch leaves the default refusing on every real home, and moves the defect from the tool to the operator's memory. Status must work when typed plainly.

**Not simply a bigger constant.** A bot home grows one directory tree per run and nothing bounds that but time, so any fixed total is overtaken eventually, and the failure it produces is this exact ticket again. The design has to decide what the bound is derived from rather than what number to write down. Naming the thing being defended against is the way in: a flat directory of hostile width and a tree of hostile depth are bounded quantities, while the count of legitimate runs is not, and today one budget is asked to police all three.

**Deleting the bound is not the answer either.** It exists because an unbounded walk over a hostile tree is a hang, and a hang in an inspection command is worse than a refusal.

## The assertion that is missing

Every existing assertion exercises the refusing side. There is no test that a home of ordinary size inspects successfully and reports a total, which is why nothing ever noticed the guard fires on normal use. That test is the heart of this ticket, and its fixture has to hold enough runs to be honest — a fixture with three runs would pass today and prove nothing.

## Who is waiting on this

Deck's dashboard has a disk-weight panel that reads `bot status`. It renders "not available" and will keep doing so until this lands. That panel is the reason the gap was noticed and disk weight is a real observation need — a 1.4 GB home is worth being able to see.
