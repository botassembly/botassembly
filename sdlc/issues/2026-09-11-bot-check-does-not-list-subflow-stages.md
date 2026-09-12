# `bot check` prints only the entry flow's root stages, so most of a run is invisible to it

`bot check` is documented as the pre-flight that "prints the stages in the order they would run",
and the authoring guide calls it "the fast loop".

For a fan-out assembly it printed three lines:

```
01-list    STAGE   input=request.txt  output=list.json  options=...
02-fan     FANOUT  input=list.json    output=<item>.txt options=
03-gather  STAGE   input=<item>.txt   output=gather.txt options=...
```

The run then executed seven agent stages: those three, plus one `worker` child per item, plus
three more the successor stage called on its own. For a `DESCEND` assembly the check printed one
line and said nothing about the self-calling flow at all.

Two consequences. The option ladder — the thing the `options=` column exists to resolve — is
never shown for any subflow stage, so an author cannot see which intelligence, timeout, or
retry budget a child will run with until it has already run. And the `02-fan` row's
`options=` field is empty, which reads as "no options resolve here" rather than "the options
resolve inside a flow this command does not walk".

`bot check --json` has the same shape.
