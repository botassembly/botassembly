# `bot run list` prints relative ages under `startedAt` and `endedAt`, and they read backwards

```
$ bot run list
| id | assembly | flow | startedAt | endedAt | duration | state | exit | cause | tokens |
| 2026-09-11T12-30-23-4c66 | ... | digest | 15s | 5s | 9412ms | ended | 0 | success | 23.2K |
```

`startedAt` shows `15s` and `endedAt` shows `5s`. They are ages — how long ago each happened —
so the run appears to have ended ten seconds before it started. The same row in `-j` carries the
correct absolute values:

```
"startedAt":"2026-09-11T12:30:23.004Z","endedAt":"2026-09-11T12:30:32.416Z"
```

Two runs minutes apart both collapse to `4m`/`4m` and `5m`/`5m`, so the human listing also cannot
order or date anything past the first minute. The column headings are the JSON field names,
which tells the reader to expect timestamps.
