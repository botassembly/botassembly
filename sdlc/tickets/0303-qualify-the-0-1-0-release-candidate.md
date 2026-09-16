---
flow: build
priority: 1
deps: [0302]
---
# Qualify the 0.1.0 release candidate

## Outcome

One exact pre-publication commit proves the `0.1.0` package, dependency, license, and platform candidate while every maintained public page still says the release is pending. The work then stops for Ian. Only a later explicit authorization may create the release-facing commit, run its named live qualification, land prose that triggers Pages, and publish that exact commit. This design change creates or publishes none of those objects.

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

Phase A prepares a reversible pre-publication commit without changing runtime behavior:

- set the Bot runtime package and its shrinkwrap root entries to `0.1.0`; leave the documentation build package's tooling version outside the runtime identity;
- mark ADR 0029 superseded where its version and platform decision conflicts with the later accepted decisions, while preserving the historical text;
- add the smallest mechanical metadata and license checks that make the candidate facts repeatable. Reuse the actual packed artifact and lock graphs instead of maintaining a second dependency inventory.

Phase A deliberately keeps every maintained README, specification chapter, documentation page, and changelog release heading in its current unreleased state. Its commit may land on main because it makes no release claim and does not touch a documentation-workflow path. After its local and hosted proof passes, stop and bring Ian one explicit authorization request. The request must name the proposed built-in provider, model, and reasoning level; disclose that one Bot run may make multiple billed model turns because of retries, checks, or send-backs; and separately name the release-facing commit, automatic Pages deployment on main, annotated tag, and GitHub release that approval would permit.

Only after that authorization, Phase B creates the final release-facing commit. It replaces current-facing unreleased and open-WSL candidate wording with timeless `0.1.0`, supported-platform, source-install, trust, retention, and pre-1.0 compatibility statements. It adds a concise `0.1.0` changelog entry covering the supported platforms, source installation, compatibility boundary, trust boundary, sensitive local records, lack of a run-wide budget, and the package's private and unpublished status. It must not read like an internal ticket log. Phase B receives its own complete exact-SHA proof and the only live run.

A failed qualification blocks release readiness. A runtime, package, specification, documentation, dependency, license, or platform defect becomes a separate implementation issue and candidate change. Do not waive it inside a report.

Do not add a product feature, change an assembly or record contract, update a dependency, publish to npm, create a GitHub draft release, change the Pages publication setting, announce the release, or alter provider authentication. Before Ian's explicit Phase B authorization, do not create release-facing prose, run a paid model, land any documentation-workflow input, create or push a tag, or create a GitHub release. Historical records, archived tickets, changelog history, and synthetic version-1 fixtures keep their historical version strings.

## Acceptance

