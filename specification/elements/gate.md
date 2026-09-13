# The gate

> **Stability: stable.**

A gate is a program that reads a stage's output and decides whether it is good
enough to leave the stage.

It is the last of the three checks ([gating](gates.md)), and the only one that
judges the work rather than its form.

```sh
#!/bin/sh
# gate.sh
if ! grep -q '^## What to do' "$1"; then
	echo "The report has no 'What to do' section."
	exit 1
fi
```

## How it is run

A gate is an executable in the stage folder named `gate`, with any extension or
none — `gate.sh`, `gate.py`, `gate.ts`, `gate`. It needs its executable bit set
and a shebang, or is a compiled binary, so any language will do.

## More than one

A stage that checks several things puts a `gate/` folder in place of the file:

```text
02-analyze/
  STAGE.md
  schema.json
  gate/
    01-lint.sh
    02-tests.sh
    03-house-style.py
```

Every entry in the folder is a gate, and they run in the order their names sort.
Its basename stem must not be a reserved hook name: `before`, `success`, or
`failure`. Every entry has to be executable, and an empty `gate/` folder is a
malformed assembly. Numbered prefixes are how an author says which order;
without them the order is alphabetical, which is still an order and still
stable.

Run them cheapest first. The first non-zero exit ends the round and its output
is the reason the agent is given, so a linter that takes a second belongs ahead
of a test suite that takes a minute.

The record names which gate failed, which is the reason a folder is worth having
over one script that calls three things.

A stage has a `gate` file or a `gate/` folder. Both is an error.

The runtime passes the path of the output file as the first argument. The
stage's slots are in its environment as well, so `$OUTPUT` names the same file
and `$INPUT` names what the stage was given.

A gate reads a file rather than a stream because a gate is written to inspect:
it re-reads, it seeks, it hands the path to a linter or a test runner or a
parser. Anything that takes a filename works without a temporary file.

A gate reads that file and does not write to it. It may copy it, parse it, hash
it, hand it to a linter; the bytes it was given to judge are the bytes it leaves
behind. Repairing an output is work, and work is a stage's job, not a gate's. A
write that is still there when the output is sealed is caught — what passed the
checks is what is sealed, and bytes that differ end the run ([the
record](record.md#hashes)) — but a write the gate undoes before it exits is
caught by nothing, and a runtime is not required to do anything about it. The
run succeeds, the record seals the bytes the stage wrote, and nothing in it says
the verdict was reached on something else. This is a rule about what a gate is
for and not a boundary the runtime holds: a gate that writes to its output has
judged a file no reader of the record will ever see, and its verdict means less
than it appears to.

## The verdict

The exit code, except that `75` with evidence is an audited external blocker.

| Exit     | Meaning                                                     |
| -------- | ----------------------------------------------------------- |
| `0`      | the output passes; anything the gate printed is not shown to the agent, though the record keeps it |
| `75` with nonempty output | an external condition blocks the run; the stage ends immediately with exit `1`, cause `blocked`, and a bounded view of the captured output as its reason |
| other non-zero | the output fails; everything the gate printed is the reason  |

On failure, stdout and stderr are captured together. A `75` is a blocker only
when those combined captured bytes have at least one byte: its bytes are kept
exactly, without trimming, parsing, or assigning them meaning. A silent `75`
is an ordinary failing gate and uses the retry budget. The agent receives an
ordinary failure's output after this runtime-written frame:

> Your output did not pass review. Fix the cause, then rewrite your output. If the cause is outside what you were asked to do, say so plainly instead of retrying.
>
> The review output follows:

The frame says what happened and what to do without telling the agent about the
machinery that made the judgment. The agent carries on in the same session
([gating](gates.md#what-a-failure-does)).

Valid UTF-8 output at or below 10,000 bytes reaches the agent unchanged. Larger valid UTF-8 output becomes a deterministic head-and-tail view no larger than 10,000 UTF-8 bytes. The notice between the two parts gives the original and omitted byte counts and directs the reader to `check.capture`. It cuts only between code points. A terminal `blocked` or `exhausted` reason uses the same rule with a 2,048-byte ceiling. Invalid UTF-8 remains exact in the capture. The agent and terminal reason receive only a fixed message that says text rendering was unavailable and names `check.capture`; they receive no partial decode or replacement characters.

`126` and `127` come from the shell, not from the gate — a gate that could not
be executed is a broken assembly, and the run fails rather than the agent being
sent back ([the runtime](runtime.md#exit-codes)). Timeout, signal, execution
failure, output overflow, and `126`/`127` retain that machinery precedence over
a `75` verdict.

## Time

A gate gets the stage's `timeout` as its own budget, counted from when the gate
starts. It does not take what is left of the agent's clock: a gate that runs a
ninety-second test suite should pass or fail on its own terms, not on how long
the agent happened to take before it.

A gate that runs out of time fails the run rather than the agent. A gate that
hangs is wrong, and sending an agent back to rewrite good work because a linter
deadlocked is the failure this format exists to avoid.

## Writing the reason

What a failing gate prints is read by an agent that is about to try again, so it
is worth writing as an instruction rather than as a diagnosis. "The report has
no 'What to do' section" is a repair the agent can make. "validation failed" is
a sentence it has to guess at.

A gate that passes says nothing, because there is nobody to say it to.

## What runs first

The schema is applied before the gate, so a gate reading a `schema.json` stage's
output knows the file parses and matches. A `schema.md` stage's body — its
frontmatter is validated first ([the schema](schema.md)) — and a stage with
no schema reach their gate unvalidated, which is the case a gate is most useful
in: it can read prose and hold it to a standard that no validator expresses.

## In the record

Every gate invocation is recorded — its exit code, everything it printed, and
the hash of the gate's bytes as they were at that moment. A hash that disagrees
with the one taken when the assembly was read ends the run: exit `2`, the record
naming the file ([the record](record.md#hashes)).
