---
flow: build
priority: 2
deps: []
---
# Established secret scanner gates publication

## Outcome

One pinned Gitleaks installation scans Bot Assembly's working directory and the Git patches available from local refs, including merge changes. Local and hosted complete checks use the same redacted commands. The unfinished custom secret detector and stored-Git collector are deleted. The published `main` begins at one reviewed clean root, so the gate passes without hiding historical findings.

## Current facts

- The current custom implementation occupies `bot/src/secret-detection.ts`, `bot/src/stored-git-secrets.ts`, and two large test files. It has no gate caller. Its review sequence grew across tickets 0267, 0269, 0271, and a planned child-process ticket without producing publication protection.
- Gitleaks 8.30.1 provides `dir` and `git` sources, redacted diagnostics, a TOML configuration, default detector rules, and process status suitable for a repository gate.
- A controlled scan of the current 501 reachable commits reported 2,781 redacted findings, mostly historical checked-in run sessions. A scan of the current directory reported generated test runs and the custom scanner's planted fixtures. A baseline or broad allowlist would preserve the history this outcome exists to remove.
- The hosted checkout currently fetches depth two. The remote publishes `main` and `ticket/0270`, both at the same old-history commit. Ian previously authorized replacing the current public repository history because the old repository was made private and no one uses this project yet.

## Scope

- Pin Gitleaks 8.30.1. Use the official release archives for Darwin and Linux on arm64 and x64. A POSIX shell installer maps `uname`, downloads the exact archive, verifies the platform's hardcoded SHA-256, extracts only the executable into ignored `.tools/gitleaks/8.30.1/`, and verifies the reported version. Linux uses `sha256sum`; macOS uses `shasum -a 256`. WSL follows Linux. Unsupported systems, unavailable hash tools, wrong versions, download failures, checksum failures, and malformed archives fail with a plain sentence.
- Keep downloads out of checks. Extend `sdlc/scripts/install` to install npm dependencies and Gitleaks. A missing or wrong scanner during a check fails with the exact preparation command. The installer may use `curl`; ordinary checks remain offline.
- Add `.gitleaks.toml` by extending the pinned upstream defaults. Accept and document the upstream rules' own path, value, and stopword exceptions as part of choosing an established scanner. Add no project commit, stopword, baseline, or broad source exception. Exclude only anchored generated paths that cannot be source: `.git/`, `.tools/`, dependency folders, coverage and built documentation output, and Bot's `.bot-test-*` scratch folders. Prove similarly named source paths remain covered. Do not exclude `.env*`, `auth.json`, credential files, untracked files, or ignored files.
- Add one `sdlc/scripts/secrets` entry point. It rejects a source-root `.gitleaksignore`, checks the pinned executable, rejects a shallow repository, then runs working-directory and history scans with the explicit project config, `--redact=100`, `--ignore-gitleaks-allow`, and no maximum target size. The history scan passes `--log-opts="--all --full-history -m"` so every available ref and separate merge diff enters the patch stream. The wrapper treats every scanner warning, scanner error, or unsuccessful status as failure while preserving redaction. Ambient Gitleaks configuration and inline allow comments cannot weaken it.
- State the coverage boundary exactly. A local check covers the refs available in that local repository. The hosted checkout fetches full branches and tags and covers those fetched refs. Neither check claims inaccessible server objects, deleted refs, or historical pull-request refs.
- Run the entry point from the complete local lint ladder. The hosted runtime workflow starts with `fetch-depth: 0`, explicitly fetches `+refs/heads/*:refs/remotes/origin/*` plus tags, runs the shared project installer, and reaches the same scanner through `make check`. Keep action pins and read-only workflow authority.
- Delete `bot/src/secret-detection.ts`, `bot/src/stored-git-secrets.ts`, `bot/tests/secret-detection.test.ts`, and `bot/tests/stored-git-secrets.test.ts`. Remove their lint exceptions and scanner-only exports or comments from `credential-environment.ts`. Preserve runtime credential discovery and assembly-process credential-variable removal.
- Build the new root in a separate fresh repository from the exact reviewed implementation tree. Install through the shared installer, run the unchanged `make check`, and prove the tracked tree did not change. Keep all old recovery refs outside that repository.
- Immediately before publication, inventory every remote head and tag with its object ID. Stop if that inventory differs from the reviewed expectation. Publish the new `main` and delete every authorized old public ref in one atomic push with explicit object-ID leases. The expected current deletion is `ticket/0270`; no tag is expected. Do not publish if the server lacks atomic updates. Keep the local old repository and renamed private remote as recovery sources; do not claim secret revocation or Git garbage collection.
- Amend setup and contributor documentation with the shared installer and honest scanner boundary. Pattern scanning can find known shapes. It cannot establish that a repository contains no secrets.

