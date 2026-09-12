# `bot auth list` is refused; the listing verb is the absent verb

```
$ bot auth list
request-invalid  list
  Use login, logout, or import.
exit 2
```

`bot auth` with no verb does list every provider and its credential status, and `bot auth --help`
says so. But `list` is the verb a reader reaches for, it is the verb every other noun in this CLI
takes (`bot run list`, `bot assembly list`, `bot runs`), and the refusal's repair line — "Use
login, logout, or import." — names three verbs that all *write*, without naming the bare form
that reads.

`docs/src/content/docs/reference/auth.md` documents the three verbs and the bare form. It does
not say `list` is refused, so the only way to learn it is to type it.
