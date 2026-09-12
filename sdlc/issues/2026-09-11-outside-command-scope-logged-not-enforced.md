# Out-of-scope writes are detected and recorded, but not prevented

Observed 2026-09-11 while running a nine-stage assembly whose whole point was to keep nine agents inside one caller-owned working directory, run `2026-09-10T12-19-31-e4cb`.

The synthesis stage ran `bash` commands that wrote outside every slot it was given. `bot explain` records them:

```
outside-command-scope  /tmp
outside-command-scope  /tmp/ids_in.json
outside-command-scope  /tmp/note.md
```

Both files exist on disk afterwards:

```
-rw-r--r--  1 ian  wheel  17065 Sep 10 09:10 /tmp/ids_in.json
-rw-r--r--  1 ian  wheel      0 Sep 10 09:15 /tmp/note.md
```

The stage had `$PWD` pointing at the case working directory and `$TMP` pointing at its own scratch, and it used both correctly elsewhere in the same attempt: it read `$PWD/00-brief.md`, read `$TMP/digest.md` four times, and edited `$OUTPUT` eight times. The slots were understood; the agent simply also reached past them, and nothing stopped it. A stage-1 agent did the same thing with a different mechanism, recorded as `outside-command-scope` on a bare `awk` program.

`bot explain` presents `outside-command-scope` as an observation after the fact. An operator reading the term reasonably assumes scope is a boundary; it is a label, not a fence. A shared `$PWD` is the mechanism that makes a fan-out assembly auditable, and a stage that writes its real intermediate state to `/tmp` moves part of its reasoning outside the record. The next run of the same assembly can silently read a stale file left by the previous one, and two concurrent runs in separate working directories would both write `/tmp/ids_in.json`.

## What would fix it

1. Refuse the write. A `bash` command whose target resolves outside the stage's slots fails, with the message naming the slot the agent should have used. This is the behaviour the `outside-command-scope` label already implies.
2. If refusing is too strong a default, make it a policy the assembly can set, and surface a per-stage count in the run summary rather than only inside `bot explain`.

Recommendation is (1) with (2) as the escape hatch, because the failure is silent today and silence is the expensive part. The cost of (1) is that an assembly relying on a system path breaks on upgrade, which is a loud failure and cheap to fix.

## Evidence

- `bot explain 2026-09-10T12-19-31-e4cb --stage 03-synthesis`, the `outside-command-scope` lines.
- The two files above, timestamped inside the run's window.

## Disposition (2026-09-12)

Status: retained accepted alpha limit. The current specification explicitly
limits `access` to direct model-facing dispatch and does not claim filesystem
containment for allowed commands, hooks, gates, or subprocesses. Review only
with a concrete process-containment design, or on 2026-12-12.
