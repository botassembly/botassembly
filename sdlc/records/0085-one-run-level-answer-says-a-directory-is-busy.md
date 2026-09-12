---
base: 791763cbc7a36c4bdbf55569cefaa1211e4d9de9
head: 1b9e64a101a81a6168e3946a56246fc6895c7efe
---

Replaced the stage-holder worktree probe with `bot busy`, which derives
per-home directory liveness from live run records and heartbeats. This keeps
live roots, active overrides, and nested children safe without a second lock
registry, and fails closed when liveness cannot be established.
