# Bot specification and runtime plan

Updated 2026-09-13. This is the current planning entry point. The specification states today's contract. Tickets describe selected changes. Completion records preserve finished work.

## Direction

Build a readable assembly format and a dependable command-line runtime. Bot runs trusted assembly programs with the operator's authority. The operating system owns containment. Linux and macOS are the native targets. Windows uses WSL.

The [trusted execution and completion decision](decisions/2026-09-13-trusted-execution-and-completion-plan.md) supersedes the earlier alpha countdown. The [Pi boundary](adr/0030-pi-model-runtime-boundary.md), [record publication decision](decisions/public-run-records.md), and completed ticket records retain every compatible ruling.

## Work sequence

Twelve implementation outcomes remain. Tickets 0270 and 0272 completed the first two outcomes. Shape each later outcome as one reviewed ready ticket when it becomes next. Keep no draft or calendar-hold queue.

1. **Completed in ticket 0270:** commands that need no model load no Pi model runtime.
2. **Completed in ticket 0272:** one pinned repository scanner covers the working directory and available Git history in local and hosted checks; the custom production machinery is deleted.
3. Remove authored `access`, command-name filtering, denial events, and their public claims. Preserve tolerant reading of older records.
4. Reject an unavailable subflow before reading or retaining its model-selected input file. Do not add path confinement.
5. Enforce private Pi authentication and command-capable model configuration. Preserve ordinary environment inheritance while removing recognized provider credential variables from Bot-created assembly processes.
6. Aggregate root and descendant token use. Every reading says whether its observed total is complete.
7. Render exact run-list timestamps and reject an ending earlier than its accepted start.
8. Admit authored descent depths 1 through 11 and refuse larger values while retaining the separate ten-call mixed-flow ceiling.
9. Make assembly checking describe every statically reachable flow and stage once, with resolved options and honest limits on dynamic execution order and count.
10. Bound non-seekable request input, stream seekable files and raw output with bounded memory, and prove ordinary command-line pipeline behavior including early-closing readers.
11. Qualify installation, process cleanup, signals, locking, and examples on Linux, macOS, and WSL. Native Windows refuses with WSL guidance.
12. Qualify one current authentication and model path from a clean home and make expected model failures actionable.
13. Bind documentation deployment to the complete check for the same commit and cover every site input.
14. Review all documentation and examples as a first-time user. Remove biomedical scenarios, internal work references, access claims, and unnecessary collections of provider-key examples. Publish the final trust, credential, record, concurrency, and platform boundaries.

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
