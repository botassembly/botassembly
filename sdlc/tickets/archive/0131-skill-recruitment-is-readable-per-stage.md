---
flow: build
priority: 5
---
# Skill recruitment is readable per stage

Assemblies lend skills to stages — the assembly model carries
`skills/`, stages carry their own, and the flattening is resolved
at run time — but the record never names which skills a stage
actually received. Materialized skill paths surface incidentally in
scratch receipts; nothing answers, after a run, "which skills did
this session recruit" — a first-class question in the
harness-contract standard (deck's coverage doc,
`repos/deck/sdlc/planning/harness-contract-coverage.md`).

Done looks like: for any stage attempt, a reader answers which
skills the stage was lent — names and their source (assembly-root
or stage-local) — from the record or the run's artifacts. The
runtime resolves the lent set at dispatch time; recording it where
the attempt begins is the natural shape, and it joins the existing
inspection readings rather than a new verb.

Hard choices, settled: recruitment means the lent set, not usage —
whether the model *invoked* a skill is the session transcript's
story, and this ticket does not parse sessions for it (that
boundary belongs to the session readers); old runs predate the
recording and say so; default text outputs unchanged, new facts
ride `--json`.

Consumer: deck's run and session pages (their tickets, not gated on
this one — the pages render what exists and gain the section when
this lands).
