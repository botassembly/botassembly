---
flow: build
priority: 5
---
# Bot logs name what each call touched

`bot logs` lists every settled tool call as run, stage, tool, outcome, and duration. It never shows what the call was aimed at. On 2026-08-28 an operator needed to learn what a verify stage had done to live state and the logs could only say the stage made bash calls. The answer required reading the raw transcript at `~/.local/share/bot/runs/<run-id>/stages/05-verify/1/session.jsonl` by hand. The transcript held the fact the whole time: a call that registered a sandbox directory into the operator's live project registry. The record was sealed and complete and the reading could not surface it.

This stays bot's job. What one run did is the question `bot` owns, and the transcript already carries each call's arguments. Whether such a write should have been possible belongs to factory ticket 0167 and is not this ticket.

Done, observably:

- `bot logs <run>` gains a target column or a `--args` flag, printing a bounded first-line summary of each call's primary argument: the command line for a shell call, the path for a file call, capped at a fixed width the implementer chooses and documents in `bot logs --help`.
- The summary comes from the stored session transcript. No re-execution, no inference beyond reading the recorded arguments.
- Running the new form against the 2026-08-28 verify stage's run shows the registering command without opening `session.jsonl`.
- Bare `bot logs` across many runs keeps its current columns and pagination, so existing pipes such as `bot logs --failed | awk '{print $3}'` keep working. The new information appears only when asked for.

Boundary: change the logs reading and its help text in the bot CLI only. Do not change what a run records, the session transcript format, the sealed record layout under `~/.local/share/bot/runs/`, or any other verb. Do not add filtering that classifies calls as safe or unsafe; the reading reports, the reader judges.
