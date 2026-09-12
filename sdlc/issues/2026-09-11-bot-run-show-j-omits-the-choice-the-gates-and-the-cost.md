# `bot run show -j` omits the choice, the gates, the hooks, and the cost

`guides/first-assembly.md` presents three readings as the way to read a record, and describes
this one as "the bounded machine-readable summary":

```sh
bot run list
bot run show RUN -j
bot run output RUN --raw
```

For a run with a checklist, a JSON schema, a `CHOOSE`, a two-gate folder, and before/success
hooks, `bot run show -j` returned per stage: `identity`, `stage`, `repeat`, `attempt`, `state`,
`exit`, `cause`, `scratch`. Nothing else. Not which alternative the chooser picked or why, not
which gates ran or their verdicts, not the hooks, not a token or cost figure anywhere in the
document.

All of it is in the record, and the human `bot show` prints it — `chose 02-route/1 urgent over
routine — ...`, `authoritative gate verdict: gate passed, flows/triage/03-verify/gate/01-blocker`,
`hook 01-classify/1 success hook, exit 0`, and a per-stage token table.

So the machine-readable reading the getting-started guide points at is the one that answers the
fewest of the questions the guide says the record answers ("the request, a copy of the assembly,
each stage's output and transcript, the checks, and the token totals"). A scripted consumer has
to fall back to parsing `bot show`'s human output or reading `record.jsonl` directly.
