---
flow: build
priority: 2
deps: []
---
# Gate docs on the complete commit

## Outcome

GitHub Pages deploys documentation only after the complete Bot Assembly gate passes for the same commit whose site artifact will deploy. Every checked-in source used to build the site triggers this workflow. The design remains one dependency edge when the complete gate later expands to Linux and macOS.

## Current facts

- The documentation workflow builds for changes under `docs/**`, `specification/**`, and its own file. The build also reads `examples/triage`, but `examples/**` does not trigger it.
- Its deploy job needs only the docs build. The separate runtime workflow can fail, remain pending, or never start without blocking Pages deployment.
- No branch-protection or Pages-environment setting exists in the repository tree, so checked code cannot assume an external status requirement.
- GitHub Actions permits a local reusable workflow only as a complete job. A local `uses: ./.github/workflows/runtime.yml` resolves from the caller's commit and cannot take an `@main` suffix.

## Scope

- Make the existing runtime workflow callable with `workflow_call` while preserving its ordinary pull-request and main-push triggers, full-history checkout, pinned setup actions, non-root assertion, ancestry guard, pinned scanner preparation, and one `make check` entry point.
- In the documentation workflow, add one local reusable-workflow job that calls `./.github/workflows/runtime.yml` from the same commit.
- Require the deploy job to need both the site build and the reusable complete-check job. Preserve the existing `PUBLISH_PAGES` condition and Pages environment behavior. Do not use `always()`, `continue-on-error`, a conditional check job, or a cross-run `workflow_run` lookup.
- Add `examples/**` to the documentation push paths. Keep `docs/**`, `specification/**`, and the workflow file itself. These are the complete checked-in site inputs today.
- Keep the site build separate from the complete check. Do not duplicate runtime steps inside the documentation workflow.
- Keep future Linux and macOS matrix expansion inside the reusable runtime workflow. Its aggregate caller-job result remains the one deployment prerequisite.
- Update exact workflow contract and hostile-mutation tests for triggers, local call syntax, permissions, dependency shape, action pinning, and prohibited bypasses.
- Do not change Pages content, publication variables, repository settings, release policy, Pi, or runtime product behavior.

## Acceptance

Start with failing workflow tests. The documentation workflow accepts exactly `docs/**`, `specification/**`, `examples/**`, and its own workflow path as push inputs. Its check job uses the exact local runtime workflow path with no ref, condition, error suppression, steps, or runner. Deploy needs exactly `build` and `check` and retains its existing publication condition.

The runtime workflow accepts its current pull-request and main-push triggers plus `workflow_call`. Its called form still runs the complete repository gate with full history and the existing ancestry, non-root, installation, and pinned-action protections. Existing hostile coverage still rejects removal of the pull-request gate.

Hostile mutations fail tests when they remove either dependency, replace the local reusable call with an external or versioned workflow, add `always()` or error suppression, make the check conditional, omit a site-input path, weaken permissions, or duplicate a partial runtime check in docs.

Run workflow-focused tests continuously, then the complete local gate. Independent code review must trace same-commit resolution and every deployment bypass. The implementation commit passes automatic hosted runtime and documentation checks. Because an SDLC-only completion commit does not match the docs path filter, dispatch the documentation workflow on that exact completion commit and verify its reported `headSha`; its reusable check and deployment dependency must pass there too.

## Dependencies

Ticket 0272 established the complete repository gate and hosted full-history preparation. Later platform work will expand the called runtime workflow without changing the docs dependency shape.

## Risk facts

A workflow can look connected while still deploy on a failed or skipped check. A ref-qualified reusable call can inspect another commit. An omitted site input can leave published pages stale. Local tests validate checked workflow structure, while the hosted runs validate GitHub's interpretation; external Pages variables, environment approvals, and branch protections remain outside repository proof.

## Size decision

- Starting production size: 17962 nonblank lines
- Ending production size: 17962 nonblank lines
- Simpler approach tried: Duplicate `make check` steps in the documentation workflow or rely on a separate runtime run and repository settings.
- Why insufficient alternatives were rejected: Duplicated steps drift when the gate changes. Separate runs and unrecorded settings do not create a checked same-commit dependency.
- Production code expected: None. This changes hosted workflow wiring and its mechanical contract tests.
- Accepted cost: One reusable-workflow trigger and one caller job become maintained interface between the workflows.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 7
- Minimum level floor: None.
- Final level: 3
- Reasons: The YAML change is small, but correctness depends on GitHub's reusable-workflow semantics, exact commit binding, trigger coverage, permissions, and negative bypass proof.
- Selected model: `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: The 2026-09-13 reassessment found that Pages deployment can bypass the complete runtime gate and ignores changes to one site input root.
- Design review: rejected once. The first review required explicit preservation of the pull-request gate, corrected level-3 routing, and exact-SHA manual documentation verification for the SDLC-only completion commit.
- Code review: accepted. The extra-high reviewer passed all three workflow suites and confirmed the same-commit local call, implicit success requirement across both deploy dependencies, read-only inherited authority, complete site-input set, and future matrix boundary against current official GitHub documentation.
- Completion: implementation commit `0fc713e3a8e0c5812ce30e5a193c9471470800d1` passed the complete local gate, the ordinary hosted runtime workflow, and the documentation workflow with its nested same-commit complete check before archival.
