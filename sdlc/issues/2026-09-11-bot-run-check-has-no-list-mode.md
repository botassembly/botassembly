# `bot run check` has no list mode, but the command surface advertises one

`bot` with no arguments prints the structured surface:

```
  run check  list or read one named recorded check
```

Only the read half exists:

```
$ bot run check 2026-09-11T12-41-59-4cc6
Run check requires one run and one check name.
exit 2
```

`bot run check --help` agrees with the behavior, not the surface: "Lists every well-formed
recording for one exact check name." So the name must be supplied and there is no way to ask a
run which checks it recorded. For a run whose stage failed, a reader who does not already know
the check is called `gate` has nothing to enumerate from.

Separately, `--raw` on a check that exists but failed reports it as absent:

```
$ bot run check 2026-09-11T12-41-59-4cc6 gate --raw
No successful check recording matches.
exit 1
```

The recording is there — the markdown mode prints it, exit 1, with its capture and the gate's
SHA-256. The failing capture is the one a reader wants raw, and the message calls it missing
rather than saying raw mode only serves passes.
