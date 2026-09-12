# A new Bot home must be mode 0700, and nothing says so

`BOT_HOME` pointed at a directory created with the shell default (`mkdir -p`, mode 0775).
`bot config` reported the home as found and printed its resolved intelligences. `bot check`
validated an assembly against it and exited 0. The first `bot run` then failed:

```
$ bot run ./reading-list/digest < article.txt
fault: Installation identity validation failed: The Bot home is not a private owner-only directory.
exit 5
```

`chmod 700` on the home fixed it. The default home `~/.local/share/bot` is already 0700
because `make install` creates it, so the requirement never surfaces until someone sets
`BOT_HOME` or passes `--home` by hand — which is exactly what the `bot run --help` text and
the first-assembly guide's `BOT_HOME="${BOT_HOME:-$HOME/.local/share/bot}"; mkdir -p "$BOT_HOME"`
snippet invite. That snippet creates a 0775 home on a default umask.

Nothing in `docs/src/content/docs/guides/first-assembly.md`, `guides/install-and-use.md`,
`reference/invocation.md`, or `specification/elements/home.md` states the required mode.
The fault message names the condition but not the repair, and exit 5 is undocumented in
the guides.

Two commands that read the home (`config`, `check`) accept a home that `run` rejects.
