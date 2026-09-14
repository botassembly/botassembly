# Bot specification and runtime plan

Updated 2026-09-14. This is the current planning entry point. The specification states today's contract. Tickets describe selected changes. Completion records preserve finished work.

## Direction

Build a readable assembly format and a dependable command-line runtime. Bot runs trusted assembly programs with the operator's authority. The operating system owns containment. Linux and macOS are the native targets. Windows uses WSL.

The [trusted execution and completion decision](decisions/2026-09-13-trusted-execution-and-completion-plan.md) supersedes the earlier alpha countdown. The [Pi boundary](adr/0030-pi-model-runtime-boundary.md), [record publication decision](decisions/public-run-records.md), and completed ticket records retain every compatible ruling.

## Work sequence

Every selected implementation ticket is complete, and the release rule now applies. Tickets 0270 and 0272 through 0285 completed the fifteen outcomes this plan selected. Three independent reviews on 2026-09-14 (recent work, specification, documentation site; reports in `notes/2026-09-14-review-*.md`) inserted two repair outcomes ahead of the planned pair, and Ian pulled the documentation review forward the same day and widened it into a full rewrite for first-time readers. The [sequence decision](decisions/2026-09-13-evidence-based-completion-sequence.md) consolidated overlapping qualification after independent review. The count was a forecast, not a quota. Shape one reviewed ready ticket when a new outcome is selected. Keep no draft or calendar-hold queue.

1. **Completed in ticket 0270:** commands that need no model load no Pi model runtime.
2. **Completed in ticket 0272:** one pinned repository scanner covers the working directory and available Git history in local and hosted checks; the custom production machinery is deleted.
3. **Completed in ticket 0273:** authored `access`, command-name filtering, denial events, and their public claims are gone; older records remain readable.
4. **Completed in ticket 0274:** an unavailable subflow is refused before Bot expands, reads, hashes, or retains its file input; no path confinement was added.
5. **Completed in ticket 0275:** documentation deployment requires the complete same-commit check, and every checked-in site input triggers the workflow. Later platform checks remain behind the same dependency.
6. **Completed in ticket 0276:** request ingestion has one 4 MiB limit, fresh and resumed refusals precede run birth, and ordinary command output settles with honest pipe and delivery status while raw inspection keeps its fixed-extent path.
7. **Completed in ticket 0277:** existing Pi authentication and command-capable model configuration used by an operation must be effective-user-owned private real files; ordinary environment inheritance and recognized provider credential scrubbing remain.
8. **Completed in ticket 0278:** run summaries total verified root and authorized-descendant tokens with an evidence status, preserve exact timestamps, and reject early endings.
9. **Completed in ticket 0279:** assembly checking admits authored descent depths 1 through 11, retains the separate ten-call mixed-flow ceiling, and describes each statically reachable flow definition and node once with resolved options and honest dynamic limits.
10. **Completed in ticket 0280:** permanent Linux and macOS checks cover installation, cleanup, signals, locking, requests, output pipes, and examples. Native Windows refuses with WSL guidance. Actual WSL clean-clone qualification belongs to the release candidate and sends failures back to implementation.
11. **Completed in ticket 0281:** repair the runtime defects the 2026-09-14 code review confirmed: one request ceiling on write and read-back, honest multi-input check rows, choice rendering, dead lint overrides with a mechanical check, and dead parameters. Performance findings M7 and L11 stay in the review note until a real consumer is hurt.
12. **Completed in ticket 0282:** align the specification with the runtime: twelve contradictions, the structured error vocabulary, exit codes, unspecified options and bounds, the `model-unresolved` conformance case, stale witnesses, and the version statement. The specification describes the runtime except where the ticket names a small runtime fix.
13. **Completed in ticket 0283:** make missing or unavailable model failures actionable without claiming that a local catalog miss proves provider retirement or global unavailability.
14. **Completed in ticket 0284:** rewrite the public documentation site for a first-time user, adopting the reviewed page structure, removing the eleven confirmed inaccuracies, and testing example transcripts against real output. Preserve historical provenance and the existing biomedical vocabulary guard. Its accuracy pass rebases onto 0283.
15. **Completed in ticket 0285:** verify documentation accuracy against landed behavior and pin every example transcript to real output. Depends on 0283.
16. **Completed in ticket 0286:** provider error reports redact credential values this run supplied through recognized environment names before they reach stderr, the JSON envelope, or the record.
17. **Completed in ticket 0287:** reduce the local gate's machine load without removing any proof: coverage moves to its own target, workers are capped, buffer assertions stop deep-comparing megabytes, and duplicate tests merge.
18. **Completed in ticket 0288:** pin the credential registry to Pi's own provider sources with a scanning test, so a Pi upgrade that adds, renames, or removes a credential environment name fails the gate instead of drifting silently. Eight authentication inputs Pi reads join the non-secret list. Closes the limit record 0286 left open.
19. **Completed in ticket 0289:** hold every operation in `CLI_CONTRACTS` to an importable counterpart with a contract test, comparing `run.session` live and carrying the rest in two checked in allowlists that a counterpart map forces to shrink. Requirement L4, the structured refusal comparison, is deferred to the export tickets below.
20. **Completed in ticket 0290:** the credential advisory about the retired store now prints only from `bot auth list`, `bot auth login`, and `bot auth logout`, exactly once; `bot run start`, `bot run resume`, and `bot model list` write nothing to stderr on success. Closes the seventh issue in the 2026-09-14 admin surface and library requirements note.
21. **Completed in ticket 0291:** export `run.list`, `run.show`, and `run.record` through the new `run-readings` package door and retire `inspectRuns` and `inspectShow` as public. Turns three of the fifteen read-only operations in the 0289 contract test green.
22. **Completed in ticket 0292:** add a `wsl` job to `.github/workflows/runtime.yml`, triggered by manual dispatch and `v*` tag pushes, that installs WSL2 on a hosted Windows runner, clones the exact dispatched commit inside the distribution's own filesystem, and runs `make -C bot install` then `make platformcheck` as a non-root user; widen `sdlc/scripts/platformcheck`'s comment to name the Linux, macOS, and WSL legs.
23. **Planned:** admit the nine mutating operations to the export door under Ian's child-process ruling, and replace the internals assertion at `importable-readers.test.ts:60` with one that names what stays private.
24. **Planned:** declare `types` and the compatibility rule for every export path in `bot/package.json`.
25. **Completed in ticket 0293:** pin the specification's operation inventory sentence to `CLI_CONTRACTS` with a test that checks both directions, and add the missing `auth.import`.
26. **Completed in ticket 0294:** report the assembly hash in `bot assembly check` and as a field of `bot assembly list`.
27. **Planned:** report the configuration file, runs directory, cache directory, and authentication file paths in `bot home show`.
28. **Planned:** add one read-only operation that lists the home's intelligence table.
29. **Planned:** add `bot run search` over a home's session files, spawning ripgrep or grep.
30. **Planned:** make `bot run resume` inherit the donor's recorded command-rung intelligence.
31. **Completed in ticket 0295:** export `run.output` and `run.request` through the `run-readings` door ticket 0291 opened, by driving their handlers with a collecting boundary, so `copySelected` stays module-private and the exported reading returns the command's own bytes.

