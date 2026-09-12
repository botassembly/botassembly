# The falsification ledger

Every smoke session breaks one rung on purpose before it reports green, and
writes the break down here. The rule itself is in `README.md`; this file is
where keeping it becomes checkable by someone who was not there.

Without it the discipline could only be claimed. "We always break one" is the
kind of sentence that stays true in a README long after it stopped being true in
practice — the vacuous pass the rule was written against, turned on the rule.
A ledger makes nobody do it. It makes the not-doing visible.

`run.sh` does not read this file and does not enforce it: an empty ledger blocks
no ladder, and a full one proves nothing about the run after it.

## Writing an entry

Newest at the bottom, so the file reads in the order the sessions happened.

- **Date** — the day the ladder was run, `YYYY-MM-DD`.
- **Rung** — S1 through S6.
- **What was broken** — precisely enough to repeat: which file, which line.
  "Broke the canary" is not an entry; "deleted the canary from the sealed
  `output.txt` of S1's `01-echo` attempt 1" is.
- **The red observed** — the assertion's own name, copied from the validator.
  That is the point of the exercise: the name that went red must be the name
  that covers the thing broken. A break that reddens some other assertion, or
  twenty of them, or none, is a finding about the validator and wants a ticket.

Restore, re-run the rung, and see it green again before reporting. A ladder
called green off a tree that still holds the break is the worse lie.

## The ledger

| Date | Rung | What was broken | The red observed |
| ---- | ---- | --------------- | ---------------- |
| 2026-08-06 | S6 | moved the S5 run's sealed answer aside — `runs/2026-08-06T11-54-37-d27c/stages/02-join/1/1/output.txt` renamed `.aside`, then `SMOKE_SESSION=<wreckage> smoke/run.sh 6` | `the record names a sealed output for the run, and it is there` and `bot output hands back exactly the bytes S5's last stage sealed` — those two, nothing else; the verb refused in one sentence naming the missing path. Restored cmp-identical, rung 6 green again. |
| 2026-08-06 | S6 (eleven-rung session) | moved the S5 run's SESSION aside — `runs/2026-08-06T13-43-09-3a02/stages/02-join/1/session.jsonl` renamed `.aside`, then `SMOKE_SESSION=<wreckage> smoke/run.sh 6` | five reds, all readers of that one file: the record's pointer, `bot session --raw`, both rendered-session assertions, and `bot logs` naming the join's subflow call (its row went `no-session`). One artifact, five readers — coherent, not a cascade. Restored, rung 6 green again. |
| 2026-08-06 | S6 (first SEALED ladder) | flipped the FIRST BYTE of the S5 run's sealed answer IN PLACE — `runs/2026-08-06T17-18-27-0447/stages/02-join/1/1/output.txt`, one `dd conv=notrunc` byte, file present and same length — then replayed rung 6 | **NONE. All 45 assertions green, exit 0.** The byte-equality assertion compares `bot output` to the sealed file ITSELF, so both sides read the corrupted bytes — self-confirming under content corruption; it catches a seal that is GONE, never one that LIES. The record carries each seal's sha256 (`stage_end.output.sha256`) and neither the validator nor `bot output` consults it. This is the ledger's stated finding case ("or none") and it wants a ticket: **ticket 0147**, cut the same hour. Restored cmp-identical. |
| 2026-08-06 | S6 (first SEALED ladder, control) | the row-1 break repeated to prove today's replay judges at all: the same sealed answer renamed `.aside`, replayed | exactly the two covering reds (`the record names a sealed output for the run, and it is there`; `bot output hands back exactly the bytes S5's last stage sealed` — the verb refusing in one sentence naming the missing path), exit 1, nothing else. Restored cmp-identical, rung 6 green again. |
| 2026-08-06 | S6 (ticket 0147 leg 1 landing, replay) | the NONE-red row's hole closed and falsified from BOTH sides against the same wreckage: (a) builder — one byte of the sealed answer flipped in place (`dd conv=notrunc`, file present, same length), the row-3 break repeated; (b) driver — one hex character of the RECORD's `stage_end.output.sha256` flipped (`3f67b04…` → `4f67b04…`), the sealed file left intact | both times exactly ONE red, the new assertion `the sealed file still holds the bytes the record says the stage sealed`, its detail naming both hashes; the byte-equality assertion stayed green both times (its subject is the verb, not the file). Break (a) proves the assertion catches a file that lies; break (b) proves it consults the record rather than hashing the file against itself. Both restored `cp`-then-`cmp`-identical, rung 6 green again (48 assertions). |
| 2026-09-09 | S6 (ticket 0221 live acceptance replay) | moved the S5 run's 37-byte sealed answer aside at `runs/2026-09-09T13-02-10-f602/stages/02-join/1/1/output.txt`, then replayed S6 against `/tmp/tmp.K5eMD5rkU7/bot-smoke/2026-09-09T13-00-59-9d4b1778` | exactly one red: `bot run output --raw hands back bytes matching the record's sealed hash`. The command exited 1 and returned no bytes. Restored the file, confirmed SHA-256 `3f67b04469560b04862840470da5b0dfcde24052278592f08ef082cc51ab7409`, and replayed all 47 assertions green. |
| 2026-09-09 | S6 (ticket 0068 unset-`TMPDIR` live acceptance) | moved the S5 run's sealed answer aside at `runs/2026-09-09T14-38-49-979f/stages/02-join/1/1/output.txt`, then replayed S6 against `/tmp/bot-smoke/2026-09-09T14-37-42-a6fc28fd` | exactly one red: `bot run output --raw hands back bytes matching the record's sealed hash`. The command exited 1 and returned no bytes. Restored the file, confirmed SHA-256 `3f67b04469560b04862840470da5b0dfcde24052278592f08ef082cc51ab7409`, and replayed all 47 assertions green. |
| 2026-09-10 | S6 (ticket 0083 saved-session migration replay) | moved the S5 join scratch root named by `bot run show RUN -j` aside at `/tmp/tmp.K5eMD5rkU7/bot-smoke/2026-09-09T13-00-59-9d4b1778/cache/bot/tmp/9ba1c4895937456d/2026-09-09T13-02-10-f602/47e0d54d2eb717dc`, then replayed `SMOKE_SESSION=/tmp/tmp.K5eMD5rkU7/bot-smoke/2026-09-09T13-00-59-9d4b1778 smoke/run.sh 6` | exactly one red: `bot run show names three distinct stage scratch paths`. The reported path disappeared from the supported JSON reading; all other assertions stayed green. Restored the directory in place and replayed all 47 assertions green. |

