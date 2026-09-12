---
flow: build
priority: 1
---
# A root commit passes the runtime workflow

## Outcome

The runtime workflow accepts a genuine root commit and still refuses a shallow non-root checkout that hides its parent.

## Current facts

The first hosted runtime run on commit `53f73fa` failed at `git rev-parse --verify HEAD^`. That commit is the repository root. The two-commit shallow-history guard still protects size and change checks on later commits.

## Scope

Change the ancestry check and its local workflow contract tests. Keep checkout depth two and every existing workflow restriction.

## Acceptance

Execute the exact workflow ancestry guard in three synthetic repositories. A genuine root checkout passes. A depth-one shallow non-root checkout with a hidden parent fails. A depth-two shallow non-root checkout with an exposed parent passes. The workflow contract test and complete check pass.

The guard passes when the raw `HEAD` commit object declares no parent. When it declares a parent, the guard requires `HEAD^` to resolve locally.

## Dependencies

None.

## Risk facts

This changes one hosted gate. A weak check could let a shallow non-root checkout bypass change-based checks.

## Complexity

- Contract score: 0
- State and timing score: 0
- Reach score: 0
- Proof score: 1
- Cost of error score: 1
- Total: 2
- Minimum level floor: none
- Final level: 1
- Reasons: One internal workflow guard has one exact rule. Three deterministic Git topologies prove the positive and negative cases. A mistake can break or weaken the hosted gate.
- Selected model: `gpt-5.6-luna` with high reasoning

## Review

- Design review: accepted after the three checkout topologies and raw-parent rule were made explicit
- Code review: accepted after commit-inspection failures were made fail-closed
