# No reading reports an assembly's content hash

Observed 2026-09-14 at commit `44d8dbf` on the Linux box, from `examples/`.

Bot computes a content hash for every assembly it runs. `run_start` carries `assembly_hash` (`specification/elements/record.md:85`), `run.ts:294` writes it from the pre-run hash, and `resume.ts:50` refuses a donor whose hash moved. Nothing outside a record ever prints that number.

- `bot assembly check ./triage/triage --json` returns `bot.assembly.check@1` with `target` and `stages`. Each stage carries its files, skills, inputs, output, and every resolved option with its rung. No field holds the hash of the folder just resolved.
- `bot assembly list --home DIR --json` returns `name`, `kind`, `source`, `updated`, `target`, and `broken` for each installed assembly. No field identifies the installed bytes.
- `bot run show RUN -j` reports `run`, `state`, `startedAt`, `endedAt`, `exit`, and `cause` (`run-show.ts:22`). Full detail is deliberately `bot run events` (matrix row `2026-09-11-bot-run-show-j-omits-the-choice-the-gates-and-the-cost.md`), so the number is reachable for a finished run by reading the whole record and finding the field.

The offline check is the seam a program uses before spending anything. Two callers need the identity there. A harness that measures one assembly against a question set has to name the thing it measured in its report, and it currently copies Bot's hash rule into its own code, which goes stale silently. A search that compiles a candidate assembly and asks for a verdict has to report that candidate's identity before the run starts, and today it can only learn the identity afterwards from the record of a run that already cost money.

Smallest outcome that closes it: `bot assembly check` reports the same hash `run_start` would record for the same resolved target, in both output modes, and `bot assembly list` reports the installed hash per row. No new hash rule, no new command.

Review trigger: 2026-12-14, or the first consumer that pins a hash of its own.
