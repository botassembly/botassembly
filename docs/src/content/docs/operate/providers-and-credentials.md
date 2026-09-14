---
title: "Providers, models, and credentials"
description: "Define an intelligence in the home's config.yaml, find out which models your machine can call, and give bot a credential."
---

A real model call needs three things: the name a stage asks for, the model that answers it, and the credential that pays for it.

Three places decide which model runs a stage. The machine holds the credentials and the catalog of models it can reach. The home's `config.yaml` names model choices. The assembly names one of those choices.

Pi is the open-source agent library the runtime is built on. `bot` bundles it and never calls a provider except through it. Pi owns the model catalog and the credential file.

## An intelligence

An intelligence is a name for one complete model choice: a provider, a model, and a reasoning level. An assembly names an intelligence. It never names a vendor's version string.

Intelligences live in the home's `config.yaml`, in one flat table.

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

Each row requires `model` and `reasoning`. `provider` is optional, and a row without one whose model is ambiguous names the candidate providers instead of guessing.

The runtime accepts exactly six reasoning values: `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Any other value is refused as `value-invalid` against `config.yaml`.

An assembly names a row with `intelligence` in any of its own files, or a command line names one with `--intelligence`. The nearest name wins and supplies the whole bundle. When nothing names one, the executing agent uses the reserved `default` row. A missing row is refused only when an agent needs it.

The table is read at run start, so changing it cannot alter a run already underway.

The file is strict. Unknown top-level keys and unknown bundle keys are refused. Loose `provider`, `model`, and `reasoning` keys at the top level are retired. Model choice exists only inside an intelligence row. Credentials never go in this file.

Upgrading a model is one edit here. It is never a sweep through every stage of every flow.

## Which models this machine can call

```sh
bot model list
bot model list openai-codex
```

`bot model list` reads Pi's local availability snapshot and contacts no provider. Naming a provider narrows the same local catalog. The provider name is an exact match, never a near one. A name no catalog knows is refused, and the refusal names `bot auth list` as the place to check credentials.

One line per model, in two-space columns: the provider, the model id, its context window, the most it will write in one turn, whether it reasons, and what a million tokens cost in and out. `--json` returns one structured document with a page and a summary. `--offset` starts at a zero-based row and `--limit` returns at most 200 rows.

Without `--live`, the command reads Pi's local catalog and does not contact a provider. `--live` compares that set with current catalogs and may contact providers. Models found only locally say `local-only`. Models found only by the refresh say `live-only`. A shared identity uses refreshed facts. `PI_OFFLINE` vetoes catalog network. A failed or aborted live refresh exits `4` and prints no model rows. A named provider without a credential is reported before contacting that provider.

Pi's built-in catalog moves with `bot`, and local configuration may extend it, so no fixed provider list is accurate for long. `bot model list` after install is your machine's own answer.

`bot model list` takes no `--home`. Models belong to the machine. A home configures which model a run asks for, never which models exist, so a `--home` typed here is refused rather than ignored.

## Credentials

Credentials belong to the machine. They never go in an assembly and never go in `config.yaml`.

There is one primary route and one alternative.

**Sign in through `bot`.** This is the route to use.

```sh
bot auth login openai-codex
```

That runs the provider's own sign-in. `bot` prints the URL and you open it, so this works over ssh. Pi keeps the result in `auth.json` under its resolved agent directory, which defaults to `~/.pi/agent/auth.json`. There is one such file per machine. You sign in once and everything you run afterwards uses it.

**Or put the provider's own key in your environment.** The provider's documented variable works the way its own tools take it. A stored sign-in wins over the environment for its own provider.

```sh
bot auth list
bot auth logout openai-codex
```

`bot auth list` prints one line per provider with its method and its state. `bot auth logout` takes one credential back out. Nothing here ever prints a credential.

Rows expose only the provider name, the method, which is `login`, `key`, or `ambient-only`, the state, which is `stored` or `unobserved`, and the stored credential type. Stored public metadata is the only evidence this command uses. Every provider without it is `unobserved`, and unobserved does not mean unavailable. The command never asks Pi for provider authentication status, resolves ambient secrets, probes provider files, runs provider commands, or uses the network.

`bot auth list` accepts `--offset` and `--limit`, with a default page of 50 providers and a maximum of 200.

Older `bot` credential files remain preserved but inactive. Commands that need authentication warn once when such a file exists. `bot auth import SOURCE` copies one compatible retired file into an empty Pi store. It never merges, never overwrites, never changes the source, and never resolves a credential value. Both stores must be owner-only files in owner-only directories.

`bot auth list`, `bot model list`, and `bot capabilities` all refuse `--home`.

The format's own rules for all of this sit in the specification: [authentication](/specification/running/#authentication), [the commands](/specification/running/#the-commands), [the listing](/specification/running/#the-listing), [logging in](/specification/running/#logging-in), and [the laws](/specification/running/#the-laws).

## What it costs

A run is billed by the provider you configured, per token. The runtime adds nothing and caps nothing.

Your total depends on the model, the request length, the number of stages, and how many times a check sends a stage back. `bot model list` prints the input and output prices reported for models your machine can call. Each turn records its provider token counts, and `bot run list` sums the verified totals.

## Protecting the model file

Pi's local `models.json` is trusted operator input. It may add providers, models, endpoints, headers, and authentication values. A leading `!command` in it runs with the `bot` process owner's filesystem and network authority.

`bot` checks the paths before loading the file. An existing Pi agent directory must be a real directory owned by the effective user with mode `0700`. An existing `models.json` must be a real regular file owned by the effective user with mode `0600`. A symbolic link is refused. Missing paths remain valid, and `bot` never creates a model file.

For a linked default model file, replace the link with a private regular copy:

```sh
set -eu
agent=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
models="$agent/models.json"
copy="$agent/models.private-copy"
umask 077
if [ ! -L "$models" ]; then
  echo "refused: $models is not a symbolic link" >&2
  exit 1
fi
if [ -e "$copy" ] || [ -L "$copy" ]; then
  echo "refused: $copy already exists" >&2
  exit 1
fi
cp -L "$models" "$copy"
chmod 600 "$copy"
mv -f "$copy" "$models"
```

For an existing regular file, run `chmod 600 "$models"` and make sure the effective user owns it. `bot` never repairs these paths.

The permission check limits which operating-system accounts can supply executable local configuration through ordinary file access. Trusted `!command` values keep the operator's full authority. A same-account replacement or path race remains outside this boundary.

`bot` removes every environment name used by Pi's built-in provider credentials from stage environments. A local model configuration may reference arbitrary environment names that `bot` cannot discover, so those names cannot be scrubbed automatically. Do not reference a value there that an assembly process must not inherit.
