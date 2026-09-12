# ADR 0016 — Assembly capture: a run runs its capture, taken at startup

**Status:** accepted (Ian, 2026-08-05, revision 2 as written — including the
executable bit joining the aggregate identity, and unbounded operator-managed
storage stated baldly) · **Date:** 2026-08-05

Supersedes the external review's content-addressed object-store recommendation
(`sol-agent-review-2026-08-04.md`), and one consequence of ADR 0012 — see the
end. Ian has already ruled out the object store, a collector, pins, and
hardlinks (a write through a hardlink mutates every supposedly independent
copy). Revision 2 narrows four promises revision 1 made that the mechanism
does not support; the external review of revision 1 caught all four, and each
was re-verified against the repository before being adopted.

## The finding this rests on

The discussion assumed a choice between "freeze the assembly per run" and
"read live files so a mid-run edit takes effect". **Neither describes the
runtime.** What the code does today, verified 2026-08-05:

- **Stage instructions are read once, at run start.** `readAssembly`
  (`reader.ts:48`) parses the whole tree into memory before the first stage;
  the system prompt is built from `context.node.body` — the bytes as they
  were at start. Editing stage 3's markdown while stage 2 runs changes
  nothing in this run.
- **Schema templates are re-read at stage time** (`prompt-assembly.ts:51`,
  `schema-check.ts:30`). Editing `schema.md` mid-run DOES take effect.
- **Subflow sentinel descriptions are re-read at prompt time**
  (`prompt-assembly.ts:43`).
- **Gates and hooks are re-read at execution time, and an edit is fatal**:
  the execution-time hash is checked against the run-start hash and a
  mismatch ends the run at exit 2 (`record.md`, invariant 14) — deliberately,
  because an agent once rewrote a gate to exit zero.
- **Workspace local-context is read live** — correct, it is the workspace's,
  not the assembly's.

So "live editing as a development benefit" is not a behavior we would be
preserving; it does not exist. What exists is an accident: an edit's effect
depends on which KIND of file it touches and on a race with stage boundaries.
The run-start `assemblyHash` describes bytes the run only partly used.

## Decision

**A run executes exactly the private assembly capture completed during its
startup, and keeps it. An edit racing startup may or may not enter the
capture; the capture is authoritative.**

That sentence is deliberately weaker than "as it stood at one instant". A
recursive directory copy is not an atomic filesystem snapshot: two files
saved while the walk runs can land as one old and one new, a combination that
never existed together on disk. Detecting that (before/after scans, retries)
buys a stronger sentence at real cost; we take the honest weaker sentence
instead. What is promised is exact knowledge of what ran — the capture IS the
bytes every stage used — not that those bytes ever coexisted as one source
revision.

