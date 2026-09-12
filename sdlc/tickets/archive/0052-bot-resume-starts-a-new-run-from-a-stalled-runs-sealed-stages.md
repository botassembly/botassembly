---
flow: build
priority: 6
---
# bot resume starts a new run from a stalled run's sealed stages

Today the capability is a flag: `bot run --continue RUN review/change
"request"` starts a new run, verifies the dead donor's sealed stage
outputs against their recorded hashes, copies them in, and runs the
rest fresh. The caller must retype the assembly and the request even
though every retyped value must byte-match the donor's record — the
retyping can only ever cause a refusal. The word is also wrong: the
donor is never resumed, woken, or touched, and "continue" promises
that it is.

Ruled (Ian, 2026-08-19): the surface is a verb. `bot resume RUN`
derives the assembly, flow, and request from the donor's record and
accepts only what may legitimately differ — `--home`, `--in`,
declared slot paths, `--id-file`. `--continue` is removed, not
aliased; one operation, one name.

Scope ruled down at the same time: only plain top-level stages of
the flow are carried. A completed container — `LOOP`, `CHOOSE`,
`PARALLEL` — is never carried; fresh work restarts at the first
container at or after the break. This re-pays some finished work
inside containers in exchange for removing the container-matching
logic, where three of the four known continuation defects live.

Done, observably:

- `bot resume RUN` on a dead donor with sealed top-level stages
  starts a new run, emits `stage_carried` for each carried stage,
  hands the first fresh stage the copied outputs under the names a
  clean flow would use, and proceeds normally — hooks, checks, and
  retries on fresh stages exactly as in a first run; nothing re-runs
  for carried stages.
- Resuming a run that was itself resumed carries the earlier carried
  stages too. Today `stage_carried` events are never matched, so a
  second resume silently re-runs everything.
- A flowless (bare-assembly) donor resumes. Today it is always
  refused with "the assembly changed since that run", falsely: the
  donor's record omits `flow` while the synthetic flow is named
  `assembly`, so the comparison never passes.
- A resumed run's subflow children execute their whole flows from
  their own requests. Today the parent's carried-prefix state (its
  skip count and donor sources) leaks into every child invocation
  and can return the parent's donor output as a child's answer.
- A live donor, unknown donor, ambiguous prefix, changed assembly,
  or unreadable record refuses naming RUN, before the new run has a
  record — as the flag does today.
- The new run's own just-created directory never joins the donor
  matching (today `bot/src/run.ts:237` lets the newborn directory
  pollute the candidate set).

Settled choices:

- The record's field names do not change (`continued_from`,
  `stage_carried`, `from`). Sealed history already carries them and
  a reader of old and new records should not need two vocabularies.
  Only the CLI surface renames.
- The spec's continuing section (invocation.md) is rewritten for the
  verb, and the phrase "checked again" is replaced with hash
  verification wording — carried stages re-run no checklist, schema,
  gate, or hook, and the current sentence reads as if they do.
- Nothing in the factory or sdlc scripts invokes `--continue`
  (checked 2026-08-19), so there is no consumer ticket. Help and
  usage text ride along.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/run-continuation.test.ts` and `bot/tests/cli.test.ts`
pin the flag surface and container carrying. Restatement is
authorized in those two files, bounded: invocation-surface
assertions restate from `bot run --continue RUN target request` to
`bot resume RUN`, and container-carry assertions restate to the
fresh-restart behavior above. The guarantees on hash verification,
donor immutability, and the `stage_carried` event shape keep full
strength.

## Addendum 2026-08-20 (operator)

The first attempt was refused at code review: commit `e220009` changed conformance fixtures the ticket never named. That refusal is correct, but the unnamed files are a symptom, not the defect. The attempt misread one bullet above, and the branch was cleared rather than continued.

"A flowless (bare-assembly) donor" means **a run invoked with no flow selected**, not an assembly folder missing its `flows/` directory. `bot/src/run.ts:46` builds a synthetic flow named `assembly` for that invocation. `bot/src/continuation.ts:160` then compares `start["flow"]`, which the donor's record omits, against `input.flow.name`, which is `"assembly"` — so the comparison can never pass and the resume refuses with "the assembly changed since that run". That comparison is where the fix belongs.

An assembly with no `flows/` directory is refused at read time by `bot/src/assembly.ts:69`, and `specification/elements/assembly.md:18` states the rule: "An assembly holds `ASSEMBLY.md` and `flows/`; without either it is not one." That refusal stands. `specification/conformance/refuse/assembly-incomplete` keeps its name and its verdict, and `bot/tests/conformance-passing.txt` keeps that line. Making `flows/` optional would change what an assembly is, which is a different ticket than this one.

No files are added to the restatement authorization. `bot/tests/run-continuation.test.ts` and `bot/tests/cli.test.ts` remain the only two, on the terms stated above.
