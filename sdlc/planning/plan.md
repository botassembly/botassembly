# Bot specification and runtime plan

Updated 2026-09-13. This is the current planning entry point. The specification states today's contract. Tickets describe selected changes. Completion records preserve finished work.

## Direction

Build a readable assembly format and a dependable command-line runtime. Bot runs trusted assembly programs with the operator's authority. The operating system owns containment. Linux and macOS are the native targets. Windows uses WSL.

The [trusted execution and completion decision](decisions/2026-09-13-trusted-execution-and-completion-plan.md) supersedes the earlier alpha countdown. The [Pi boundary](adr/0030-pi-model-runtime-boundary.md), [record publication decision](decisions/public-run-records.md), and completed ticket records retain every compatible ruling.

## Work sequence

Six implementation outcomes remain. Tickets 0270, 0272, 0273, 0274, 0275, and 0276 completed the first six outcomes. The [evidence-based sequence decision](decisions/2026-09-13-evidence-based-completion-sequence.md) consolidated overlapping qualification work after independent inventory and extra-eyes review. This count is a forecast, not a quota. Shape each later outcome as one reviewed ready ticket when it becomes next. Keep no draft or calendar-hold queue.

1. **Completed in ticket 0270:** commands that need no model load no Pi model runtime.
2. **Completed in ticket 0272:** one pinned repository scanner covers the working directory and available Git history in local and hosted checks; the custom production machinery is deleted.
3. **Completed in ticket 0273:** authored `access`, command-name filtering, denial events, and their public claims are gone; older records remain readable.
4. **Completed in ticket 0274:** an unavailable subflow is refused before Bot expands, reads, hashes, or retains its file input; no path confinement was added.
5. **Completed in ticket 0275:** documentation deployment requires the complete same-commit check, and every checked-in site input triggers the workflow. Later platform checks remain behind the same dependency.
6. **Completed in ticket 0276:** request ingestion has one 4 MiB limit, fresh and resumed refusals precede run birth, and ordinary command output settles with honest pipe and delivery status while raw inspection keeps its fixed-extent path.
7. Enforce private Pi authentication and command-capable model configuration. Preserve ordinary environment inheritance while removing recognized provider credential variables from Bot-created assembly processes.
8. Make run summaries truthful: aggregate verified root and descendant token use with an explicit complete or partial label, render exact timestamps, and reject an ending earlier than its accepted start.
9. Align assembly checking: admit authored descent depths 1 through 11, retain the separate ten-call mixed-flow ceiling, and describe each statically reachable flow definition and stage once with resolved options and honest dynamic limits.
10. Establish permanent Linux and macOS checks for installation, cleanup, signals, locking, and examples. Native Windows refuses with WSL guidance. Actual WSL clean-clone qualification belongs to the release candidate and sends failures back to implementation.
11. Make missing or unavailable model failures actionable without claiming that a local catalog miss proves provider retirement or global unavailability.
12. Review current public documentation and examples as a first-time user after behavior settles. Preserve historical provenance and the existing biomedical vocabulary guard while removing confirmed stale references and inaccurate current claims.

Each ticket receives independent design review, red-green implementation where behavior changes, independent code review, focused verification, and the appropriate complete gate. Commit and push each complete ticket before closing it. A split requires a newly observed independent defect and becomes a ready ticket, never a draft.

## Issue reconciliation

The 13 issue files retained on 2026-09-12 are resolved into the sequence above or closed now.

- Installation-clone cleanup and subflow signal-cleanup observations join outcome 11. Repeated Linux and macOS stress decides whether code needs repair.
- Missing subflow stages in assembly-check output becomes outcome 9.
- The whole-site assessment, public examples assessment, and conformance source paragraph become outcome 14.
- The unexplained provider stall closes because one occurrence cannot support a safe timeout.
- Optimizer bundle pinning, provider account identity, cross-tool credential importing, richer corpus explorer fields, optional empty frontmatter, Bash side-effect enforcement, and browser checking close because no current consumer or honest runtime boundary supports them.

Git retains every original observation and disposition. A recurrence or real consumer can establish a new issue with new evidence.

## Current boundaries

- Pi source under `~/foss/pi` is reference material only. Bot does not patch, wrap, or publish Pi.
- Bot keeps ordinary Pi tools available. Hooks, gates, model tools, and subprocesses use the operator's authority.
- Pi sessions and Bot records may contain prompts, tool arguments, tool results, and other sensitive data. They stay local unless a person deliberately publishes reviewed synthetic evidence.
- Pattern scanning cannot establish the absence of secrets.
- npm publication, native Windows, built-in containment, and a reused-session choice remain outside the selected work.

## Release rule

Create no release ticket until every selected implementation ticket has a completion record, the issue and draft directories carry no work, local and hosted checks pass, and main matches origin. The one release ticket then qualifies an exact clean-clone commit on Linux, macOS, and WSL, exercises one generic live run, checks dependencies and licenses, and retains only secret-free summaries. Publishing `v0.1.0` still requires Ian's final authorization.