1. Add a focused two-phase metadata test first. On the starting tree its Phase A case fails for the current Bot package and shrinkwrap version. The green Phase A case proves the package, shrinkwrap, and capabilities version source agree on `0.1.0`, ADR 0029 is marked superseded, and every maintained public page and changelog release heading still states or preserves the unreleased boundary. Its Phase B case initially fails because release-facing prose and the `0.1.0` release entry do not exist. Historical and synthetic version strings remain on an explicit allowlist.
2. On Phase A's exact commit, build and inspect the actual npm tarball. Its manifest says `0.1.0`; the existing package tests still prove all seven exports, the bin, exact declarations, private subpaths, offline install, scripted start and resume, shrinkwrap provenance, and the complete bundled dependency closure. No registry publication occurs.
3. Derive a deterministic license inventory from that actual tarball and the two exact lock graphs. Every bundled package has a declared license expression and its required license or notice text in the artifact. The repository MIT license and the checked-in font notices remain present. Record each distinct expression and any manual compatibility conclusion; a missing, unknown, or incompatible redistribution term blocks the candidate. Do not describe this review as legal advice.
4. With network access used only for advisory metadata, `npm audit --omit=dev --json` reports zero production vulnerabilities for `bot/` and `docs/` at Phase A. Retain package counts and severity totals only. Never retain registry credentials or full machine paths.
5. In a clean Linux clone of the exact Phase A commit, using Node 22.22.3 and npm 10.9.8, run `sh sdlc/scripts/install`, `make check`, `make -C bot coverage`, `make installcheck`, `make platformcheck`, and the documentation build after `npm -C docs ci`. All pass. Run one broad repository gate at a time. The clone begins clean; generated output is ignored or removed, and no tracked change remains.
6. Push Phase A and manually dispatch `.github/workflows/runtime.yml` at its branch. Confirm the run's head SHA equals Phase A. The complete check, coverage, Ubuntu platform, macOS platform, and WSL jobs all pass. WSL performs its existing exact-SHA clean clone on the distribution's own filesystem. A skipped or cancelled required job is not passage. An independent code reviewer accepts Phase A and its qualification method. Then fast-forward Phase A to main and wait for the main runtime workflow. Phase A touches no `docs/**`, `specification/**`, `examples/**`, or documentation-workflow file, so this landing cannot invoke the Pages workflow.
7. Stop and ask Ian explicitly whether to authorize Phase B. Name the proposed built-in provider, model, and reasoning level. State that the one live Bot run can make multiple billed turns because a retry, failed check, or check send-back can call the model again. State that approval also permits the release-facing prose commit, its exact-SHA qualification, main's automatic Pages deployment, the annotated `v0.1.0` tag, and the GitHub release if and only if every gate passes. Separate any authority Ian withholds. Without the live-run and publication authorization, make no Phase B commit and leave this ticket open.
8. After authorization, create Phase B on Phase A. Change only the maintained release-facing README, specification, documentation, changelog, and their focused tests. Its metadata test proves those surfaces agree on `0.1.0`, name Linux and macOS as native and WSL as supported, retain the source-install, trust, sensitive-record, private-package, and pre-1.0 limits, and contain no stale unreleased or open-qualification claim. Keep Phase B on its branch until all proof passes; branch pushes do not deploy Pages.
9. Treat Phase B as the sole release commit and possible tag target. Re-run items 2 through 5 on its exact SHA, obtain independent code-review acceptance, and manually dispatch the runtime workflow at Phase B so complete check, coverage, Ubuntu, macOS, and WSL all pass at that SHA. Re-run both production audits and compare the package, lock, dependency, and license identities to Phase A. Any difference requires a fresh review rather than inherited evidence.
10. Run the single live qualification only at exact Phase B and only under the authorization from item 7. Make a clean scratch clone, a scratch `BINDIR`, a fresh `0700` `BOT_HOME`, and a separate fresh `0700` `PI_CODING_AGENT_DIR`. Install into the scratch `BINDIR`. Configure only the authorized built-in provider, model, and reasoning row in the scratch home. Do not create or read a `models.json`, `auth.json`, command-backed model, or operator home. Pass the credential only in the environment of the `bot run start` process. Never export it into the parent shell, print it, log it, hash it, place it in a command argument, write it to disk, or retain a derived value.
11. The live example passes only when `bot run start --json` exits `0`, returns a successful structured result, the retained run ending agrees that it succeeded, and every retained checklist and check fact passes. Record at most 2,048 UTF-8 bytes of nonsecret evidence: Phase B SHA, Node and npm versions, example name, authorized provider/model/reasoning names, exit, terminal cause, turn and retry counts, and checklist and check pass counts. Retain no request, answer, tool content, session, record, run identifier, absolute path, account identifier, credential, credential-derived value, or raw provider output. In success and failure paths remove the scratch clone, `BINDIR`, Bot home, Pi directory, and every other scratch path, then verify each is absent.
12. Any Phase B tree change after a proof or review invalidates that exact-SHA result. A prose, test, package, specification, workflow, example, or release-note change repeats the focused proof, clean-clone local suite, code review, exact-SHA hosted dispatch, dependency audits, and license identity check. A change to runtime, package, lock, example, live configuration, or live procedure also repeats the authorized live run. No evidence from Phase A makes a changed Phase B SHA green.
13. After all Phase B proof passes, fast-forward that exact commit to main. This main push intentionally invokes the documentation workflow and may deploy the release-facing site under the authorization from item 7. Confirm the main runtime and documentation workflows passed at Phase B, then create the annotated `v0.1.0` tag on Phase B and the GitHub release only within that same authorization. Do not publish npm or make a separate announcement.
14. Archive this ticket and add one append-only completion record in a later process-only commit. Delete `sdlc/planning/notes/2026-09-14-handoff-admin-surface.md` in that same commit because the sequence is then resolved. The record names Phase A and Phase B SHAs, both review verdicts, commands, tool versions, audit totals, license expressions, hosted run links, and the bounded live summary. Push it and confirm Bot Assembly main equals origin, all three work queues and the selected implementation queue are empty, the worktree is clean, and the record commit's runtime check passes.

