---
flow: build
priority: 6
---
# An old record reads under a new bot

The record's first line names the format version that wrote it
(invariant 48), and the spec now says what that line is for
(record.md, ruled 2026-08-22): additive fields are not a new
format and readers ignore what they do not recognize; a
non-additive change is a new generation, and a runtime that
reads records carries automatic in-memory migration for every
prior generation — the file on disk is never rewritten, and an
unknown generation is refused by name, never guessed at.

Nothing in bot implements that policy yet. Every format change
during development was handled by regenerating the conformance
corpus's expected records — rewriting history, which works only
while nobody is keeping any. The first time a real home holds
months of records across a format break, the inspection verbs
(`runs`, `show`, `status`, `logs`, `session`, and the deck
through them) either read the old generation or the history
goes dark.

## Why it matters

- A record is meant to be read forever. A version line with no
  migration behind it is a plan, not a policy — the reader that
  meets an old record today has no defined behavior at all.
- The deck is the observation level for the whole factory and
  reads run directories only through bot's own readers. If bot
  cannot read a generation, no layer above it can compensate.
- Doing it now is cheap: there is one generation, no users, and
  no old records anyone cares about. The machinery is small
  while the chain has one link; retrofitting it after a break
  ships is when it gets expensive.

## What done looks like, observably

- A single reading path normalizes every record to the current
  in-memory shape before any inspection logic sees it: chained
  migrations, each total (every reachable old shape maps to a
  defined new one), applied automatically on read. Disk is
  never touched by a reader.
- A reader that meets a version above what it carries, or one
  it has no chain to, refuses with the version named — never a
  parse error, never a guess.
- Unknown fields on known event kinds are ignored on read, so
  additive growth needs no version bump and no code change in
  readers that do not use the new field.
- The conformance corpus keeps a frozen record from each
  retired generation, and reading it to the byte-exact current
  inspection output is a corpus case. Seeded now with a frozen
  copy of the current generation, so the first real break has
  something to prove itself against.

## Prior art, deliberately

The pattern is pi's: sessions migrate v1→v2→v3 on load, in
memory, with a missing version read as v1; the harness v3
design tightens it to chained migrations that must be total and
ship in the same change as the format break. The pi build bot
already embeds (`pi-agent-core` 0.83.0) does not export that
machinery — its shipped storage refuses non-current versions
outright — so this is written fresh, but small, on Node
built-ins only. No new dependency; the shape is copied, not the
code.

## Boundary

Records only. Sessions are pi's files under pi's versioning;
bot's job there stays what it is — retain the bytes and read
them through pi. This ticket adds no verification, hashing, or
integrity machinery anywhere: it is about staying readable, not
about proving untouched.
