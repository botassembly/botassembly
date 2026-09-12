---
flow: build
priority: 10
completed: 2026-09-10
---
# Only main remains before publication

## Result

The local repository now has one branch and one worktree. The live GitHub repository has one branch. Both name `main`. Local and remote tags are empty. The local stash is empty. GitHub still reports private visibility, `main` as the default branch, and `protected: false`. No history was rewritten. No release was created. Repository visibility, Pages, and protection settings did not change.

The cleanup removed 13 local branches, two remote ticket branches, three non-main worktrees, 100 local tags, seven remote tags, and one stash. The detached 0188 worktree contained one untracked 126-line regression test. An exact private copy preserves it with SHA-256 `2edfab13401c2fb7339f9774f3da110ea9956ed72be6a7c2bff38745c060701d`.

## Recovery

The private recovery bundle is `/home/ian/workspace/archive/botassembly-pre-public-2026-09-10.bundle`. `git bundle verify` accepted all 123 bundled heads. The bundle includes every pre-cleanup local branch, remote-tracking branch, tag, stash, current HEAD, and registered worktree HEAD. Its SHA-256 is `0fa277a83522948a1989bbf93db13b0d549e79d3d79caa1c67abe23e6e465f24`.

The companion evidence directory is `/home/ian/workspace/archive/botassembly-pre-public-2026-09-10/`. It contains the full 119-ref local inventory, actual remote HEAD and ref inventories, GitHub state, all 123 bundle heads, checksums, and the preserved untracked test. The bundle and companion directory are private local recovery material. They are not repository content.

## Review and checks

Sol Medium rejected the first level-4 design because it omitted the stash, seven live remote tags, the untracked test, accurate GitHub protection facts, and sequential stop gates. The accepted design preserved all three missing sources before deletion and corrected the complexity score to 8 with a level-4 data-loss floor.

The primary agent performed each destructive phase after its stop gate. The final machine check used `git worktree list`, local ref readings, `git ls-remote`, GitHub repository and branch readings, `git bundle verify`, and both recovery hashes. The result contains one clean main worktree, one local main branch, one live remote main branch, no tag, no stash, and matching local and remote main commits before this completion record.

## Source

Ticket 0084 landed the public-alpha source tree at `96ddeec4`. Commit `c44728e8` records the accepted cleanup design and the last pre-cleanup main state. This record reports the resulting repository state. Ian explicitly authorized all branch, tag, worktree, and excess-file removal on 2026-09-10.
