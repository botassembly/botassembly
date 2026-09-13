---
title: "Providers and models"
description: "Which models a machine can call and how intelligences map semantic names to model choices."
sidebar:
  order: 5
---

*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*

Which model runs a stage is answered from three places: the machine, which holds
the credentials and the catalog; the home, whose `config.yaml` sets defaults and
names model choices; and the assembly, which resolves its options through
[the eight rungs](/specification/running/#options-and-where-they-resolve).
`bot model list` reads the machine. The home's `config.yaml` holds its named choices. `bot assembly check` resolves the whole ladder against a real assembly.

## `bot model list`

The models this machine can call. `bot model list` reads Pi's local availability
snapshot without contacting a provider. Name a provider to narrow the same
local catalog. The provider name is an exact match, never a near one; a name no
catalog knows is refused, and the refusal names `bot auth list` as the place to
check credentials.

One line per model, in two-space columns: the provider, the model id, its
context window, the most it will write in one turn, whether it reasons, and
what a million tokens cost in and out. `--json` writes one object per model,
one per line, in the same order — a listing, so the one-record-per-line
convention holds. The object carries the same facts under `provider`, `model`,
`contextWindow`, `maxOutput`, `reasoning`, and `cost.input`/`cost.output`.

`bot model list [provider]` is the current bounded command. `--json` returns one version-1 `bot.model.list` document with a page and summary. `--offset` starts at a zero-based row and `--limit` returns at most 200 rows. Human output retains the existing model columns and reports how many rows it shows.

Without `--live`, the command reads Pi's local catalog and does not contact a provider. `--live` compares that set with current catalogs and may contact providers. Models found only locally say `local-only`; models found only by the refresh say `live-only`. A shared identity uses refreshed facts and has a null status. `PI_OFFLINE` vetoes catalog network. A failed or aborted live refresh exits 4 and prints no model rows. A named provider without a credential is reported before contacting that provider.

There is deliberately no provider table on this page: Pi's built-in catalog
moves with bot and local configuration may extend it. A list written here would rot. `bot model list` after
install is the machine's own answer, and `bot auth list` lists every provider a
credential could be added for. The pair this project's own live runs use, and what those
runs cost in tokens, is [what it costs](/guides/first-assembly/#what-it-costs).

Pi's local `models.json` is trusted operator input. It may add providers,
models, endpoints, headers, and authentication values. A leading `!command`
runs with the Bot process owner's filesystem and network authority. Bot checks
the agent directory and resolved model file owner and
permissions before loading the file. An owner-controlled model-file symlink is
allowed. This check is an account boundary and does not sandbox the
configuration.

Bot removes every environment name used by Pi's built-in provider credentials
from stage environments. A local model configuration may reference arbitrary environment names that Bot cannot discover, so those names cannot be scrubbed
automatically. Do not reference a value there that an assembly process must
not inherit.

It takes no `--home`. Models belong to the machine the way logins do — a home
configures which model a run asks for, never which models exist — so a `--home`
typed here is refused rather than ignored, exactly as `bot auth list` refuses one.

## Intelligences

A home's `config.yaml` may hold `intelligences`, a flat table of complete model
choices. Each row requires `model` and `reasoning`; `provider` is optional.
Assemblies name one with `intelligence` at any authored rung or with
`--intelligence`. The nearest name supplies the complete bundle.

```yaml
retries: 5
intelligences:
  default:
    provider: openai-codex
    model: gpt-5.6-luna
    reasoning: low
  coder-hard:
    provider: anthropic
    model: claude-opus-5
    reasoning: xhigh
```

When no rung names an intelligence, an executing agent uses the reserved
`default` row. A missing row is refused only when an agent needs it. The table
is read at run start, so changing it cannot alter a run already underway.

The file and every bundle are strict. Unknown top-level or bundle keys are
refused. Loose `provider`, `model`, and `reasoning` keys are retired; model
choice exists only inside an intelligence row. Credentials remain outside the
home configuration.
