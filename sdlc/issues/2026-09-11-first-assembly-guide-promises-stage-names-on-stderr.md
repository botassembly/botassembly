# The first-assembly guide promises stage progress on stderr; nothing is written there

`docs/src/content/docs/guides/first-assembly.md` says of `cat article.txt | bot run ./reading-list/digest`:

> Each stage names itself on standard error. The titled summary lands on standard output.

The second sentence holds. The first does not. Across every successful run in this session —
two-stage, four-stage, parallel, loop, fan-out — stderr was empty:

```
$ cat article.txt | bot run ./reading-list/digest > out.stdout 2> out.stderr
exit 0
$ wc -c out.stderr
0 out.stderr
```

Tested with a pty as well, in case progress is TTY-gated, by running under `script -qec` with
stderr redirected to a file. stderr was still empty and the pty carried only the answer.

stderr does carry terminal diagnostics (`blocked:`, `exhausted:`, `fault:`, refusal lines), so
the stream separation itself is correct. Only the promised per-stage progress is absent. A new
user following the guide on a slow flow sees a silent terminal for the whole run and has no
documented way to tell a working run from a wedged one.
