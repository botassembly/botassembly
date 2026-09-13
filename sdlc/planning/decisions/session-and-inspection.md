# Decisions — `session.md`, `inspection.md`

*Historical (pre-ADR). Superseded by the specification and planning/adr/ as of 2026-07-31 — details below may contradict current truth (invariant numbers, command counts, identity format have all moved). Kept for the reasoning, not the rulings.*

Written 2026-07-30, from Ian's framing that the record is ours and the session
is the runtime's.

## The decisions

**1. The format does not define a session format.**
Options: standardize a session format and require runtimes to write it;
standardize a conversion; define nothing and reference the runtime's own. Chose
the last. A session is whatever the underlying agent library produces, and
Pi's is Pi's. Standardizing it would mean either constraining which libraries a
runtime can be built on, or writing a lossy conversion that throws away exactly
the provider-specific detail somebody is reading the session to find.

**2. The record holds a reference to the session, not its contents.**
This is what lets the record be a contract. A standardized record can be parsed
by anything; a record that embedded sessions would inherit their instability.
Cost: a record is no longer self-contained. Moving one somewhere else without
its sessions loses the transcripts, and nothing currently says how they travel
together.

**3. A table contrasting record and session.**
Options: prose; a table. Table. The split is the whole point of the document and
four rows say it faster than four paragraphs.

**4. Sessions are append-only and a held agent's continuation lands in the same
file.**
Follows from resumption being resumption. Also makes a session file readable as
one story rather than as fragments per attempt. Cost: the record needs a
separate way to say which turns belong to which attempt, which the three-part
identity has to carry.

**5. Four inspection commands, not one with subcommands or many with flags.**
Options: one `bot inspect` with modes; a command per noun. Chose a command per
noun — `runs`, `show`, `tools`, `session`. Each answers one question, each is
typeable from memory, and each can be piped. Cost: four names in the CLI's
namespace, and `bot show` is vague on its own.

**6. Line-oriented stdout with a stable field order.**
Options: pretty output with a `--json` escape; JSON by default; lines by
default. Chose lines, with `--json` on `bot show` for the machine case. This is
the POSIX bet: `grep`, `cut`, `awk` all work with no parser written for any of
them, which is what makes the interface usable from a shell script the day it
exists.

**7. `bot tools` as its own command.**
Options: fold it into `bot show`; leave it to session rendering. Made it a
command. An agent that spent nine turns fighting a command that was never going
to work is the most common failure worth seeing, and it is invisible in both the
record summary and the raw transcript.

**8. Blank rather than inferred when a runtime cannot report something.**
Follows from the record never claiming more than what happened. Written into
`inspection.md` explicitly because this is where the temptation is: a tool
listing looks broken when it is empty, and the fix is not to fill it in.

**9. Reading a live run needed no new mechanism.**
An append-only record means the lines that exist are the lines that happened.
Written down as a section because it is the kind of property that gets
re-implemented as a separate "status" feature by someone who did not notice.

## Questions for Ian

- Is `bot` the command name? Everything is written as `bot run`, `bot show`. The
  predecessor used it, and it may or may not be the name going forward.
- Should `bot show` on a failed run exit non-zero, mirroring the run's own exit
  code? Currently exit is about whether the query found anything, not about what
  it found. Mirroring would be convenient in scripts and would overload the
  meaning.
- Are sessions retained forever, or is there retention? The predecessor had a
  purge with a default of 30 runs. Nothing here says.

## Follow up

- The record's own file format is still unspecified, which `inspection.md`
  depends on for `--json`.
- Nothing says how a stage's full identity is written down — the string
  `03-recommend/pass-2/02-critique` appears in `example.md` and is invented
  there. That form needs to be specified in `record.md` and then used
  consistently.
- Whether a run and its sessions can be moved or archived as a unit.
