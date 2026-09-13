---
flow: build
priority: 6
waits-on: ["botassembly/botassembly/0125", "botassembly/factory/0066", "botassembly/sdlc/0149"]
---
# A stage's temp directory has a ceiling that tolerates what it cannot read

bot hands each stage a temp slot and points the environment's temp directory at it, so anything the stage's toolchain considers temporary lands there — unbounded. On 2026-08-21 one stage accumulated 11G in tmp, the machine ran out of disk, and three unrelated flights died with it. A run told "your temp is capped" fails with a legible sentence; a run with no cap takes the machine down.

This is ticket 0115 re-filed. 0115 landed on 2026-08-23 at 13:10 and was reverted the same afternoon in `362fda9`, because the measurement it added could not survive its own repository. What follows is the same behavior plus the thing that broke.

## What went wrong the first time, and must not repeat

The sampler measured the temp slot and, on **any** error from that measurement, ended the run with a fault. A measurement error is not the same as an over-full directory. bot's own fuzz regression fixtures deliberately create directories the running user cannot read, so measuring a temp slot that contained them raised `EACCES` and killed the flight:

```
Could not measure $TMP: EACCES scandir .../tmp/bot-fuzz-wHp5iA/case-4/asm/flows/main
```

Botassembly 0125 hit this six times between 13:50 and 14:53, and 0115's own landing was the last landing the channel managed. Worse, the repository could not repair itself: any fix flight runs the same suite, creates the same fixture, and faults the same way. It took an operator revert.

The repository already knows the right shape for this. `bot/src/inspection.ts` walks trees for `bot status` and treats a file that vanished mid-walk as zero rather than as a reason to stop. A directory the walker cannot read belongs in the same category.

## Done when

- A stage whose temp slot grows past its ceiling has its run ended by the runtime, with a reason naming the slot, the measured size, and the ceiling — legible in the run's record and in the reason a reader sees.
- A temp slot containing entries the running user cannot read is measured anyway: the unreadable part is skipped, the rest is measured, and the run continues. Being unable to read one directory is never grounds to end a run.
- The ceiling comes from assembly configuration with a conservative default, so a workload that legitimately needs more says so in its assembly rather than negotiating with a machine.
- Enforcement is a periodic measurement while the stage runs. Approximate within a sampling interval is sufficient: the failure being prevented is a full disk, not a byte-exact budget. Kernel-enforced quotas need privileges or a specific filesystem and are not worth the portability cost.
- The full suite passes with the ceiling active — including the fuzz regression tests that create unreadable directories, which is the case that broke it before.

## The choices this ticket settles

**Skip what cannot be read; do not guess at it and do not stop.** The alternative — treating an unmeasurable subtree as a reason to fault — is exactly what was reverted. It converts a permissions detail into an outage, and it does so most often in the repository that owns the code.

**A measurement failure and a breached ceiling are different outcomes and must read differently.** Only the breach ends a run. If a measurement is so degraded that the number is meaningless, say so in the run's record; do not end the run on it.

**How the ended run is classified is still the open design question.** A ceiling breach is an environment outcome, not a judgment on the work, so it should read like a fault rather than a refusal — but rerunning the same stage against the same ceiling may fail identically, so plain retry semantics are wrong too. Ticket 0112 is adjacent: this outcome is runtime-initiated rather than agent-initiated, so this ticket does not wait on it, but the two should end up speaking the same vocabulary.

## Boundary

This ticket does not change what a stage's temp slot is, where it lives, or when it is cleaned up. It adds a ceiling and the measurement that enforces it, and nothing else.
