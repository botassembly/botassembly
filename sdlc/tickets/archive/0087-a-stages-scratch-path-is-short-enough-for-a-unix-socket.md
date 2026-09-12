---
flow: build
priority: 3
---
# A stage's scratch path is short enough for a Unix socket

Bot hands every stage `TMPDIR` pointing at its own scratch
directory, so a program that mints its own temporary files leaves
them inside the run rather than the machine's `/tmp`
(`specification/elements/slots.md`). That is the right behavior and
this ticket does not change it.

The path it hands over is long. `scratchOfRun`
(`bot/src/invocation.ts:91`) composes
`<XDG_CACHE_HOME>/bot/tmp/<home>/<run>/<stage>`, and a real one on
this machine runs past ninety characters before a filename is added.
A Unix domain socket address is capped by `sun_len` at 108 bytes
including the filename and its terminator, so a test or tool that
binds a socket under `$TMPDIR` fails inside a bot stage and passes
outside it.

Observed 2026-08-10 while measuring a project's gate timing for sdlc
ticket 0033: `sh sdlc/scripts/test` inherited bot's `TMPDIR` and
failed a socket test that passed under `TMPDIR=/tmp`. The factory
owns that interaction and must not depend on an operator setting the
variable by hand — a gate that only passes when someone overrides
the environment is not a gate.

Done, observably: a stage's `$TMP` and `TMPDIR` name a directory
short enough that a program can bind a Unix socket with an ordinary
filename inside it — the directory path stays at or under 80 bytes,
leaving headroom within the 108-byte cap. The guarantees `$TMP`
already carries hold unchanged: empty when the stage starts, seen by
no other stage, nothing in it recorded, removed when the run's
scratch is, and shared across stages under `tmp: flow`.

Settled choices:

- The scratch tree keeps its meaning. Whether the short path is the
  real location or a stable short handle onto the existing tree is
  design's to settle. If it is a handle, it must survive for the
  whole stage and be removed with the scratch it names — a dangling
  short path outliving its run is worse than a long one.
- The opacity ruled by ticket 0067 stands: below `<scratch>/<run>/`
  the tree names no stage, flow, or repeat. A shorter path must not
  buy its length back by becoming descriptive.
- 80 bytes is the target, not a law of the system. If design finds
  a bound it cannot meet on a machine with a long home directory, it
  says so in the record with the arithmetic rather than quietly
  landing something longer.

This ticket exists because of sdlc's issue
`0100-long-bot-tmp-path-breaks-biomcp-unix-socket-tests.md`, closed
in that repo on 2026-08-20 when this was filed. That issue named a
second half — the affected project's own test could bound its socket
path instead. That half is deliberately not in scope here and is not
ticketed; bot's side stands on its own.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/scratch-keyed-by-home.test.ts`, whose assertions pin the
scratch path's composition. Restatement is authorized in that file,
bounded to the path's shape and length. The assertions on keying by
home, on per-stage isolation, and on removal with the run keep full
strength. If a refusal names another file, add it in an addendum.

## Why this is a build, not a quickfix

Filed as a quickfix and refused at `01-repair` on 2026-08-22 because
lint and all 863 tests passed: nothing in the suite binds a socket
under `$TMPDIR`, so the fault has no red to reproduce. Its proof has
to be authored. Reflowed to `build` on 2026-08-22.

Related, and evidence the stage environment is worth getting right:
on 2026-08-22 the sccache server was spawned by a build inside a
stage and inherited that stage's `TMPDIR`. The scratch directory was
removed when the stage ended, and every Rust compile on the machine
failed until the daemon was restarted. That was fixed outside this
repo by giving the daemon its own systemd unit with a stable
`TMPDIR`; it is not this ticket's work, but it is the same surface.