The ledger opens with ticket 0138; earlier sessions broke rungs and said so in
their handoffs, and those are not backfilled — an entry nobody can check is the
thing this file exists to stop.

**S7 through S11 (ticket 0141) still owe their first live break.** They were
built without a ladder being run at all — a builder never runs a rung — and each
validator was falsified against SYNTHETIC wreckage instead: a hand-written
`record.jsonl` in a scratch home, one field edited at a time, each edit reddening
the assertion that covers it and no other. That is a real exercise and it is
where those validators' names were shown to work, but it is not this ledger's
subject: no model was called and no token was spent, so nothing was proved about
the pair. The first session that runs these rungs breaks one of them for real and
writes the row. (They have now run LIVE and GREEN twice — 2026-08-06's
eleven-rung and sealed ladders — but breaking one for real means re-running it
live against spend, which is a separately-approved purchase; the debt stands,
stated honestly rather than quietly retired.)

A lesson from the ledger's first day, paid for in tokens: `SMOKE_SESSION`
replay is free ONLY for rung 6. Handing a wreckage session to rungs 1-5 does
not re-judge the saved run — it runs the fixture again, live, against real
spend, and judges the NEW run. The driver learned this by corrupting a seal,
"replaying" rung 5, and watching it pass green while 7.5k tokens quietly
bought a fresh, uncorrupted run. Break-on-purpose goes through rung 6, or it
goes through the wallet.
