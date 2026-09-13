# Trusted execution and completion plan

Decided 2026-09-13. Ian accepted the reassessment of the first-public-release plan after reviewing Bot's tool, process, platform, and publication boundaries.

## Execution boundary

Bot runs trusted assemblies with the operator's operating-system authority. Stages and choices receive the ordinary Pi tools plus the control tools their place in the flow requires. Bot does not try to contain shell commands or require authors to list executable names. An operator who needs containment supplies a restricted account, container, virtual machine, or equivalent operating-system boundary.

The authored `access` feature will be removed before the first public release. Bot will continue to remove recognized provider credential variables from assembly processes as protection against accidental disclosure. That removal is not containment. The approved private-file rules for Pi authentication and command-capable model configuration remain real operating-system protections.

## Platforms

Linux and macOS will be native supported platforms. Windows will be supported through WSL. Native Windows stays unsupported because Bot's executable-file, ownership, permission, signal, and process-group contracts are Unix contracts.

## Publication protection

Repository secret detection is development tooling, not Bot runtime behavior. One pinned established scanner will cover the working tree and reachable history with redacted diagnostics and reviewed fixture exceptions. The unfinished custom detector and Git collector will be removed. Pattern scanning never proves that a repository contains no secrets.

## Completion and release

The project has no date or version pressure. Every supported defect and selected quality repair will finish before the first public release. Unsupported suspicions and speculative features close with their evidence retained in Git rather than remaining on calendar holds.

Release preparation begins only after the issue and implementation queues are empty. One final ticket will qualify an exact commit and request Ian's authorization before publishing `v0.1.0`.

## Choice sessions

`CHOOSE` keeps its current fresh recorded session. A later study may compare that design with a follow-up turn in an accepted preceding model session. A first-position choice or a choice after a non-model node would still require a fresh session. No implementation ticket exists until measured cost or quality evidence supports the change.

## Supersession

This decision supersedes the mandatory-access, restricted-choice, subflow-read-confinement, minimal-environment, five-ticket custom-scanner, Linux-only, and release-countdown rulings in `2026-09-12-first-public-alpha-plan.md`. Historical completion records remain unchanged.
