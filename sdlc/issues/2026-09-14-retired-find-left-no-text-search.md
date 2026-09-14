# Nothing searches text across runs and sessions

Observed 2026-09-14 at commit `44d8dbf` on the Linux box.

`bot find text` was retired and nothing replaced it. `bot/tests/cli-legacy-retirement.test.ts:16` pins it as refused, and `bot capabilities --json` lists no operation that reads text across runs. Its disposable index still exists in the operator's cache (`specification/CHANGELOG.md:86`), which is the cleanup half of the same story.

What remains is exact-field filtering and one-run reading.

- `bot run list` filters on `--assembly`, `--flow`, `--state`, `--cause`, `--since`, and `--until`, and pages with `--after`. No filter matches text.
- `bot run session RUN STAGE` reads one stage session of one run, paged. There is no operation over many sessions.
- The library exports `settledSessionTools` and `renderSessionTools` (`bot/src/session.ts:53,77`), which read the settled tool calls of one session string. Nothing aggregates them.

Answering "which runs of this flow called this tool, and what did it get back" therefore means enumerating runs, opening each session, and matching bytes in the caller. Two consumers need it done once, in the owner. A reader that offers a person one search box has nothing to route a session query to. A harness that builds question sets out of work already done needs to harvest tool calls across many runs, which is the same read.

This is also the first retired operation with no supported replacement, which the project's own standard for the command surface does not allow.

Smallest outcome that closes it: one read-only operation matches literal text across the runs of one home and names the run, the stage, and the position of each hit, bounded and paged like every other listing, with a versioned document. Ranking, an index, and a stored query are not part of it.

Review trigger: 2026-12-14.
