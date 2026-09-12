# Bumping pinned pi-ai to 0.85.1 hangs a retry test and breaks typecheck, with no escape hatch around the pin

Observed 2026-09-11 in a scratch worktree on branch `model-catalog-bump`, left uncommitted.

Two providers refuse newer models with `model-unresolved` even though both serve them. bot holds no catalog of its own: `providerModels()` in `bot/src/credentials.ts:277` builds from `@earendil-works/pi-ai`, pinned at 0.83.0 and bundled. A model missing from that pin cannot be named, and there is no escape hatch: no env var, no config key, no flag. The only seam is `bot run --script`, which replaces the whole catalog with a faux provider.

The pin is the whole cause. 0.85.1 carries the missing models but also drops some that other configs pin to today, so the bump is not a pure gain.

## What the bump costs

Four defects surfaced. Three are cheap and were fixed on the branch. The fourth blocks adoption.

1. `bot models <provider> --live` asks the provider twice per refresh instead of once. The catalog read is an idempotent GET, so the repeat costs one request; isolation still holds. `tests/cli-models.test.ts` pinned the count and was updated.
2. An aborted assistant message omits `errorMessage` instead of carrying the key set to undefined. Every call site reads undefined either way. `tests/pi-retry-helper-characterization.test.ts` used `toMatchObject`, which requires the key, and was changed to assert the property directly.
3. A new `deferred` stop reason appears. bot never sets the deferred request option, so the reason cannot arrive honestly; it was added to the impossible group in `src/turns.ts` that throws. Adding the case pushed `messageCause` to complexity 11, so the string branch was extracted to `endingCause` rather than dropping the exhaustiveness check.
4. `tests/provider-retry.test.ts` hangs. "zero-token failures after tools retry twice without replaying their side effect" passes in 2.4 seconds on 0.83.0 and times out after 180 seconds on 0.85.1, under fake timers. Retry semantics changed in a way bot's own test cannot complete.

Defect 4 is the blocker. bot's retry path is not a rare corner: in two nine-stage runs the same day, most stages needed a retry, and the shape of that retry decided whether a stage sealed at all.

The version split cannot be closed halfway. `@earendil-works/pi-agent-core` is pinned at 0.83.0 and bundles its own copy of pi-ai 0.83.0. Bundled dependencies ignore npm overrides, verified. With pi-ai at 0.85.1 and pi-agent-core at 0.83.0, `npm run typecheck` reports 20 errors, all from two `Provider` types failing to unify under `exactOptionalPropertyTypes`. Bumping pi-agent-core to 0.85.1 as well raises 98 type errors from a real API break: `InMemorySessionStorage` is gone, and `AgentHarness` became a factory rather than a constructor.

So the three states are: stay pinned and lose the newer models; bump pi-ai alone and fail typecheck with a hanging retry test; bump both and migrate the harness API.

## Options

1. Stay on 0.83.0. Cost: no newer models. Nothing breaks.
2. Bump both to 0.85.1 as planned work, migrating the harness API and diagnosing the retry hang first. Cost: real work, and the retry change needs understanding before adoption. Gains the models and keeps one pi version.
3. Add an escape hatch to model validation so a configured model bot's catalog does not list is passed to the provider, with the provider's own error surfaced on refusal. Cost: a documented hole in a validation that exists for good reason. Gains every model any provider serves, including ones newer than any pin, and does not touch the retry path at all.

Recommendation is 3, then 2 on its own schedule. Option 3 solves the recurring complaint rather than this instance of it: the same lag hid today's model and will hide the next one. Option 3's failure mode is a typo reaching the provider and coming back as the provider's own "model not supported," which is legible and cheap. Option 2's failure mode is adopting changed retry semantics into the path that decides whether a stage seals.

An escape hatch must never fall back to a default model. pi does exactly that today: naming a nonexistent model on one provider warns "Using custom model id" and then answers anyway. A benchmark run that way silently measures the wrong model.

## Evidence

- Branch `model-catalog-bump` in a scratch worktree, uncommitted. Six files changed.
- `tests/provider-retry.test.ts` in isolation: 18 passed in 2.40s on main; 1 failed, 17 passed, 182.45s in the worktree.
- Full suite under matched load: both checkouts fail 24-27 of 1466 in the same load-sensitive files, with the sets shifting between runs; that flakiness is separate from this bump and worth its own look.
