# Decisions — `gates.md`, `schema.md`, `gate.md`

*Historical (pre-ADR). Superseded by the specification and planning/adr/ as of 2026-07-31 — details below may contradict current truth (invariant numbers, command counts, identity format have all moved). Kept for the reasoning, not the rulings.*

Written 2026-07-30, splitting three elements out of `stage.md`, which was
carrying all of them at 280 lines.

## The decisions

**1. Four documents, not one.**
Options: one `gates.md` covering all three checks; three sibling documents with
no umbrella; an umbrella plus three. Chose the last. The three checks share the
send-back behavior, the retry budget, and the ordering — that is real shared
content and it needs one owner. Each check also has enough of its own to fill a
page. Cost: four files where a reader might expect one, and the umbrella has to
resist absorbing the details back.

**2. `gates.md` owns the retry budget and the send-back.**
Options: leave it in `stage.md`; duplicate it into all three check documents.
Chose the umbrella. It is the same behavior whichever check failed, and saying
it once is what makes that visible.

**3. `stage.md` keeps a summary table rather than a pointer.**
A bare "see gating" would make `stage.md` unreadable on its own, and `stage.md`
is the document people read first. Kept the order table and the retry sentence,
moved everything else. Cost: a small duplication that has to be kept in step.

**4. The order is cheapest-first and it is stated as a reason.**
Checklist, schema, gate. The argument written down is that a gate is never asked
about work whose checklist is unfinished. That is the honest reason — a gate can
cost a test run or a model call, and the other two cost nothing.

**5. `schema.md` as a template, kept as a first-class form.**
Options: drop it and require JSON or YAML for any structure; keep it as a
validated markdown grammar; keep it as an unvalidated template. Kept the
template. Most stages produce prose for a person to read, and a template lets
those stages be specific about form without pretending prose has a syntax. Cost:
a schema that does not check anything is a surprise, and the document has to say
so plainly rather than burying it.

**6. The gate reads a file, and the reason is written down.**
Options: pipe the output on stdin; pass the path; both. Chose the path as
argument one, with `$OUTPUT` also in the environment. A gate is written to
inspect — it re-reads, it seeks, it hands the path to a linter or a test runner
— and a stream forces every gate author to spool to a temporary file first.

**7. A section on how to write the failure message.**
Options: leave it as implementation advice; leave it out. Kept it. What a gate
prints is read by an agent that is about to try again, and the difference
between "validation failed" and a named repair is the difference between one
more round and three. This is the only place in the specification that tells an
author how to write something, and it earns that.

**8. `126` and `127` called out in `gate.md` as well as `runtime.md`.**
Deliberate duplication. A gate author reading only `gate.md` needs to know that
a bad shebang is not a verdict.

## Questions for Ian

- Should a stage be able to have more than one gate — `gate-tests.sh`,
  `gate-style.sh` — running in filename order? One gate per stage is simpler and
  a shell script can call two things. But two gates would let the record say
  which concern failed, and the current design makes an author collapse that.
- Does a `schema.md` template need any enforcement at all, or is a gate the only
  answer? Right now an agent can ignore the template entirely and nothing
  notices unless the author wrote a gate.

## Follow up

- Whether a skipped checklist item requires a reason is still open
  (`checklist.md`).
- Nothing says what happens when a gate itself times out, as opposed to failing.
- The JSON Schema dialect is unnamed. `schema.json` says "validated against the
  schema" without saying which schema language, which a runtime author cannot
  implement from.
