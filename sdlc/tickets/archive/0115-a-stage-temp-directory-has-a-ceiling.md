---
flow: build
priority: 6
waits-on: ["botassembly/botassembly/0125", "botassembly/factory/0066", "botassembly/sdlc/0149"]
---
# A stage's temp directory has a ceiling

bot hands each stage a temp slot and points the environment's temp
directory at it, so anything the stage's toolchain considers
temporary lands there — unbounded. On 2026-08-21 one stage
accumulated 11G in tmp (a freelanced parent-commit build plus
pytest extracting and compiling a crate), the machine ran out of
disk, and three unrelated flights died with it. Whatever a
project's tooling does, bot handed it that directory and answers
for its size. A run told "your temp is capped" fails with a legible
sentence; a run with no cap takes the machine down.

Done, observably: a stage whose temp slot grows past a configured
ceiling has its run ended by the runtime with a reason that names
the slot, the measured size, and the ceiling — legible in the run's
record and in the reason a reader sees. The ceiling comes from
assembly configuration with a conservative default, so a workload
that legitimately needs more can say so in its assembly rather than
negotiate with a machine. Enforcement is a periodic measurement by
the runtime while the stage runs — approximate within a sampling
interval is sufficient, since the failure being prevented is a full
disk, not a byte-exact budget; kernel-enforced quotas need
privileges or a specific filesystem and are not worth the
portability cost.

The hard choice to settle, and say why: how the ended run is
classified. A ceiling breach is an environment outcome, not a
judgment on the work — it should read like a fault, not a refusal —
but rerunning the same stage against the same ceiling may fail the
same way, so pure retry semantics are wrong too. Ticket 0112 (a
stage can report a fault instead of refusing) is adjacent: this
outcome is runtime-initiated rather than agent-initiated, so this
ticket does not wait on it, but the two should end up speaking the
same vocabulary.

## Parked, then released

Parked in drafts on 2026-08-21 by Ian's ruling: the ceiling was not
a problem he cared to solve then, because deletion with scope (0114)
and the exit warning (0116) carried the weight. Released and
promoted on 2026-08-23 by Ian. The seatbelt is now wanted — build
it.
