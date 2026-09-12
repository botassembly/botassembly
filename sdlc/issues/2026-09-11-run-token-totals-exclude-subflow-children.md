# A run's reported token total excludes every subflow child

A fan-out run over three items reported:

```
$ bot show 2026-09-11T12-44-17-926a
stage      verdict         input       output         total
01-list    success   input: 8.4K  output: 272   total: 8.6K
03-gather  success  input: 22.6K  output: 535  total: 23.1K
total                 input: 31K  output: 807  total: 31.8K
```

`bot run list` agrees: `tokens 31.8K`.

Summing every `turn` event in the record tree, the children included:

```
parent-only turn tokens: 31757
all turn tokens:        142781
```

The run actually cost 4.5x what its own record reports. The children are all present on disk —
seven `record.jsonl` files under that one run — and `bot show` names each `subflow_call` with
its child path, so the evidence is retained. It is only the roll-up that stops at the parent.

`guides/authoring-assemblies.md` states the rule this breaks: "the record never lies (what ran,
what was judged, what it cost — all on disk, `bot show` reads it)". The headline total is the
number a reader will quote, and for any assembly using subflows, fan-out, or descend it is the
small fraction.

The two token-bearing readings, `bot run list` and `bot show`, both carry the parent-only
figure with no marker saying children are excluded.
