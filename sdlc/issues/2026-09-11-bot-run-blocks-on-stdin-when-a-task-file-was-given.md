# `bot run` blocks reading stdin even though a task-file argument was given

`docs/src/content/docs/reference/invocation.md` states: "An argument beats the stream: when a
string or a task file is given, stdin is not read at all — so a script that redirects stdin out
of habit changes nothing."

Observed otherwise. With stdin attached to an open pipe that has a writer but sends no bytes,
`bot run` with a `@file` argument never returns:

```
$ mkfifo /tmp/bf; ( sleep 40 > /tmp/bf & )
$ timeout 12 bot run ./reading-list/digest @nope.md < /tmp/bf
   exit 124 (timed out), no output on stdout or stderr
```

Reproduced twice. It first showed up unprompted: the same command run from a harness whose
stdin was an idle inherited pipe hung for over two minutes until killed.

The same invocation returns immediately when stdin is `/dev/null` or a closed pipe:

```
$ bot run ./reading-list/digest @nope.md < /dev/null
path-missing  nope.md
  Create the requested task file.
exit 2
```

`bot check` with the identical arguments and the identical idle pipe refuses instantly, so the
argument-beats-the-stream ordering is right in `check` and wrong in `run`. A string request
under the same idle pipe also runs normally, so the block is specific to the `@file` path.

The practical effect is a non-interactive caller — CI, a supervisor, a harness — that mistypes
a task-file path gets a hang with no diagnostic instead of `path-missing` and exit 2.
