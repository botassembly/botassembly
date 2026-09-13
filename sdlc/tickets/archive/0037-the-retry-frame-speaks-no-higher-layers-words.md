---
flow: build
priority: 8
---
# The retry frame speaks no higher layer's words

A consumer project's first day, and the sharpest catch in their report: the
gate-retry frame reads "Fix the cause and commit, then rewrite
your output. If the cause is outside the ticket's scope, say so
plainly instead of retrying." Two layer leaks in one sentence —
"commit" assumes software development in a repository, "ticket"
assumes a work queue; the runtime is specified to know neither.
Consequence observed: a clinical-trial curation agent, told to
commit, ran `git add`/`git commit` in the caller's repository
and landed a 1,267-line working file as a commit authored as
Ian. (Ian removed it; it never pushed.)

The replacement, verbatim from the trials review, loses nothing:

> Your output did not pass review. Fix the cause, then rewrite
> your output. If the cause is outside what you were asked to
> do, say so plainly instead of retrying.

Three places agree with each other and change together:
`bot/src/prompt.ts` (the hardcoded frame),
`specification/elements/gate.md` (the specified frame), and
`bot/tests/cli-gate-folder-faults.test.ts` — named for
restatement in `design:`/`design-review:` commits.

Also in scope, same cause, docs only: the authoring guide
(`guides/`) gains a warning beside `--in` saying that omitting
it deliberately gives the agent the caller's directory — the
other half of how the stray commit happened.
