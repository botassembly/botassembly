---
flow: build
priority: 1
deps: [0302]
---
# Qualify the 0.1.0 release candidate

## Outcome

One exact commit carries the `0.1.0` source-release identity and passes the complete local, package, documentation, dependency, license, Linux, macOS, WSL, and one-run live qualifications. The retained evidence is sufficient for Ian to decide whether to authorize an annotated `v0.1.0` tag and GitHub release. This ticket creates neither.

## Current facts

Observed at `f78074eb6634fd8d7d2b35c28f1024cc0c78e1c8`; `bot/src` is 20,266 nonblank lines.

- Main equals `origin/main`. Runtime run `35117769673` passed the complete check, coverage, Ubuntu, and macOS for this record commit. Ticket 0302's exact implementation commit also passed manually dispatched WSL, and its main runtime and documentation runs passed.
- Tickets 0270 and 0272 through 0302 have completion records. Before this ticket was created, `sdlc/tickets/`, `sdlc/issues/`, and `sdlc/tickets/drafts/` held no work, and the plan named no selected implementation outcome (`sdlc/planning/plan.md:13-48,72-74`). This ticket is now the only active ticket.
- The release rule requires one exact clean-clone commit on Linux, macOS, and WSL, one generic live run, dependency and license checks, and secret-free summaries. Publication of `v0.1.0` still needs Ian's authorization (`sdlc/planning/plan.md:72-74`).
- The runtime package and shrinkwrap still say `0.0.1` (`bot/package.json:4`; `bot/npm-shrinkwrap.json:3,9`). The specification and maintained public prose call `0.1.0` unreleased, and two public platform passages still call the final WSL qualification open (`specification/README.md:34-38`; `README.md:34,76,96`; `specification/elements/runtime.md:21-24`; `specification/elements/record.md:35`). ADR 0029 still carries the superseded `0.0.1`, Linux-only decision.
- The runtime workflow already supports manual dispatch. One dispatch checks the exact selected commit with the complete check and coverage on Ubuntu, native platform checks on Ubuntu and macOS, and a clean clone in WSL2 on its Linux filesystem (`.github/workflows/runtime.yml:3-100`). Ordinary pushes skip WSL.
- `make check` is offline. `make smoke` is a separate ten-run paid ladder. The current release rule asks for one generic live run, not that larger ladder (`Makefile:19-29`).
- The actual package test already proves the packed ESM runtime, declarations, dependency closure, installed command, scripted start and resume, and artifact allowlist. It does not judge dependency advisories or the licenses of the bundled closure. The site already carries the complete OFL notices for its self-hosted fonts.

## Scope

Prepare the source candidate without changing runtime behavior:

- set the Bot runtime package and its shrinkwrap root entries to `0.1.0`; leave the documentation build package's tooling version outside the runtime identity;
- replace current-facing unreleased and open-WSL candidate wording with timeless `0.1.0`, supported-platform, source-install, trust, retention, and pre-1.0 compatibility statements;
- mark ADR 0029 superseded where its version and platform decision conflicts with the later accepted decisions, while preserving the historical text;
- add a concise `0.1.0` release entry to the changelog. It must state the supported platforms, source installation, compatibility boundary, trust boundary, sensitive local records, lack of a run-wide budget, and the package's private and unpublished status. It must not read like an internal ticket log;
- add the smallest mechanical metadata and license checks that make the candidate facts repeatable. Reuse the actual packed artifact and lock graphs instead of maintaining a second dependency inventory.

Qualify that exact commit. A failed qualification blocks release readiness. A runtime, package, specification, documentation, dependency, license, or platform defect becomes a separate implementation issue and candidate change. Do not waive it inside a report.

Do not add a product feature, change an assembly or record contract, update a dependency, publish to npm, create or push a tag, create a GitHub release or draft release, change the Pages publication setting, announce the release, or alter provider authentication. Historical records, archived tickets, changelog history, and synthetic version-1 fixtures keep their historical version strings.

## Acceptance

