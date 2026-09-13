---
---

`$INPUT/request.txt` holds one line.

If that line contains `HALT-9F2C`, call the `refuse` tool with the reason
`the request carries HALT-9F2C`, and write nothing to `$OUTPUT`.

If that line does not contain `HALT-9F2C`, write the line to `$OUTPUT` exactly
as it appears, and nothing else.
