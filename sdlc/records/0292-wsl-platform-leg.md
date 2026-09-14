---
base: 8773b0e3741c9a7c31b28d8cd6df2a7c319f9899
head: fa335eebd9ac6ff85a33ae33bf8e143106a6f8dd
---

# Qualify the platform check inside WSL2 on a hosted Windows runner

`.github/workflows/runtime.yml` gains a `wsl` job. It runs only on manual dispatch and on a `v*` tag push. It installs WSL2 with `Vampire/setup-wsl@d1da7f2c0322a5ee4f24975344f67fc0f5baf364` on a hosted `windows-2025` runner, clones this repository at the dispatched commit into the distribution's own filesystem at `/home/builder/repo`, downloads and unpacks Node into `/home/builder/node`, and runs `make -C bot install` then `make platformcheck` as the non-root user `builder`. An ordinary pull request or push to main skips the job and pays nothing. `sdlc/scripts/platformcheck`'s comment now names the Linux, macOS, and WSL legs.

Landed commits: `9a22da5` adds the `wsl` job and widens the `platformcheck` comment. `72a73d7` fixes the Node download step to `cd` into the builder home first. `d5830a1` extends `scripts/runtime-workflow.test.mjs` and `scripts/workflow-policy.test.mjs` to admit the new job and its dispatch and tag triggers. `6dd4d0d` forwards `SERVER`, `REPOSITORY`, and `SHA` into the WSL shell through `WSLENV` and adds a contract test for the passthrough. `fa335ee` folds the first failed acceptance attempt into the ticket's Review section rather than keeping a standalone failure record.

The first acceptance dispatch, run `34881521999` on commit `d5830a1`, failed: the `wsl` job's first script step hit `SERVER: unbound variable`. A step's `env:` values stay on the Windows side of the `wsl-bash` wrapper and never reach the distribution shell, so `$SERVER` was unset when the clone step ran. The ordinary push run on the same commit, `34881523189`, showed `wsl` skipped, confirming the trigger gate holds outside dispatch and tags. The fix forwards the three clone variables through `WSLENV` at `6dd4d0d`.

The second acceptance dispatch, run `34882869484` on commit `fa335ee`, succeeded on every job: `platform (ubuntu-latest)` success, `check` success, `wsl` success, `platform (macos-latest)` success. The push run on the same commit, `34882870332`, again showed `wsl` skipped with the other three jobs green, so the gate still excludes it from ordinary pushes.

Design review rejected the first draft for a PATH step and a working directory that resolve on the Windows host rather than inside the distribution, a stale runner hedge, and a complexity self-contradiction; the revised draft was accepted. Independent code review accepted the revised draft with three minor notes: the Node download step needed the added `cd` into the builder home, `wsl-version` was left unquoted as a cosmetic inconsistency, and the new `tags` trigger also fires the existing `check` and `platform` jobs, which is expected but worth naming.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, vitest ran 216 files and 1758 tests passed, and `node --test` ran 160 tests passed.

A later foreground run of `make -C bot coverage`, taken independently for this record, shows `Test Files 217 passed (217)` and `Tests 1762 passed (1762)`, with coverage at 87.87% statements, 81.59% branches, 90.77% functions, and 92.81% lines.

The ticket did not name the two workflow contract tests in `scripts/runtime-workflow.test.mjs` and `scripts/workflow-policy.test.mjs`, nor the `WSLENV` passthrough; both were found by running the first dispatch rather than by design review. A later ticket writing a workflow that reads step `env:` inside a `wsl-bash` job should check this record first.

`specification/elements/runtime.md:23-24` still records the WSL qualification as open. This ticket proves the machinery runs green on demand; it is not the release candidate's clean-clone qualification, which `sdlc/planning/plan.md` assigns to the one release ticket. The sentence stays as is until that ticket runs.

Origin: proposed ticket 11 in the 2026-09-14 admin surface and library requirements note.

**Decision Ian can overturn:** none.
