# ADR 0005 — One process per run tree

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

A run — including every PARALLEL branch, every batched subflow child, and
every DESCEND level — executes in one OS process. Stages are `AgentHarness`
instances; a child run is the `subflow` tool awaiting a recursive `runFlow()`
call; PARALLEL is a `width` semaphore starting branches in name order and
**collecting every settlement** — never `Promise.all`, whose first-rejection
short-circuit is exactly what parallel.md forbids. On a branch failure the
semaphore stops issuing starts (branches not started never start), branches
already running are awaited to their own ends, every finished output is kept,
and the stage's exit is the first failing branch **in name order**, not in
finish order. The only child processes are hooks, gates, choosers, and
whatever agents spawn themselves.

## Context

Pi harnesses are in-process objects; putting runs in one process means no IPC,
no serialization, and one signal story: a single handler set stops new work,
aborts every live harness, SIGTERMs tracked child process groups, appends the
`signal` events, and exits 130/143/129. The predecessor's one-process-per-run
rule was forced by its own `process.env` wipe-and-restore hack, not by Pi;
passing environment per-harness (`shellEnv`) removes that constraint.

Clocks all live in the runtime: one accumulated-time clock per stage counting
**agent time only** — paused while subflow children run *and* while checks,
gates, and hooks execute (invariant 22, whole; see ADR 0007) — driving
`harness.abort()` on expiry; one fresh wall-clock timer per hook/gate/chooser
process. The record
writer serializes appends through one queue per record file so JSONL lines
never interleave.

## Consequences

- Concurrency bugs are async bugs, not distributed-systems bugs.
- Process-global state in Pi must be avoided or audited (module-global
  `setDefaultStreamFn` is never used; per-harness options always are).
- A run that must survive its process is out of scope by spec (invariant 44:
  a dead run is dead), so nothing here needs to checkpoint.

## Validation

**P2 (2026-07-31): proven** — 29/29 assertions on pinned agent-core/pi-ai
0.83.0, public API, scripted provider (`prototypes/p2-subflow-recursion/findings.md`):
concurrent children inside one tool `execute` (no worker pool needed);
recursion three deep with the tools array empty at max depth and no
depth-shaped bytes in the surfaces P2 scanned (tools JSON and system prompt —
the messages JSON was captured but not scanned; by inspection the report type
carries no depth field, and P5's reader asserts the full surface); the paused
clock exact (2000ms budget,
4010ms of child wall time, 3ms consumed; post-return idle expired at 2002ms
and `abort()` resolved the prompt as aborted); `subflows/<n>/` nesting in call
order; child failure resolving as an answer, never a rejection.

**P6 (2026-07-31)** validated the revised PARALLEL decision live: genuine
same-event-loop interleaving, a failing branch stopping new starts (the
never-started branch honestly `started:false`), running branches finishing
with outputs kept, and the exit taken from the first failing branch in name
order while a later-named branch finished failing *first* — plus per-branch
identity stamping holding under the interleaving (ADR 0014). It also
reconfirmed finding (a) below.

Two findings to carry: (a) `abort()` takes effect at the next stream event —
fine with a real provider's signal-aware fetch, but timeout enforcement should
not assume instant teardown; (b) avoid `setDefaultStreamFn`, the one
module-global — always pass per-harness `models` (now a rule under ADR 0010's
anti-defensive list).

**P4 (2026-07-31): proven, 24/24, two clean runs, no leaked processes**
(`prototypes/p4-signals/findings.md`). SIGINT/SIGTERM/SIGHUP → abort every
harness, `signal` events, exit 130/143/129, record parseable, interrupted
output kept-unsealed-unjudged. Hanging gate: fresh clock confirmed, SIGTERM to
`-pgid`, SIGKILL after grace beats a `trap '' TERM` gate. Closed-stdin
contract holds, bytes round-trip exactly, EPIPE swallowed.

**The pidfd C helper stays retired**: with direct parentage the kernel holds
the zombie until Node observes exit, so kill-by-pgid on own children is
race-free — every line of the predecessor's `bot-pidfd.c` guarded signalling
of *non*-children. The honest residual: a `setsid` escapee from a gate leaks
(live-pid reproduction saved), which pidfd could not fix either; that is
upstream ask #3 (ADR 0011), spawn-time containment.

Implementation duties P4 established: resolve child completion on `exit` plus
a settle, never `close` (grandchildren holding inherited pipes keep `close`
open — hit live; the held-pipe flag is a free grandchild detector); the stage
loop checks cancellation at unit boundaries or it can exit before the record
is written; `abort()` on an idle harness can reject (observed in a dev run;
no archived record holds the case — a duty, not a proven fact), caught
per-harness;
prefer direct spawn over `shell:true` and map `EACCES`/`ENOENT` to the
126/127 broken-assembly rule — a spawn error cannot be faked by a gate that
ran, while a shell 126 is number-identical to a gate deliberately exiting 126.
