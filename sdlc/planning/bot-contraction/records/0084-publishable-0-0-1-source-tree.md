---
flow: build
priority: 10
completed: 2026-09-10
---
# Publishable 0.0.1 source tree

## Result

Bot Assembly now has a complete public-alpha front door. The root README and first-assembly guide cover clone installation, model setup, an exact four-file assembly, offline checking, running, supported inspection, the MIT license, platform support, pre-1.0 compatibility, and the no-sandbox trust boundary. ADR 0029 and the active specification name `0.0.1` as the first public alpha.

The current tree no longer contains the two committed dogfood runs or seven absorbed planning notes. A repository-owned check rejects tracked dogfood paths, common credential filenames, private workspace paths, and private project names across the maintained public prose. Production dependency audits for Bot and the documentation report zero findings as checked on 2026-09-10. `SECURITY.md` and `CONTRIBUTING.md` provide the two missing public entry points.

Draft 0231 separately records the Bot and Pi availability mismatch. Bot reports 112 locally configured models while the installed Pi 0.85.1 runtime reports 134. The draft names one concrete difference and leaves the later dependency, authentication, precedence, extension, and migration design open.

## Review and checks

Luna High implemented the accepted level-2 design. Independent Sol Medium review found six issues. The first implementation documented one invalid output command, retained one legacy listing command, left active conformance text at version 0.1, omitted comparable Pi evidence, missed forbidden broken symlinks, used broken source links, and hard-wrapped changed Markdown. Luna corrected those findings. A second review found that the Pi evidence still compared unlike counts. Luna added Bot's 112 locally configured count, the matching commands, and the concrete `google/gemini-3.7-flash` difference. The same reviewer reproduced the comparison and accepted exact implementation head `eed41d8b4f20d1f46e6778abd91a09c795e3145c`.

The final complete offline check passed 69 project tests, 215 runtime test files with 1,524 tests, all 143 conformance cases, and 97.15 percent line coverage under Node 22.22.3. The documentation build produced 24 pages. `make installcheck` passed. Both production dependency audits reported zero vulnerabilities. Production runtime source did not change.

## Source

This manual ticket started from published commit `1992792ea35a097277ca5db51b9659ed1b4611bc`. Commit `30e2a419` records the accepted design. Commits `95f92f8a` through `eed41d8b` contain the implementation and review repairs. Manual ticket 0085 owns the separate destructive ref and worktree cleanup. Repository visibility remains unchanged.
