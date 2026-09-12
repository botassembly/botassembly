# The model catalog is narrower than what providers actually serve

Observed 2026-09-11 while standing up a nine-stage assembly. Ian's existing ruling: every model `pi` can call should be reachable from botassembly.

`pi --provider zai --model glm-5.3` runs. The same model named in a bot home's `config.yaml` fails before any work starts:

```
model-unresolved  flows/t/01-a
  No provider offers a model named glm-5.3. Name a model one of these
  providers offers: openai-codex, opencode, opencode-go, zai.
```

This is not a stale pin. `bot models zai --live` queries the provider directly and returns glm-4.5-air, glm-4.7, glm-5-turbo, glm-5.1, glm-5.2 and glm-5v-turbo. No glm-5.3. The provider serves the model and does not advertise it on the catalog endpoint the runtime asks. `opencode-go` shows the same gap for the same model.

`pi` passes the model string through to the provider; `bot` validates it against a catalog first. Where a provider's catalog is narrower than what it will actually answer, the validating tool is the one that loses a working model. The catalog gate is total rather than partial: `model-unresolved` refuses the whole flow before stage 1, so a catalog gap costs the whole run rather than degrading it. Providers ship models ahead of their own listings routinely, and during this session three providers hit usage ceilings in turn, so reaching for whatever was currently answering was the difference between a run completing and a run dying.

## Options

**Trust the caller, warn once.** Accept an unnamed model, emit a warning at flow start, and let the provider's own error surface if the model really does not exist. Matches what `pi` already does. Cost: a typo becomes a provider round-trip instead of a local refusal.

**Keep validation, add an escape hatch.** Something like `--allow-unlisted-model`, or a per-intelligence `unlisted: true` in `config.yaml`. Typos stay caught, and reaching for a new model becomes deliberate and visible in the config.

**Union the pinned catalog with a live query on miss.** Does not help here, because the provider's live catalog does not list the model either; it solves a stale-pin case and not an unadvertised-model case.

Recommendation: the escape hatch. It keeps the local typo check and makes "I know this model exists, the catalog does not" expressible instead of fatal. It is also the reversible choice: the flag can be widened to the trust-the-caller default later, and cannot be narrowed back as easily.
