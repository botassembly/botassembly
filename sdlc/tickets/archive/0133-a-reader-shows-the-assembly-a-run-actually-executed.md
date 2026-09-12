---
flow: build
priority: 7
---
# A reader shows the assembly a run actually executed

Every run seals a copy of the assembly it ran under. It is on disk today at `<run>/assembly/`, beside `record.jsonl`, `request.txt` and `stages/`. Nothing can read it by run id.

That gap stopped work on 2026-08-23. Deck ticket 0038 refused at design, correctly:

> Ticket 0038 cannot be implemented within deck's settled read-only reader boundary: bot exposes no run-id-based command to list or read a sealed `assembly/` capture. Direct filesystem access, a second parser, or importing bot modules would violate ADR 0005 and ticket 0010's refusal addendum.

That is the right refusal. Deck reads run directories only through bot's own readers, and it declined to break that rather than reach into the filesystem. So the capability has to exist here.

## Why it matters beyond one page

Ian's standing question about this system is whether a person can see what a run actually did, and the sealed assembly is the part that answers "what instructions was it following". Everything else about a run is already readable and this is not.

It also answers a question that came up today and could not be settled: whether a landed assembly change was in force for a given run. The assembly deploys by symlink into a checkout, so what is on disk now is not evidence about what ran an hour ago. The sealed copy is the only record of that, and it is unreachable.

## What done looks like, observably

- A run's sealed assembly can be listed and read by run id, through bot, without the caller knowing where runs live on disk or how a run directory is laid out. Listing and reading are both needed: a caller has to discover what is in there before it can ask for a file.
- Output is available as JSON, because the consumer is a program. What the human-readable form looks like is design's call.
- A run whose assembly capture is absent, unreadable, or partial is reported as such and distinguishably so — "there is no capture" and "the capture could not be read" are different facts and a caller must be able to tell them apart. Older runs predate the capture and must not read as an error.
- The reader tolerates what it cannot open rather than dying on it. This repository has now been bitten three times in one day by walkers of its own storage failing on an unreadable directory, and 0129 exists because of it. A new reader that repeats that would be a fourth.
- Path traversal is refused. The run id and the requested path are both untrusted input, and a reader that will return `../../` anything is a hole.

## What this replaces

Nothing. This adds a reader; no existing behavior changes. Assertions about the existing run readers keep full strength.

## Consumers

Deck is the consumer and its ticket already exists: **deck 0038**, which is blocked waiting for this and carries the draft that named the gap (`deck sdlc/tickets/drafts/0039-*`). Deck's side must be green against the bot that is deployed when it flies, so 0038 waits on this landing and deploying — `bot` runs from `repos/botassembly/bot/src/cli.ts` via `~/.local/bin/bot`, so landing is deploying here.

## Boundary

- Read only. Nothing writes, edits, replays, or re-runs a sealed assembly. Replay is a different and much larger idea and is refused as speculation until something needs it.
- No change to what a run seals or where it seals it. This reads what is already written.
- Not in scope: diffing a sealed assembly against the current one, or against another run's. That is an obvious next thing to want and it needs a consumer before it earns a design.
- No new storage, index, or cache. The run directory is the source of truth, as it is for every other reader.
