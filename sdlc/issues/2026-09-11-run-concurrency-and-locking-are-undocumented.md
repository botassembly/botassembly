# Run concurrency and locking are undocumented on the site

Observed on 2026-09-11 during a live review of the published site. A reader who
wants to know what happens when two runs start at once cannot find out.

## What is wrong

The runtime holds a run lock. `bot/src/run-lock.ts` exists and is used by
`bot/src/run.ts`, `bot/src/execution.ts`, `bot/src/subflow-runtime.ts`, and
`bot/src/model.ts`. Nothing on the site explains it. Grepping the whole
documentation tree for the behavior returns only three glancing mentions, none of
them a description of the rule:

- `docs/src/content/docs/reference/management.md:195` says liveness "means the run
  still holds its lock, which is a comparison of timestamps", and then warns this
  "is not a lock a person can lean on". It describes reading a lock, not taking one.
- `docs/src/content/docs/specification/record.md:82` names `run-lock` as one of four
  kinds of evidence that authorize removing a stopped run.
- `docs/src/content/docs/specification/slots-and-skills.md:53` mentions what
  "concurrent runs need" about worktrees, not about the home.

The home page states "concurrency has a width" under "What it is not", which a
reader will take to be the whole of the concurrency story. It is about stage
width inside one run, not about two runs.

## The unanswered questions

- Can two `bot run` invocations share one home at the same time?
- If they cannot, what does the second one print, and with which exit code?
- Is the lock per home, per assembly, or per run?
- What happens to the lock when a machine sleeps or a process is killed?
- Is a stale lock cleared automatically, or does a person clear it?

## Why a docs branch cannot fix it

The answers are behavior, not prose. Writing them down means reading
`bot/src/run-lock.ts` and its callers and then stating a contract the runtime is
held to, which belongs with the specification and the runtime, not with a site
copy pass. Documenting a guess would be worse than the silence.

## What a fix does

Settle the contract against `bot/src/run-lock.ts`, then give it a home: a section
in `specification/elements/` if it is normative, and a reference page or a
paragraph in `docs/src/content/docs/reference/management.md` if it is runtime
behavior. Correct the home page line if "concurrency has a width" is read as
covering more than one run.

## Evidence

- `bot/src/run-lock.ts` and its four callers.
- The three site mentions listed above.
