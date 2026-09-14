---
flow: build
priority: 2
deps: []
---
# Qualify the platform check inside WSL2 on a hosted Windows runner

## Outcome

`.github/workflows/runtime.yml` gains a third job, `wsl`. It runs only on a manual dispatch and on a `v*` tag push. It installs WSL2 on a hosted `windows-2025` runner, clones this repository inside the distribution's own filesystem at the dispatched commit, and runs `make -C bot install` then `make platformcheck` as a non-root user. An ordinary pull request or push to main skips the job and pays nothing. `sdlc/scripts/platformcheck` keeps its behavior and names three legs in its comment.

## Current facts

Observed at `5907e29`, `bot/src` 18878 nonblank lines.

- `.github/workflows/runtime.yml:3-7` fires on `pull_request`, `push` to `main`, and `workflow_call`. There is no `workflow_dispatch` and no tag trigger.
- The file has two jobs. `check` runs on `ubuntu-latest` (`:13-14`). `platform` runs a `[ubuntu-latest, macos-latest]` matrix (`:35-40`) and its steps are checkout, `actions/setup-node` at `22.22.0`, `make -C bot install`, `test "$(id -u)" -ne 0`, and `make platformcheck` (`:42-52`).
- Every action in the file is pinned by commit SHA with the version in a trailing comment (`:20`, `:24`, `:42`, `:45`).
- `sdlc/scripts/platformcheck:2` reads "Narrow offline qualification shared by the hosted Linux and macOS jobs." `:11-15` accepts `Linux` or `Darwin` from `uname -s` and refuses anything else. `:20-30` exercises atomic install, ownership, locking, signals, and output pipes.
- `bot/src/cli.ts:137` admits `linux` and `darwin`, `:138` answers `win32` with the WSL instruction, and `:139` refuses every other platform. Node inside WSL reports `linux`, so the script and the runtime both admit the leg with no change.
- `Makefile:106-107` defines `platformcheck` as `sh sdlc/scripts/platformcheck`. `bot/Makefile:13-14` defines `install` as `npm ci`.
- `bot/package.json:30-37` declares the runtime dependencies and `:31-36` names six of them. None builds native code, so `npm ci` inside the distribution needs no compiler toolchain.
- `sdlc/planning/plan.md:73` states that the one release ticket qualifies an exact clean-clone commit on Linux, macOS, and WSL. `sdlc/ratchet.json` holds the ceiling at 18878.
- `specification/elements/runtime.md:23-24` still says the final release candidate requires a clean-clone WSL qualification and that the task is open.

Verified on the web, 2026-09-14.