1. Add a focused candidate-metadata test first. On the starting tree it fails for the current `0.0.1`, unreleased, open-WSL, and ADR facts. After the candidate edits it proves the Bot package, shrinkwrap, capabilities version source, specification, maintained public documentation, current changelog entry, and governing decision agree on `0.1.0`; current-facing prose has no stale open qualification. Its allowlist leaves historical and synthetic version strings alone.
2. Build and inspect the actual npm tarball. Its manifest says `0.1.0`; the existing package tests still prove all seven exports, the bin, exact declarations, private subpaths, offline install, scripted start and resume, shrinkwrap provenance, and the complete bundled dependency closure. No registry publication occurs.
3. Derive a deterministic license inventory from the actual tarball and the two exact lock graphs. Every bundled package has a declared license expression and its required license or notice text in the artifact. The repository MIT license and the checked-in font notices remain present. Record each distinct expression and any manual compatibility conclusion; a missing, unknown, or incompatible redistribution term blocks the candidate. Do not describe this review as legal advice.
4. With network access used only for advisory metadata, `npm audit --omit=dev --json` reports zero production vulnerabilities for `bot/` and `docs/`. Retain package counts and severity totals only. Never retain registry credentials or full machine paths.
5. In a clean Linux clone of the exact candidate, using Node 22.22.3 and npm 10.9.8, run `sh sdlc/scripts/install`, `make check`, `make -C bot coverage`, `make installcheck`, `make platformcheck`, and the documentation build after `npm -C docs ci`. All pass. Run one broad repository gate at a time. The clone begins clean; generated output is ignored or removed, and no tracked change remains.
6. Push the exact candidate and manually dispatch `.github/workflows/runtime.yml` at its branch. Confirm the run's head SHA equals the candidate. The complete check, coverage, Ubuntu platform, macOS platform, and WSL jobs all pass. WSL must perform its existing exact-SHA clean clone on the distribution's own filesystem. A skipped or cancelled required job is not passage.
7. After explicit authorization for one paid provider call, use a fresh private scratch home and a clean clone of the same candidate for one generic shipped example. Supply any credential only through process input or environment. Install from the clone, follow the maintained setup path, run one model-backed request to completion, and read its structured result and retained ending. The summary records the candidate SHA, Node and npm versions, example, provider and model names, exit, terminal cause, and whether checks passed. It retains no request, answer, session, record, run identifier, home path, account identifier, credential, credential-derived value, or raw provider output. Remove the scratch home after the summary. If authorization is absent, the ticket remains open rather than substituting a scripted model.
8. An independent code reviewer accepts the exact candidate and the qualification method. Any candidate-tree change after review repeats code review and every proof it can affect. Every runtime, package, specification, documentation, or release-note change creates a new candidate and repeats items 2 through 7. A test-only qualification repair repeats its focused proof, the complete local gate, and the exact-SHA hosted dispatch.
9. After the candidate passes, fast-forward that exact commit to main and wait for the main runtime and documentation workflows. Archive this ticket and add one append-only completion record in a later process-only commit. The record names the qualified candidate SHA, review verdict, commands, tool versions, audit totals, license expressions, hosted run links, and the redacted live summary. It names the candidate commit, not the record commit, as the only possible tag target.
10. Push the record commit and confirm Bot Assembly main equals origin, the active-ticket, issue, and draft directories carry no work, the selected implementation queue remains empty, the worktree is clean, and the record commit's runtime check passes. Report the evidence and ask Ian whether to authorize publication. Stop there. Do not create `v0.1.0`, a GitHub release, an npm publication, or an announcement under this ticket without a new explicit authorization.

## Dependencies

Ticket 0302 is landed and recorded. Main and the 0302 implementation have the hosted evidence named above. The queue preconditions were met before this ticket was created. The only unresolved dependency is explicit authorization for the single paid live-provider run; release publication requires a separate later authorization.

## Size decision

- Starting production size: 20266 nonblank lines
- Ending production size: 20266 nonblank lines
- Simpler approach tried: qualify the current commit without aligning its runtime version and open release prose, or keep dependency and license review as an unrepeatable terminal transcript.
- Why insufficient alternatives were rejected: the current package identifies itself as `0.0.1`, public pages still say the required WSL proof is open, and terminal-only inspection cannot show that the actual bundled artifact carried the reviewed dependency and license set.
- Production code deleted: none. This ticket changes release metadata, public prose, tests, and qualification evidence only.
- Accepted cost: the repository gains a small repeatable release-metadata and license check, and the candidate pays one clean-clone platform dispatch, two production advisory queries, and one explicitly authorized live run. No new runtime dependency or production line is accepted.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: none
- Final level: 4
- Reasons: this ticket fixes a public version and support statement across package, specification, documentation, source installation, and release notes. Proof spans an exact commit, two native platforms, WSL, a packed dependency closure, external advisory data, licenses, and one paid live call. A false green can support an immutable public tag and misleading compatibility or platform claims. The current plan requires one final qualification ticket, so splitting preparation from qualification would create two candidates and lose the exact-commit claim.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. An independent `gpt-5.6-sol` agent with medium reasoning reviews every code and remediation pass.

Re-score if qualification discovers a runtime defect, dependency change, new publication channel, credential migration, license replacement, or support promise beyond Linux, macOS, WSL, Node 22.22 or newer, and the current pre-1.0 boundary.

## Reversible decisions

Before a tag exists, the candidate version prose, changelog placement, qualification script shape, and evidence summary format can change through a new candidate and repeated proof. Ian can choose a different first-release version or decline publication. The source-install, private-package, platform, trusted-execution, local-record, and pre-1.0 boundaries remain the governing accepted decisions unless he explicitly overturns them.

## Rollback and failure

No release object exists to roll back. A failure leaves the candidate untagged and the ticket open. Revert a faulty candidate change or file a narrow implementation issue, then create and qualify a new exact candidate. Never edit a failing summary into a passing one, accept an advisory or license gap silently, reuse evidence from a different SHA, or expose live-run artifacts to explain a failure.

## Review

- Origin: the release rule in `sdlc/planning/plan.md:72-74`, the completion ruling in `sdlc/planning/decisions/2026-09-13-trusted-execution-and-completion-plan.md:19-23`, and the current handoff in `sdlc/planning/notes/2026-09-14-handoff-admin-surface.md:9-15`.
- Design review: pending
- Code review: pending
