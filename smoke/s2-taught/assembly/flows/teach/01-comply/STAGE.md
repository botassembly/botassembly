---
retries: 2
---

`$INPUT/request.txt` holds one line, and that line is a token.

Write a JSON object to `$OUTPUT` with exactly two keys:

- `word` — built from the token: start with the token exactly as it appears
  and keep it at the front of the value
- `checked` — `true`

Mark each checklist item below with the `mark` tool as you finish it. An item
left unmarked blocks the stage.

## Checklist

- Read `$INPUT/request.txt` and take the token from it
- Write the JSON object to `$OUTPUT`
