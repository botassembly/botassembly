---
flow: quickfix
priority: 9
---
# A run is listed only once its record can be read

`bot runs --json` can emit an entry for a run that has been created but
whose record has not been written yet. On 2026-08-20 at 13:52Z the
listing contained:

    {"id":"2026-08-20T13-52-17-500e","assembly":null,"flow":null,
     "startedAt":null,"state":"running","tokens":null}

Three fields the schema presents as strings came back null. The window
is small — a run is only mid-birth for a moment — but a tick runs every
minute, so it is hit regularly.

The consumer that noticed is the factory, whose reader requires those
fields to be strings and rejects the whole document when one entry
fails. That rejection disables the factory's crash-recovery pass. The
factory has its own fault there and its own ticket; this ticket is the
source of the bad reading, and fixing it here is what stops the race.

Done, observably: a run appears in `bot runs` and `bot runs --json`
only when its record can be read, and every entry in a `--json`
document has the types the schema promises. A run created while the
listing is being built is either absent or complete — never present
with null fields.

Settled choices:

- Absence is the right answer for a run whose record is not yet
  readable. A run that started a moment ago and is not yet listed is
  accurate; an entry claiming a null assembly is not.
- Do not widen the schema to make the nulls legal. A consumer that
  must handle nulls in `assembly` and `startedAt` has to invent a
  meaning for them, and there isn't one.
- If a record is unreadable for any reason other than being mid-write
  — corrupt, truncated, partially deleted — that is a different
  condition and may still be listed, because an operator needs to see
  it. Say which case is which in the record.
