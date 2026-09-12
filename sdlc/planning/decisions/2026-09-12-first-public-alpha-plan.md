# First public alpha plan

Decided 2026-09-12. Ian asked for the work required before Bot Assembly becomes an official first public alpha and directed the project to resolve every draft rather than leave speculative work parked there.

## Release definition

The first advertised alpha will be `0.1.0`. Ian's 2026-09-12 direction to prepare the official `0.1` first alpha supersedes ADR 0029's choice of `0.0.1`. The release will be a source release installed from a Git clone. The package remains private. npm publication needs a separate distribution design and does not block this release.

The alpha supports trusted assemblies on Linux with the Node versions the release gate proves. Bot does not claim operating-system containment. The safe default still limits what a model can do unless an author explicitly grants more authority.

Ian can overturn the `0.1.0` identity before the release ticket publishes a tag. The existing source-only distribution ruling remains accepted. npm publication would add package naming, contents, license, provenance, installation, and upgrade work.

## Release blockers

Work proceeds in this order. Each numbered outcome gets its own reviewed ticket. A later ticket depends only on an earlier outcome that it actually needs.

1. **Keep tests out of operator authentication.** Every test supplies a private temporary Pi agent directory and authentication path. A mechanical guard makes access to the operator's real home or configuration fail.
2. **Reconcile the issue ledger.** Classify all 34 issue files from current landed evidence. Run a focused reproduction only where the disposition remains uncertain. Archive fixed or stale findings. Preserve observation windows for intermittent failures. Record accepted risks. Defer supported later work with a reason. Promote each confirmed release defect separately. The release has no unclassified issue.
3. **Restore the complete gate.** Repair the missing specification link and make the root and hosted `make check` run `sdlc/scripts/spec`. A mutation proves that a broken specification link or record vocabulary fails the complete gate.
4. **Remove runtime-derived public evidence.** Remove the transformed checked event record, README and blog excerpts derived from it, and the walkthrough generator's dependency on it. Documentation may use a clearly synthetic fixture. The public-tree boundary rejects known run paths, session basenames, and recognizable record or session structures outside reviewed synthetic fixtures. Review establishes fixture provenance because arbitrary bytes cannot prove where they came from. The site build passes without the removed record.
5. **Detect known secrets before publication.** A pinned local and hosted check scans the tracked tree and proposed changes. Reviewed exceptions admit intentional test values. Planted provider credentials fail. The documentation states that pattern detection cannot prove the absence of arbitrary secrets.
6. **Make ordinary-stage authority explicit.** Every `STAGE` declares `access`. An empty declaration denies read, write, edit, and Bash while leaving its declared control tools governed by their existing rules. Missing access fails assembly checking. Examples, smoke assemblies, the specification, and conformance cases state the exact grants they need.
7. **Give model-backed choices explicit authority.** A `CHOOSE` body cannot receive unrestricted file and Bash tools merely because the stage-only access key does not apply to it. The format and runtime define its narrow tool set and prove that undeclared file and command calls cannot dispatch.
8. **Confine model-selected subflow file input.** A model-supplied `input-file` must pass the caller's declared read boundary before Bot reads it. Absolute and linked paths outside the admitted slots fail without exposing their contents.
9. **Give Bot-created assembly processes a minimal starting environment.** Agent commands, hooks, and gates start with a defined minimum plus slots and explicitly declared values. They do not inherit the caller environment minus a list of recognized names. Descendants inherit that starting environment unless their trusted parent changes it. Tests plant known provider names and unrelated secret names across every Bot-created assembly process. Pi authentication commands remain a separate operator-configuration path.
10. **Settle executable Pi configuration privacy.** The recommended choice requires command-capable `models.json` to be a current-owner regular file under a private directory, with mode `0600`, no symbolic link, and no group write. Unsafe configuration refuses before command execution. This reverses ADR 0030's accepted owner-controlled link and group boundary, so implementation waits for Ian's choice recorded below.
11. **Report the whole run's consumption.** Run totals include every authorized child record. Readers either report the complete total or label a partial total without implying whole-run cost.
12. **Align FANOUT options.** The parser, resolved check reading, specification, documentation, and conformance cases agree on which options a fan-out accepts and how children inherit them.
13. **Align descent depth.** Authored `max-depth` cannot exceed the runtime call-chain ceiling. Checking names the supported maximum and conformance proves the boundary.
14. **Qualify current authentication and model selection.** One documented Pi 0.85.1 authentication and model path completes a small run from a clean home. Missing, retired, and deliberately unlisted models give actionable failures. The project promises only the paths this qualification proves.
15. **Bind publication to the complete gate.** Documentation changes and every input consumed by the site, including `examples/`, trigger the build. Deployment cannot outrun a failing runtime or specification gate. The supported Node claim matches the tested Node matrix.
16. **Publish the security and concurrency contract.** The guide states the trust placed in assemblies, models, allowed commands, hooks, gates, plaintext Pi authentication, retained sessions, run locking, stale-lock recovery, and the absence of whole-run cost, time, and disk limits. It includes a tested isolated-run recipe.
17. **Prepare the exact release candidate.** Align the package, specification, documentation, changelog, release notes, and source installation instructions on `0.1.0`, its support boundary, and an immutable tag or commit. Record the candidate commit and tool versions before qualification.
18. **Qualify the exact release candidate.** From a clean clone of that commit, private home, minimal environment, and isolated authentication: install Bot, follow the first-assembly guide, check all four examples, run the live ladder, deliberately break one validator and see the ladder fail, restore it, and pass. A complex example must prove its child runs succeed. Run current dependency and bundled-license checks. Retain summaries and hosted links, never raw sessions. Any candidate change repeats every affected qualification.
19. **Publish `0.1.0`.** Require a clean tree, no release blockers, and green local, hosted, clean-clone, and live qualification on the recorded release commit. Create the annotated `v0.1.0` tag on that exact commit and publish its GitHub release. Outward publication still requires Ian's final authorization.