## Dependencies

Ticket 0302 is landed and recorded. Main and the 0302 implementation have the hosted evidence named above. The queue preconditions were met before this ticket was created. Phase B depends on Ian explicitly authorizing the named live run, its possible multiple billed turns, the release-facing commit, automatic Pages deployment, annotated tag, and GitHub release. Phase A needs none of that authority.

## Size decision

- Starting production size: 20266 nonblank lines
- Ending production size: 20266 nonblank lines
- Simpler approach tried: qualify the current commit without aligning its runtime version and open release prose, or keep dependency and license review as an unrepeatable terminal transcript.
- Why insufficient alternatives were rejected: the current package identifies itself as `0.0.1`, public pages still say the required WSL proof is open, and terminal-only inspection cannot show that the actual bundled artifact carried the reviewed dependency and license set.
- Production code deleted: none. This ticket changes release metadata, public prose, tests, and qualification evidence only.
- Accepted cost: the repository gains a small repeatable release-metadata and license check. Phase A and Phase B each pay one clean-clone platform dispatch and two production advisory queries. Phase B pays one explicitly authorized live Bot run which may contain multiple billed model turns. No new runtime dependency or production line is accepted.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: none
- Final level: 4
- Reasons: this ticket fixes a public version and support statement across package, specification, documentation, source installation, and release notes. Proof spans an exact commit, two native platforms, WSL, a packed dependency closure, external advisory data, licenses, and one authorized live Bot run which may contain multiple billed model turns. A false green can support an immutable public tag and misleading compatibility or platform claims. The current plan requires one final qualification ticket, so splitting preparation from qualification would create two candidates and lose the exact-commit claim.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. An independent `gpt-5.6-sol` agent with medium reasoning reviews every code and remediation pass.

Re-score if qualification discovers a runtime defect, dependency change, new publication channel, credential migration, license replacement, or support promise beyond Linux, macOS, WSL, Node 22.22 or newer, and the current pre-1.0 boundary.

## Reversible decisions

Before Phase B lands, the package version, release prose, changelog placement, qualification script shape, and evidence summary format can change through a new candidate and repeated proof. Ian can choose a different first-release version, authorize the live run without publication, authorize publication later, or decline both. The source-install, private-package, platform, trusted-execution, local-record, and pre-1.0 boundaries remain the governing accepted decisions unless he explicitly overturns them.

## Rollback and failure

Before Phase B publication, no release object exists to roll back. A failure leaves the candidate untagged and the ticket open. Revert a faulty candidate change or file a narrow implementation issue, then create and qualify a new exact candidate. After an authorized tag or GitHub release, never move or replace the tag; repair through a new version. Never edit a failing summary into a passing one, accept an advisory or license gap silently, reuse evidence from a different SHA, or expose live-run artifacts to explain a failure.

## Review

- Origin: the release rule in `sdlc/planning/plan.md:72-74`, the completion ruling in `sdlc/planning/decisions/2026-09-13-trusted-execution-and-completion-plan.md:19-23`, and the current handoff in `sdlc/planning/notes/2026-09-14-handoff-admin-surface.md:9-15`.
- Design review at `e3da8dcd901242f791b830fc856a67db08659c5c`: rejected. The draft did not isolate the live credential and Pi state tightly enough, called a possibly multi-turn run one paid call, gave incomplete live success criteria, and allowed release-facing prose to reach main's automatic Pages deployment before publication authorization. It also omitted deletion of the absorbed handoff from the completion commit.
- Design response: Phase A now lands only package, decision-status, metadata-test, and license-check work while all maintained public release prose stays unreleased. It stops for an authorization request that names the built-in provider/model/reasoning, discloses possible billed retries and send-backs, and names Pages, tag, and GitHub release effects. Only authorized Phase B creates release prose and receives exact-SHA local, hosted, live, dependency, license, and review proof. The live run owns fresh private Bot and Pi homes, a scratch install and clone, process-only credential injection, exact success criteria, bounded nonsecret evidence, and verified cleanup. The final process commit removes the resolved handoff.
- Design re-review: pending
- Code review: pending
