---
flow: build
priority: 10
completed: 2026-09-06
---
# Pull requests run the complete offline check

## Result

Every pull request and push to `main` now runs root `make check` from a fresh non-root Linux checkout. The workflow installs the exact Bot lock, fetches and verifies parent history for the source-growth decision check, grants read-only repository access, and disables persisted Git credentials.

The workflow pins checkout and Node setup to audited v4.4.0 commit hashes. It runs no smoke, provider, deployment, publication, or artifact-upload work.

## Review and red-green evidence

Both workflow contract tests first failed because no runtime workflow existed. Independent code review then reproduced a shallow-history bypass that made the size-decision check report an initial baseline. Review also rejected mutable action tags. Remediation pinned both actions, fetched two commits, added an ancestry guard, and added a real shallow-clone proof.

Further review found condition, event-filter, extra-step, and top-level shell-default bypasses in the first contract test. The final test closes the small workflow shape and mutates every required boundary. It rejects masked failures, mutable refs, shallow history, persisted credentials, unknown actions or commands, reordered or duplicate work, smoke, network exfiltration, deployment, and publication. Final rereview accepted the result.

## Checks

The three workflow tests passed, including the real depth-one and depth-two Git proof. `git diff --check` passed. The complete root `make check` passed with 17 project tests, 202 Bot test files, 1,341 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet. The first hosted workflow run remains the external execution proof.