Tickets 6 through 9 intentionally break assemblies that relied on ambient authority. These changes belong before the first advertised compatibility point. Ian can overturn them. The alternative keeps current assemblies working and leaves prompt-injected stages able to discover unrelated credentials. The recommendation is to accept all four changes.

Ticket 10 needs an explicit choice because ADR 0030 accepted the current Pi-compatible boundary:

- **Require private, non-linked `models.json` (recommended).** This closes the group-write and link paths into command execution. It can reject an operator's shared or linked Pi configuration and require a private copy.
- **Keep Pi's current compatibility boundary.** Existing shared and linked configuration keeps working. A group member or replaced owner-controlled target can change a command Bot later runs with the operator's authority.

The security cost of the compatibility choice is larger than the convenience of shared configuration before a first release. The plan recommends the private-file choice. Same-account command execution and path races remain accepted limits unless a later isolation design changes the mechanism.

## Draft disposition

- **0136, provider stall:** retain the observation as an issue, not an implementation draft. An independently observed recurrence, or a deterministic reproduction and proved cause, plus relevant completed-operation timing evidence can justify a new ticket. The single unexplained occurrence cannot support a safe liveness rule and does not block the alpha.
- **0208, retry and send-back reading:** close the draft. No caller needs the proposed fields. A future observed caller can establish a new ticket with the reading it needs.
- **0220, installation-storage contraction:** close the draft. The project has no concrete simplification to make. A future proposal must name the simplification, the guarantees it preserves, and any guarantee changes it proposes.

The draft directory will be empty after these dispositions. An observed unresolved defect belongs in `sdlc/issues/`. A selected and fully shaped change belongs in `sdlc/tickets/`. The project will not use drafts as indefinite storage.

## Accepted alpha limits

The following limits do not block `0.1.0` when the published security contract states them accurately:

- Pi stores authentication in plaintext files protected by operating-system ownership and permissions.
- An explicitly allowed command and its subprocesses use the operator's authority.
- Hooks and gates are trusted assembly programs.
- Sessions retain exact provider messages and tool output and stay local.
- Bot provides no built-in operating-system sandbox or whole-run cost, deadline, or disk quota.
- True credential separation, general process containment, npm publication, richer retry readings, speculative storage contraction, and an unproved provider-stall repair remain later work.

## Release gate

The release ticket may publish only when every blocker ticket is complete, every issue has a recorded disposition, and the recorded release commit passes the complete local, hosted, clean-clone, and live qualifications. Public evidence contains no runtime session, and the release notes state every accepted limit. The tag names that exact commit. Any failed condition keeps the tag unpublished.
