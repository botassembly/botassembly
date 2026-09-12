# `tail-container` — "End the sequence with a stage" appears in no document

Six deliberately malformed container assemblies were checked. Five of the six were refused with
the fault being probed *and* a second fault nobody was probing:

```
tail-container  flows/f/01-p
  End the sequence with a stage.
```

It fires whenever a flow's last element is a `LOOP`, `CHOOSE`, or `PARALLEL` folder. It is a
real rule and a defensible one, and `bot check` enforces it correctly and cheaply.

It is not written down. Grepping the published docs and the specification elements:
`guides/authoring-assemblies.md` shows a flow ending in a stage but never says it must;
`specification/elements/parallel.md`, `loop.md`, `choose.md`, `flow.md`, and `graph.md` do not
mention it; `refusals.md` does not list the code.

The example that authors will copy first is the one in `choose.md`, whose listing shows
`04-respond/` with `CHOOSE.md` as the only element under discussion. An author who ends a flow
that way learns the rule from a refusal.