Each ticket receives independent design review, red-green implementation where behavior changes, independent code review, focused verification, and the appropriate complete gate. Commit and push each complete ticket before closing it. A split requires a newly observed independent defect and becomes a ready ticket, never a draft.

## Issue reconciliation

The 13 issue files retained on 2026-09-12 are resolved into the sequence above or closed now.

- Installation-clone cleanup and subflow signal-cleanup observations join outcome 10. Repeated Linux and macOS stress decides whether code needs repair.
- Missing subflow stages in assembly-check output becomes outcome 9.
- The whole-site assessment, public examples assessment, and conformance source paragraph become outcome 12.
- The unexplained provider stall closes because one occurrence cannot support a safe timeout.
- Optimizer bundle pinning, provider account identity, cross-tool credential importing, richer corpus explorer fields, optional empty frontmatter, Bash side-effect enforcement, and browser checking close because no current consumer or honest runtime boundary supports them.

Git retains every original observation and disposition. A recurrence or real consumer can establish a new issue with new evidence.

Ruled by Ian, 2026-09-14: a whole-run spending ceiling is not a Bot feature. The issue filed that day closes. Per-stage limits stay as they are.

## Current boundaries

- Pi source under `~/foss/pi` is reference material only. Bot does not patch, wrap, or publish Pi.
- Bot keeps ordinary Pi tools available. Hooks, gates, model tools, and subprocesses use the operator's authority.
- Pi sessions and Bot records may contain prompts, tool arguments, tool results, and other sensitive data. They stay local unless a person deliberately publishes reviewed synthetic evidence.
- Pattern scanning cannot establish the absence of secrets.
- npm publication, native Windows, built-in containment, and a reused-session choice remain outside the selected work.

## Release rule

Create no release ticket until every selected implementation ticket has a completion record, the issue and draft directories carry no work, local and hosted checks pass, and main matches origin. The one release ticket then qualifies an exact clean-clone commit on Linux, macOS, and WSL, exercises one generic live run, checks dependencies and licenses, and retains only secret-free summaries. Publishing `v0.1.0` still requires Ian's final authorization.
