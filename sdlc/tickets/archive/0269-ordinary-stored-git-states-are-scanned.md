---
flow: build
priority: 1
deps: []
---
# Ordinary stored Git states are scanned

## Outcome

One internal repository-owned collector applies ticket 0267's detector to ordinary SHA-1 resolved HEAD and index blobs. It detects known secrets in the stored bytes that a filesystem-only scan misses and returns disclosure-free refusals for the failure cases this ticket proves.

## Current facts

Ticket 0267 recognizes known secrets in one byte candidate but does not know Git. A staged file can differ from both HEAD and the working file. The first ticket 0269 design combined complete adversarial Git discovery, parsing, and process-lifecycle hardening. Implementation reached a cohesive functional scanner and 14 passing focused tests, then showed that the remaining hostile-process proof was another independent security boundary.

## Scope

Add `bot/src/stored-git-secrets.ts`, its focused tests, and only the narrow lint exception needed for its platform decoder. Export asynchronous `scanStoredGitSecrets(root, boundary?)` for repository-owned use. The collector remains disconnected from every lint, complete, hosted, and publication gate.

The production path invokes the fixed Linux executable `/usr/bin/git` with only `PATH=/usr/bin:/bin`, `LANG=C`, `LC_ALL=C`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, and `GIT_CONFIG_COUNT=0`. It does not search caller `PATH` or inherit `HOME` or another `GIT_*` value. It requires the real supplied root to equal the real non-bare worktree top level. Tests can inject the executable, process result, downward-only limits, and shorter deadlines. Omitted limits retain the production defaults in source.

Resolve an ordinary SHA-1 `HEAD^{commit}` with replacement objects disabled. Detached HEAD works. An unborn HEAD requires a stable symbolic branch, a valid ref, and two absent-ref observations. Git 2.43 requires `show-ref --verify --quiet` to represent expected absence with status one. An unborn repository still scans its index.

Read NUL-delimited `ls-tree` and `ls-files --stage` metadata. Scan regular, executable, and stored symbolic-link blobs. Skip a well-formed gitlink without descent. Preserve every index conflict stage as a separate semantic candidate. A staged deletion contributes only HEAD. A rename contributes the old HEAD path and new index path. Intent-to-add contributes Git's empty staged blob.

Sort candidates by raw path bytes, then HEAD, then index stage zero through three. Cache object reads and detector results by object identifier without merging semantic states. Apply ticket 0267's binary decision and candidate limit. Enforce the proved semantic-candidate and projected-finding limits. A refusal returns no partial findings.

Complete results name the resolved commit or unborn ref, counters, and findings. Each finding contains only `HEAD/PATH`, `index/PATH`, or `index-stage-N/PATH` plus ticket 0267's match facts. Refusals contain stable reason, operation, counters, and only bounded validated facts. Process refusals contain observed stream byte counts and SHA-256 digests instead of stream content. No result contains candidate bytes, stderr text, environment values, or the supplied root.

## Acceptance

Real temporary repositories prove one planted synthetic token in duplicate HEAD and index content; staged add, modify, delete, and rename; executable and symbolic-link blobs; intent-to-add; detached and unborn HEAD; and conflict stages one through three. Results preserve deterministic labels and object-cache counters.

Tests prove that caller `PATH`, `GIT_DIR`, and `GIT_WORK_TREE` do not redirect an ordinary scan. Nonrepositories, subdirectories, and bare repositories refuse. Focused injected results prove a path digest without path disclosure, malformed metadata, a wrong object type, an oversized candidate, a nonzero process result, candidate and finding ceilings, binary counting, pinned command environment, and absence of planted candidate and stderr text from returned values.

Focused tests, lint, type checking, `git diff --check`, the production-size check, and the complete local and hosted gates pass.

## Deferred hardening boundary

This ticket does not establish a release-grade hostile Git or child-process boundary. A prerequisite ticket before working-file collection and gate integration must prove linked worktrees and SHA-256 repositories; real gitlinks, replacement refs, repository alternates, and every relevant hostile `GIT_*` value; the full path, mode, type, stage, object-identifier, duplicate, and truncation parser table; every downward resource and counter boundary; request and framing attribution; every spawn, deadline, cleanup, stream, signal, status, overflow, precedence, late-event, observed-byte hash, and forced-drain case; and batch flow without deadlock. That ticket owns corrections exposed by those tests.

## Risk facts

The code parses Git-controlled byte streams and starts a child process. Its public types already reserve bounded refusal facts for later hardening, but unproved branches carry no release claim. No gate calls this collector until the hardening, mutable working-state scan, reviewed exceptions, proposed-history scan, and final integration tickets complete.

## Size decision

- Starting production size: 18379 nonblank lines
- Ending production size: 18648 nonblank lines
- Simpler approach tried: Filesystem reads, `git diff`, and one process per blob.
- Why insufficient alternatives were rejected: Those choices miss staged or unchanged stored states, can reproduce source bytes, or create thousands of processes.
- Production code deleted: The repository has no stored-Git-state collector to replace.
- Accepted cost: One internal functional collector. The completion record states its measured size and its unproved hostile boundary.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 1
- Cost of error score: 2
- Total: 7
- Minimum level floor: 4, because later publication enforcement depends on this collector and a false negative can publish a credential.
- Final level: 4
- Reasons: This ticket establishes functional stored-state semantics without claiming the separate adversarial process boundary.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Origin: this is the functional stored-state part of the secret-protection sequence.
- Design review: split after implementation reached 14 green focused tests. Independent review found that complete repository parsing and adversarial process-lifecycle proof remained too large for one safe review. The accepted boundary retains only behavior already implemented and directly proved. The following hardening ticket restores the original release-grade claim before any consumer or gate can call this collector.
