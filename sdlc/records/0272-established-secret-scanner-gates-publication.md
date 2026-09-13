---
base: 43bd32cfa3ea80a85a11002f86106009e6cf72ca
head: 2adb9717a092f540a71bbcec34e5e4a2e92c3abb
---

# Established secret scanner gates publication

Bot Assembly now uses Gitleaks 8.30.1 for repository secret detection. One POSIX shell installer downloads the official Darwin or Linux archive for arm64 or x64, verifies a hardcoded SHA-256, installs into the ignored repository tool directory, and verifies the version. The pinned archive hashes are `b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5c` for Darwin arm64, `dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709` for Darwin x64, `e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080` for Linux arm64, and `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` for Linux x64.

The complete gate scans ignored, untracked, modified, and ordinary working files. It also scans Git patches from every available ref with full history and separate merge diffs. Hosted checks fetch public branches and tags before using the same scanner entry point. Diagnostics redact complete matches. A source-root `.gitleaksignore`, inline allow comments, shallow history, wrong scanner versions, reported warnings, and reported errors all fail. The project extends Gitleaks' upstream defaults and therefore inherits their exceptions. It does not claim access to deleted or inaccessible server objects. Gitleaks can miss unknown secret forms and can silently skip some filesystem open failures.

The implementation deleted the two custom scanner modules and their two test suites. Production TypeScript contracted from 18,728 to 18,171 nonblank lines. Runtime credential-environment discovery and child-process credential removal remain.

Independent design review rejected the first design because it overstated history and file coverage, contradicted upstream exceptions, and placed publication before exact-root qualification. Independent code review rejected the first implementation because shell word splitting broke paths containing spaces, three website pages retained an incomplete install command, and the tests did not cover every claimed platform, failure, and exclusion. Both reviews accepted the repaired design and implementation.

Focused tests covered all eight supported operating-system and architecture spellings, both platform hash commands, required-tool and download failures, checksum and archive failures, wrong versions, partial installations, checkout paths containing spaces, every generated exclusion and lookalike, working-file states, branch-only and tag-only history, merge-only additions, redaction, bypass attempts, reported read failures, shallow repositories, and hosted workflow wiring.

The reviewed tree became new root `2adb9717a092f540a71bbcec34e5e4a2e92c3abb`. The leased atomic publication replaced public `main` at `43bd32cfa3ea80a85a11002f86106009e6cf72ca` and deleted public `ticket/0270` at that same object. No public tag existed. The renamed private repository and existing local repository retain recovery history. The isolated root passed 139 repository and documentation tests, 1,576 runtime tests across 202 files, all 143 conformance cases, both scanner modes, static checks, and the production-size check. Its tracked tree stayed at `56c2ed3127cd5f564031c2947d6cb31cce36a36b`. Hosted runtime run `34762756472` passed on the exact root.
