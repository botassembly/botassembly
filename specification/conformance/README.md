# The conformance corpus

This is the executable form of the specification, promised by
[../conformance.md](../conformance.md): assemblies that must be accepted,
assemblies that must be refused, and the exact behavior expected of each,
seeded from prototype P5 (2026-07-31). No case calls a model; the whole suite
runs offline.

A case is a whole invocation, not only a folder. Each holds the assembly under
`assembly/`, any home configuration under `home/` (a `config.yaml`, and
`home/assemblies/` where a case needs one), the command line — one line — in
`invocation`, and the expectation in `expected.jsonl`. Paths in the invocation
are relative to the case directory; a few cases carry a `task.md` beside the
assembly because the invocation names one.

The harness sets `BOT_HOME` to each case's own `home/` and preserves every other environment entry. An empty case home is intentional. Ambient `HOME`, `XDG_CONFIG_HOME`, and `BOT_HOME` values never supply a case's defaults.

For a refuse case, `expected.jsonl` holds one `{"code", "path"}` object per
fault and asserts them as a set — the order faults are reported in is not
specified, and the sentence is never asserted. The runtime must exit `2`. For
an accept case, `expected.jsonl` is the exact JSONL output from the assembly-check
reader used by the conformance harness, byte for byte and stable across runs —
that two runtimes reading the same case produce the same lines is the claim the
corpus exists to test.