## Acceptance

A project-owned test drives the real pinned binary against temporary repositories and directories. A clean fixture passes. A runtime-created secret in an ignored `.env`, untracked file, or modified file fails without printing the value. History cases cover a committed then deleted secret, a secret reachable only from another branch, a tag-only commit, and a secret introduced in a merge and deleted later. Inline allow comments, a planted `.gitleaksignore`, and ambient configuration cannot bypass the gate. Generated paths stay excluded while similarly named source paths stay covered. No project content exception is preferred; any exact exception must prove that the same value elsewhere and a one-byte variation at its admitted path fail.

Installer tests cover each platform and architecture mapping without downloading, both hash command forms, exact version checking, checksum mismatch, missing tools, unsupported platforms, and safe replacement of a partial installation. Workflow tests require full branch and tag history and the shared installer before `make check`. Gate tests prove missing and wrong-version scanners fail with the preparation instruction. Controlled unreadable-file and unreadable-directory cases run as a non-root user and prove reported warnings or errors fail. The documentation records that some upstream open failures are silent; this ticket does not rebuild a filesystem collector around them.

Before the force-push, the old repository's complete gate may run with history scanning explicitly separated because the known old refs must fail. The separate fresh candidate holds only the proposed root and passes the unchanged complete gate with both scanner modes. Its tree stays byte-for-byte unchanged by installation and checking.

Publish that qualified root with the leased atomic ref update, then obtain hosted success for its exact SHA. Add one child commit containing the completion record and archived ticket; do not amend the root. Qualify and publish that child locally and remotely. A fresh clone then sees one root followed by the completion commit, no extra published heads or tags, both scanner modes passing, and the complete gate passing. The completion record names the superseded public head, new root, deleted refs, scanner version, official asset hashes, test totals, and scanner limitations without retaining findings or secret-shaped fixtures.

## Risk facts

The force-push invalidates old commit links and requires existing clones to reclone or reset. That is the accepted cost of removing known sensitive history before first use. The installer adds a release-download dependency to project preparation, but checks never download. Gitleaks can miss unknown secret shapes, inherits upstream exceptions, and can silently skip some paths it cannot open. Documentation and the warning check state those limits.

## Size decision

- Starting production size: 18728 nonblank lines
- Ending production size: 18171 nonblank lines
- Simpler approach tried: Finish the custom detector and collector, scan only the current tree, or admit the old history through a baseline.
- Why insufficient alternatives were rejected: The custom path duplicates maintained scanner work, current-tree-only scanning misses deleted commits, and a baseline preserves the known historical exposure while weakening every later result.
- Production code deleted: Both custom scanner modules and their production support leave `bot/src`.
- Accepted cost: One pinned development tool, one installer, one wrapper, one configuration, focused gate tests, and one authorized public-history reseed.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: 4, because false negatives can publish credentials and the accepted history rewrite is destructive.
- Final level: 4
- Reasons: The runtime change is deletion, but the outcome spans reproducible tool installation, two scan sources, hosted history, warning handling, and one irreversible publication boundary.
- Selected model: `gpt-6-astra` with extra-high reasoning for design review and `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: Ian rejected the six-ticket custom-scanner sequence and accepted one established scanner with honest limits on 2026-09-13.
- Design review: accepted after two rounds. The first review corrected upstream-default exceptions, merge and remote-ref coverage, project bypass files, warning handling, isolated root qualification, leased atomic publication, and root-versus-completion proof ordering.
- Code review: accepted after two rounds. The first review found broken checkout paths containing spaces, three website pages with the obsolete install command, and incomplete platform, failure, and generated-path proof. The repair quoted every executable and flag, made setup commands consistent, and covered every claimed case with the real pinned scanner or controlled installer fixtures.