1. **Capture first, then everything from the capture.** The lifecycle:
   1. Resolve the invocation and the source assembly root.
   2. Reserve the run name and its lock, create the run directory (the 0112
      birth order — the lock now also covers the capture window).
   3. Copy the assembly tree into `runs/<run>/assembly/`.
   4. Validate, parse, and hash **the completed capture only**. The live
      tree is never parsed or hashed by a run again. Multiple reads are
      harmless because the capture is sealed; correctness comes from the
      seal, not from a one-read discipline.
   5. On a validation refusal, remove the run directory and release the
      lock, so a refused run still leaves nothing (`record.md`'s rule).
   6. Write `run_start`, naming the ORIGINAL assembly path and the capture's
      hash.
   7. Render each stage's system prompt and first user turn once, retain the
      exact strings in the run directory, and hand those same strings to the
      harness.
   8. Every assembly-owned read and every executable runs from the capture:
      stage bodies, schema templates, sentinel descriptions, assembly
      skills' full contents, gates, hooks. The invariant-14 execution-time
      hash check stays, now against the capture, as defense in depth.
2. **Mid-run edits to the live tree take effect on the NEXT run, never this
   one.** This closes the accidental seams. It also makes mid-run editing
   SAFE: nothing in flight can see a half-saved file.
3. **Capture scope is exactly the hashed assembly:** visible regular files
   only — hidden entries stay excluded, symlinks and special files stay
   refused (`record.ts` already throws on them while hashing). Executable
   status is preserved on the copied files. ~~**Proposed, needs Ian:** add
   the executable bit to the aggregate identity text~~ **Decided with this
   ADR's acceptance and BUILT — ticket 0113.** The identity line carries
   `:x` for an executable file and nothing for a plain one (invariant 41's
   `path:hash` lines; witness `bot/tests/record.test.ts` "an executable
   file's identity line carries `:x` and a non-executable's does not"). A
   gate's behavior depends on the bit and it costs no extra hashing; it
   changed future assemblies' hashes, which is acceptable because a hash
   identifies rather than reconstructs.
4. **The capture is runtime-owned and made non-writable after sealing.**
   That is a tripwire, not a wall: the spec is explicit that hiding paths is
   obscurity, not a sandbox (invariants 3/34–37), and this ADR claims no
   security boundary. The record and the hash check remain the actual
   defense.
5. **The rendered prompts are retained** (step 7) because even a perfect
   capture cannot answer "what was the model asked": the session does not
   keep the system prompt, and `local-context: use` injects workspace bytes
   that are in no assembly. Few KB per stage.
6. **Large files: copy them anyway, and be honest that storage is unbounded
   and operator-managed.**
   - No size cap. The capture is the execution source; refusing to copy a
     50 MB binary gate would mean refusing to run the assembly, and a
     hash-only stub would reopen the exact gap this ADR closes.
   - **Prune does not bound this.** Pruning is entirely manual — the spec:
     "a run is deleted because a person typed the flag, or it is kept
     forever." A thousand retained runs of a 50 MB assembly is ~50 GB and
     no machinery prevents it. The mitigations are visibility (`bot status`
     reports captured bytes — as **logical bytes**: `directorySize` sums
     `lstat` sizes) and the operator's own `bot prune`.
   - A full disk during capture is a handled failure: remove the partial
     run, release the lock, refuse with a plain sentence. A hard kill
     during capture leaves a record-less run plus a stale lock — the states
     C27 and C28 already name — and capture stretches that window from
     microseconds to possibly seconds, so **C27's fix rides in the same
     batch**: inspection and prune must describe a mid-birth run
     consistently before birth gets longer. **Done — ticket 0112 (a run is
     not prunable before it is alive) and 0114 (a run being born is
     running everywhere), both landed before capture.**
7. **Subflow child runs execute from the parent's capture.** One capture per
   top-level run; a child is recorded under the parent's tree, so archiving
   the parent keeps everything the family ran.

## What this gives up, stated honestly

- **Mid-run edit pickup.** The development scenario — fix stage 3 while
  stage 2 runs, current run uses the fix — is not served. Today it is served
  only for schema files, by accident, and never for the stage instruction
  itself. Making it real for everything would break run-start validation and
  make every edit's effect depend on a race the author cannot see. The edit
  lands on the next run. The real cost is the edge case where stages 1–2
  were expensive; a resume-from-stage feature would address that someday and
  is not this ADR.
- **Disk, unbounded except by the operator.** Stated above; not hidden
  behind prune.
- **No replay promise.** The run directory becomes self-contained **for
  inspection**: record, request, authored assembly as captured, rendered
  prompts, inputs, outputs, checks — readable, movable, archivable as one
  unit. It is NOT a self-contained execution environment: it holds no
  runtime binary, no provider behavior, no OS or PATH tools, no workspace
  state, and **no workspace skills' contents** — those are materialized at
  stage time into scratch, which lives outside the run directory
  (`flow.ts`, `slots.md`); their descriptions appear in the retained
  prompt, their scripts do not. Deterministic replay is not claimed.

## Consequences

- `run_start`'s `assemblyHash` becomes unconditionally true: it names bytes
  that are IN the run directory and that every stage used. ~~**A real runtime
  version lands in `run_start` with this work** — `package.json` still says
  `0.0.0`.~~ **Done — ticket 0115.** `package.json` says `0.1.0` and
  `runStartEvent` writes that manifest version, bound at module load rather
  than read off disk at run time (`bot/src/record-events.ts`); witness
  `bot/tests/inspection-record-contract.test.ts` "run_start names the
  runtime version that wrote the record".
- ADR 0012's consequence — "the record does not store the prompt: it is
  reconstructible from the assembly's bytes plus this ADR's layout … The
  session holds what was actually sent" — **is superseded; both halves are
  false today** (the session does not retain the system prompt;
  `local-context: use` injects bytes from no assembly). Step 7 replaces it.
- The spec owes plain sentences, once built: *a run runs its own copy of the
  assembly, taken when the run started; to run your edit, start a run;* and
  the storage sentence above. **Paid — `record.md`'s "the run's own copy"
  paragraph** carries both, and `inspection.md` carries "a run is deleted
  because a person typed the flag, or it is kept forever."
- **Verification the implementation must carry** (pause-point tests, the
  0112 instrument): mutate a stage body, a schema, an assembly skill script,
  a sentinel, a gate and a hook AFTER capture and witness no effect on the
  run; mutate during capture and witness the capture stay authoritative;
  flip an executable bit without changing bytes; plant hidden and special
  entries; kill and fill the disk mid-capture and witness the states
  inspection names; redirect the source assembly after capture and witness
  the record still name the original path. **Built — `run-capture.test.ts`,
  `run-capture-execution.test.ts`, `run-capture-seal.test.ts` (tickets
  0116–0117), with the redirect witness added by 0133.** One item on that
  list is NOT a runtime witness and never will be: an executable bit flipped
  after capture without a byte changing cannot reach the drift check,
  because `rehashExecutable` compares byte-hashes and the `:x` mark lives
  only in the aggregate identity computed once at run start, over the
  completed capture (decision 3, and step 4 of decision 1). Ticket 0133 probed
  it empirically and stopped the leg rather than force a test through a seam
  that does not exist; the hash-level half is 0113's identity-line test, and
  the two real behaviors are a mid-run strip faulting `EACCES` and a
  pre-validation strip refusing the run as not runnable.
- ~~**Cost warning:** capture touches invocation reading, run birth, hashing,
  prompt retention, status and failure cleanup, and the ratchet has 267
  lines of headroom. The build may force the ratchet conversation before it
  is done; better to have it at ticket-cutting time than mid-build.~~
  **It worked as intended.** The conversation happened at ticket-cutting
  time, not mid-build: the ceiling went to 7000 in the same commit that
  accepted this ADR and cut 0113–0119, sized from that queue. It was raised
  twice more afterwards, to 7150 when the closeout campaign was cut and to
  7250 mid-campaign when ticket 0134 landed at 7149 — that second one is the
  raise the warning's shape predicted, and `ratchet.mjs` now carries the
  sizing paragraph so the next one is argued rather than assumed.
