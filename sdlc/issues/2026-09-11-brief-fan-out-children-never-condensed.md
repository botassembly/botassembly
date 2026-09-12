# The shipped brief run fanned out to three children that never condensed anything

Run `examples/runs/brief/2026-09-11T17-55-28-2640`, stage `03-collect`, called the `summarize` subflow three times. Every child ended `exit 1`, cause `timeout`, after 120 seconds. The parent agent then read the three notes itself in one 13,887-token turn, wrote the summaries, passed the output check, and the stage ended `success`. The run exit is 0. The fan-out the example exists to show never produced a result.

Observed on 2026-09-11 while reading the shipped records for marketing evidence.

Why the children hung. The parent passed `text: "$INPUT/note-1.txt"`, seventeen bytes, as each child's request. The child's `request.txt` therefore holds that literal path. The child's stage file, `flows/brief/subflows/summarize/01-condense.md`, tells the agent to "read the JSON object in $INPUT" holding an `id` and an `input` with the note under `text`. Nothing of that shape exists in the child's input. The child's session shows `ls -la $INPUT` and `cat $INPUT/request.txt` repeated a dozen times, then `find / -name "note-1.txt"`, which walks the whole filesystem until the 120-second timeout ends the stage. All three children did the same.

Two things need a ruling.

The example. Either the parent stage should pass the note's text in the subflow call, or the child stage should say it receives a path and read it. The contract between `03-collect/STAGE.md` and `01-condense.md` is wrong as authored, and CI passes because `bot check` cannot see it and the parent improvised its way to exit 0. The published record should show the fan-out working, or the example should not claim a fan-out.

The runtime. A stage whose subflow calls all failed still ended in success because the output check only looks at the output file. That is by design and the record is honest about it. Whether a stage should be allowed to pass after every child it called failed is a specification question. At minimum the reader of `bot show` should see the three failed calls near the verdict rather than sixteen lines above it.
