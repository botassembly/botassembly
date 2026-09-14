---
base: 8773b0e
head: d5830a1
---

# The WSL platform leg fails acceptance and stays unarchived

Ticket 0292 landed on main at `d5830a1` across three commits: `9a22da5` adds the `wsl` job to `.github/workflows/runtime.yml`, `72a73d7` adds a `cd` into the builder home before the Node tarball download, and `d5830a1` extends the two workflow contract tests to admit the new triggers, the gated job, and the pinned `Vampire/setup-wsl` action. `sdlc/scripts/platformcheck:2` now names the hosted Linux, macOS, and WSL jobs. No file under `bot/` changed; production size stays at 18878 nonblank lines.

Design review rejected the first draft for a PATH step and a working directory that resolved on the Windows host instead of inside the WSL distribution, a stale-runner hedge, and a complexity score that contradicted itself. The revised draft was accepted. Independent code review accepted the implementation at `9a22da5` with three minor notes: the Node download step had no `cd` before it, fixed at `72a73d7`; the `wsl-version` input is unquoted, left as cosmetic; a tag push also fires the existing `check` and `platform` jobs, which is intended, not a defect. The ticket did not name the two workflow contract tests that pin the `on:` shape and the action inventory; the first full test rung found them and they were extended alongside the job.

The local gate ran spec, lint, and test separately in the foreground on the rebased branch: all three exited 0, conformance passed 143/143, vitest ran 216 files and 1753 tests, and `node --test` ran 160 tests. A first attempt at the test rung failed on a docs test; the docs workspace's own dependencies were not installed in that worktree, a setup fault and not a code fault, and the rung passed clean after `npm ci` in `docs`. `make -C bot coverage`, run again for this record, reports `Test Files 216 passed (216)`, `Tests 1758 passed (1758)`, and coverage `Statements 87.87% (9748/11093)`, `Branches 81.59% (7512/9207)`, `Functions 90.77% (2627/2894)`, `Lines 92.81% (7646/8238)` across 125 production modules.

## Acceptance fails

The primary agent dispatched the `runtime` workflow on main at `d5830a1`: run `34881521999`, event `workflow_dispatch`. The `check` and `platform (ubuntu-latest)` and `platform (macos-latest)` jobs succeeded. The `wsl` job failed at its first script step, `Run git init /home/builder/repo`:

```
Initialized empty Git repository in /home/builder/repo/.git/
/mnt/d/a/_temp/fdbc2f3b-7873-49ee-842e-9b422dca43c1: line 3: SERVER: unbound variable
##[error]Process completed with exit code 1.
```

The step's `env:` block shows `SERVER`, `REPOSITORY`, and `SHA` set by the runner, but the script that runs inside the WSL distribution through the `wsl-bash.BAT` wrapper does not see `$SERVER` as a set variable and the step's `set -eu` (or equivalent) treats the read as an error. The setup-wsl action's environment passthrough into the distribution did not carry the step's `env:` values through to this script the way the ticket's design assumed.

The ordinary push run on the same commit, `34881523189`, shows `check`, `platform (ubuntu-latest)`, and `platform (macos-latest)` all successful and `wsl` `skipped`, confirming the job's trigger gate costs nothing on an ordinary push.

Per instruction, this failure is not retried and the workflow is not edited to chase it. The ticket stays at `sdlc/tickets/0292-wsl-platform-leg.md`, unarchived, and `sdlc/planning/plan.md` keeps the WSL leg item as planned, not completed, until a follow-up ticket fixes the environment variable passthrough into the WSL distribution and a dispatch run turns the `wsl` job green.

**Decision Ian can overturn:** none recorded here. The open item is a bug, not a preference: the `wsl` job's steps need a way to carry GitHub Actions step `env:` values into the WSL distribution's shell that the `wsl-bash` wrapper actually honors, most likely by exporting the values from a step that runs on the Windows side into `wslenv`, or by writing them to a file the WSL-side script sources. That belongs to the next ticket against this workflow.
