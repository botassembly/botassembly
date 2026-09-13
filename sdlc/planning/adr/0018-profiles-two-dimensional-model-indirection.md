# ADR 0018 — Profiles: two-dimensional model indirection, defined by the home

**Status:** accepted (Ian, 2026-08-06 — same day as the draft; the
field words are RATIFIED as `profile` and `tier`, and
`--profile`/`--tier` land on the command line with dimension one) ·
**Date:** 2026-08-06 ·
**Amends:** nothing — direct `provider`/`model`/`reasoning` keep
working exactly as specified; this adds a second way to say the same
thing.

## Decision

**1. Two fields at the use site, riding the existing resolution
chain.** A stage, flow, assembly, command line, or home default may
name `profile` (the role: `coder`, `reviewer`, `writer`) and `tier`
(the effort class: `quick`, `hard` — whatever the operator calls
them). Each resolves through the same eight-rung chain as `model` and
`reasoning` do today, independently — so an assembly can fix
`tier: hard` for a hard flow while stages vary their roles, or fix
the role while one stage escalates its tier.

**2. The table lives in the home's `config.yaml`, under one new
closed key.** Each cell is a complete bundle — provider, model,
reasoning, and any future field (context budget, compaction point)
hangs here:

```yaml
profiles:
  coder:
    quick: { provider: openai-codex, model: gpt-5.6-luna, reasoning: low }
    hard:  { provider: anthropic, model: claude-opus-5, reasoning: xhigh }
  reviewer:
    hard:  { provider: anthropic, model: claude-fable-5, reasoning: max }
```

The home is the deliberate choice over a machine-wide file or the
assembly itself. Homes govern runs, so the control story falls out:
a trial home whose only difference is `coder` pointing at the new
model runs the same assemblies, and promoting the mapping is copying
one block. A machine-global file would be a second ambient
configuration source (ADR 0017 just spent a week closing those); an
assembly-carried table would reintroduce edit-the-assembly upgrades,
the thing this exists to end. **Assemblies reference profiles; homes
define them.** An assembly naming a profile the home does not map
refuses, naming the missing row — the refusal is the setup
instruction.

**3. Named tiers, author-defined vocabulary, exact match — no
scores.** Everything in this system is exact-match-or-refuse; a
numeric score means nothing until a range rule interprets it, ranges
invite closest-match magic, and a typo'd number lands silently in
the wrong band where a typo'd name refuses loudly. Operators who
want score-flavored names can name their tiers `s1`/`s2`/`s3`. If a
profile has exactly one tier, `tier` may be omitted — unambiguous by
construction, no reserved word. More than one tier and none resolved
refuses.

**4. Directness is preserved by field shape, and precedence is by
nearness.** The model choice is one fact with two spellings: literal
(`provider`+`model`) or indirect (`profile`). ONE HOLDER spelling it
both ways is refused — no guessing which wins. ACROSS holders the
existing rule of the chain holds: the nearest holder that speaks
about the model choice supplies its spelling, so a stage's literal
`model` overrides an assembly's `profile` the same way it overrides
an assembly's literal `model` today, and vice versa. `reasoning`
named directly by a nearer holder overrides the reasoning a profile
bundle supplies — the bundle is a default, nearness is the law, same
as everywhere.

**5. The record stays honest.** A run records the resolved literal
provider/model/reasoning AND the profile/tier they resolved through,
in the same value-plus-from shape `bot show --json` already uses for
every resolved key. "What actually ran" never depends on remembering
what the table said that day.

**6. Anthropic-style rolling aliases are the operator's opt-in, not
bot's behavior.** Pointing a profile row at a provider's
latest-alias is a visible choice in one greppable file. Bot itself
never upgrades anything silently, and an operator who wants
switch-by-hand simply keeps literals — untouched by this ADR.

## Context

The driving case: GPT-5.7 ships and the operator wants controlled
migration, not global find-and-replace and not silent auto-upgrade.
One registry edit per home switches every assembly that opted into
the semantic name; a trial home stages the switch. The
two-dimensional shape (role × tier, each cell a full bundle) is
Ian's own strongest example made law: "coder at a hard level" may be
a different model entirely, not the same model thinking harder —
which a flat alias or a name-plus-reasoning split cannot express.
The runtime is already shaped for this: `provider`/`model`/
`reasoning` resolve through one chain with recorded provenance, and
`config.yaml` is already the closed-key defaults file; profiles are
one more hop in machinery that exists, not a subsystem.

## Consequences

- `config.yaml` gains one closed key; unknown keys inside a bundle
  refuse like a sentinel's (`key-unknown`), values out of bounds
  refuse (`value-invalid`) — the file's existing law extends to the
  table.
- Frontmatter and the command line gain `profile` and `tier`
  (`--profile`, `--tier`), joining the six keys the chain resolves.
  This touches spec chapters (invocation, home, assembly/stage key
  tables) and — deliberately — the conformance corpus: new keys and
  new refusals are corpus rows, cut as spec decisions with the
  ticket, never improvised by a builder.
- `bot check` resolves profiles exactly as `bot run` would, from the
  same home rung, and its report names both the profile and what it
  resolved to.
- Implementation is ticket 0146, positioned AFTER this ADR is
  ratified — the open word choices (the two field names; whether the
  CLI options land with dimension one) land in that ticket's pinned
  sentences and cannot be built ahead of the ruling.