- `Vampire/setup-wsl` is at major version 7. The latest tag is `v7.0.0` and it points at commit `d1da7f2c0322a5ee4f24975344f67fc0f5baf364` (https://github.com/Vampire/setup-wsl/releases, https://api.github.com/repos/Vampire/setup-wsl/git/refs/tags, https://api.github.com/repos/Vampire/setup-wsl/git/tags/5fae231e29d976722de11654d8323419501bb327).
- Its inputs are `distribution` (default `Debian-13`), `wsl-version` (default `'2'`), `additional-packages` (a space separated package list installed after the distribution), and `wsl-shell-user` (the distribution user that runs each `run` step). The README states "If the user does not yet exists in the distribution, it is automatically added." `defaults.run.shell: wsl-bash {0}` runs every step inside the default distribution (https://github.com/Vampire/setup-wsl/blob/v7/action.yml, https://github.com/Vampire/setup-wsl/blob/v7/README.md).
- GitHub states "GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners" (https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions).
- The `windows-2025` image ships WSL2. Its readme lists "Windows Subsystem for Linux (Default, WSLv2): 2.7.13.0" under Windows features (https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md).
- `node-v22.22.0-linux-x64.tar.xz` has sha256 `9aa8e9d2298ab68c600bd6fb86a6c13bce11a4eca1ba9b39d79fa021755d7c37` (https://nodejs.org/dist/v22.22.0/SHASUMS256.txt).

## Scope

1. In `.github/workflows/runtime.yml`, add `workflow_dispatch` to the `on:` block and add `tags: ['v*']` under the existing `push` key at `:5-6`. `branches` and `tags` are two entries of that one mapping, so the file keeps a single `push` key and writes no duplicate. Keep the `pull_request` and `workflow_call` triggers unchanged.
2. Add a `wsl` job guarded by `if: github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v')`. It runs on `windows-2025`, sets `timeout-minutes: 90`, and sets `defaults.run.shell: wsl-bash {0}`.
3. Its first step is `uses: Vampire/setup-wsl@d1da7f2c0322a5ee4f24975344f67fc0f5baf364 # v7.0.0` with `distribution: Debian-13`, `wsl-version: 2`, `additional-packages: git curl ca-certificates xz-utils make`, and `wsl-shell-user: builder`. The action adds `builder` and every later step runs as that user (W2).
4. The job uses no `actions/checkout` (W1). One step creates the working tree at the fixed distribution path `/home/builder/repo`, then fetches the exact commit: `git init /home/builder/repo`, `git remote add origin "$SERVER/$REPOSITORY.git"`, `git fetch --depth 1 origin "$SHA"`, `git checkout FETCH_HEAD`. Pass `${{ github.server_url }}`, `${{ github.repository }}`, and `${{ github.sha }}` through `env`, never inside the script body. The repository is public, so the clone needs no credential.
5. One step installs Node inside the distribution (W3). It downloads `https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz`, checks it against the sha256 recorded above, and unpacks it to the fixed path `/home/builder/node`. Do not write to `$GITHUB_PATH`. That file holds a Windows path, the `wsl-bash` wrapper does not translate it, and the wrapper runs `bash --noprofile --norc`, so a Linux directory written there never reaches `PATH`. Every later step instead starts its script with `export PATH="/home/builder/node/bin:$PATH"`. Do not use `actions/setup-node`, which installs on the Windows side.
6. The remaining steps mirror the `platform` job in order: `test "$(id -u)" -ne 0`, `make -C bot install`, `make platformcheck` (W5). Do not set `working-directory` on any step. That key resolves on the Windows host and cannot name a distribution path. Each script instead begins with `export PATH="/home/builder/node/bin:$PATH"` and `cd /home/builder/repo`. Do not run `sdlc/scripts/install`. Add no npm cache step (W4).
7. Rewrite `sdlc/scripts/platformcheck:2` to name the hosted Linux, macOS, and WSL jobs. Change nothing else in that file.

Exclude every change under `bot/`, every change to `sdlc/scripts/platformcheck` beyond line 2, and every change to `specification/`.

## Acceptance

Land the change, then dispatch the `runtime` workflow manually on the landed commit. The record cites that run id and shows the `wsl` job green. The record also cites the run id of the ordinary push run on the same commit and shows the `wsl` job skipped there. The primary agent triggers the dispatch; the implementer does not. Before the dispatch, run `make check` at the root and confirm the two existing jobs are untouched.

## Dependencies

None.

## Risk facts

The leg installs every npm package cold on every run, so it is slower than the other two legs. `platformcheck` runs its repeat loop ten times, so a hung lock test would burn the runner; the timeout bounds that. A `Debian-13` package set thin enough to break `npm ci` shows up as a failed install step, and the fix is one more name in `additional-packages`.

## The specification sentence

`specification/elements/runtime.md:23-24` does not change in this ticket. The sentence records release status, and `sdlc/planning/plan.md:73` assigns the clean-clone qualification on Linux, macOS, and WSL to the one release ticket. A green leg on demand proves the machinery works; it is not the release candidate's qualification. The recommendation is to change the sentence at the release ticket.

## Size decision

- Starting production size: 18878 nonblank lines
- Ending production size: 18878 nonblank lines
- Simpler approach tried: add `windows-latest` to the existing `platform` matrix and let `actions/checkout` place the tree under `/mnt/c`.
- Why insufficient alternatives were rejected: the DrvFs mount carries no POSIX ownership or mode bits, so the ownership, atomic install, and locking tests at `platformcheck:20` would prove nothing about a real WSL install. A separate job with its own clone inside ext4 is the only shape that exercises what the check exists to exercise. Running the leg on every push was rejected because the Windows runner is the slowest image and the leg adds no signal on an ordinary change.
- Production code added: none.
- Production code deleted: none.
- Accepted cost: the WSL leg runs only when someone asks for it or tags a release, so a regression that appears on WSL alone can sit unnoticed between tags.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 5
- Minimum level floor: none. A CI job holds no durable state and the ticket adds no concurrent code.
- Final level: 2
- Reasons: the job opens two new public triggers on a workflow other workflows call, and the proof spans a third platform whose filesystem and user rules differ from the other two. The job itself runs steps in order and keeps nothing between runs. A wrong leg costs a false green before a release, which the release ticket would catch.
- Selected model: `claude-sonnet-5` high implements; `claude-opus-5` medium reviews

## Review

- Origin: proposed ticket 11 in the 2026-09-14 admin surface and library requirements note.
- Design review: rejected once for a PATH step and a working directory that resolve on the Windows host, a stale runner hedge, and a complexity self-contradiction. Accepted after revision.
- First acceptance attempt, 2026-09-14: the `runtime` workflow dispatched on main at `d5830a1` as run `34881521999`. The `check` and both `platform` jobs succeeded. The `wsl` job failed at its first script step with `SERVER: unbound variable`, because a step's `env:` values stay on the Windows side and the wrapper does not carry them into the distribution. The ordinary push run `34881523189` on the same commit showed `wsl` skipped, so the trigger gate holds. The fix forwards the three clone variables through `WSLENV`. The record is written after a green dispatch.
