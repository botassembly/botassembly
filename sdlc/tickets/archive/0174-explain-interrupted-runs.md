---
flow: build
priority: 7
---
# A partial run still explains the work it completed

`bot explain` currently discards the complete explanation of an entire run when any recorded `stage_start` has no matching `stage_end`. `bot/src/explain.ts` returns “This run has no readable completed stage explanation” before it reads the completed attempts. This is common after an interrupted later stage and hides exactly the earlier work an operator needs for a post-mortem.

Done, observably:

- Given a run where one stage completed and a later stage started but was interrupted before `stage_end`, `bot explain` succeeds and preserves the same complete-stage facts it reports today.
- The reading also names each started but incomplete stage by its recorded stage, repeat when present, and retry. It clearly distinguishes “no terminal stage outcome was recorded” from a completed failure and does not invent output, sealed, or judged facts.
- Recorded turns and settled transcript tool work from an incomplete stage remain readable when their evidence exists. Missing or unreadable transcript evidence is labeled on that stage without erasing other readable stages.
- Stage narrowing works for both a completed stage and an incomplete stage in the same partial run.
- Human output explains the partial state plainly. JSON remains one newline-terminated, schema-versioned object whose completed-stage facts retain their current meanings and units.
- The command help says that completed and interrupted work can both be explained.

Hard choices, settled: partial evidence is useful evidence, but absence stays explicit. A missing `stage_end` is never converted into a guessed exit, cause, output, seal, or judgment. One unreadable attempt does not make another readable attempt disappear.

Boundary: change only the read-only `bot explain` surface and its help. Do not change run recording, stage settlement, session transcripts, sealed storage, `bot show`, `bot runs`, or `bot logs`. Do not add recovery or resume behavior. Trials8 is the first human consumer of this additive explanation during session-efficiency review; no Trials8 source currently parses the JSON, so no consumer code adoption is required.
