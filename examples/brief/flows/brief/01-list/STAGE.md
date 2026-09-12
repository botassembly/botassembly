---
timeout: 300
---

Read the week's notes in $INPUT. Each line is one note.

Write to $OUTPUT a JSON object with one key `notes`, an array with one entry per
line, in the order given. Each entry has exactly `id` (`note-1`, `note-2`,
`note-3`, by position) and `input` (an object with one key `text` holding the
line as written).
