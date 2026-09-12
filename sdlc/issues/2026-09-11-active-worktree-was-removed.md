# An active worktree was removed during ticket work

During parallel work on ticket 0249, its registered worktree disappeared while it held an uncommitted implementation. Several unrelated worktree registrations disappeared in the same window. The ticket branch retained its latest commit, but the uncommitted changes were lost and had to be rebuilt.

The hostile-provider test did not remove the worktree. Its cleanup target comes from `mkdtemp()` under the system temporary directory. The test removes only that new directory. Removing the worktree also removed Git's registration metadata, which the test never addresses.

No observed evidence identifies the process or person that removed the worktrees. The remaining risk sits in development cleanup. Any cleanup command must read `git worktree list`, refuse a registered worktree with uncommitted or unmerged work, and require an owner check before forced removal.

This finding stays open until the cleanup path is identified or a mechanical guard prevents the same loss.
