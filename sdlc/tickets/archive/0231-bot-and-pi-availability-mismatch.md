---
flow: build
priority: 1
---
# Bot and Pi disagree about locally configured availability

## Evidence

Bot imports Pi's built-in provider catalog through the public `@earendil-works/pi-ai/providers/all` export in `bot/src/credentials.ts:12`. The current pinned catalog evidence records 38 providers and 1,153 models (`sdlc/planning/adr/0019-cli-surface.md:176`). Pi's public model runtime exposes `builtinModels`, `getProviders`, `getModels`, `getAvailable`, and `getModel`; Bot's `bot/src/catalog.ts` uses the corresponding public model collection for its listings and resolution.

A scratch Pi configuration can contain one locally configured provider and one model that Pi exposes to its model runtime while Bot reports no matching available entry and cannot resolve it. This is the observed mismatch: the machines' local configuration says the entry exists, but the two runtimes do not answer availability from the same source.

The installed Pi coding agent measured version `0.85.1`, 40 providers, 1,356 known models, and 134 locally configured models on 2026-09-10. Reproduce the measurement with Node 22.22.3 from the installed package directory:

```sh
cd "$(npm root -g)/@earendil-works/pi-coding-agent"
PI_OFFLINE=1 pi --version
PI_OFFLINE=1 node --input-type=module <<'NODE'
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
const runtime = await ModelRuntime.create();
console.log(JSON.stringify({
  providers: runtime.getProviders().length,
  known: runtime.getModels().length,
  locallyConfigured: (await runtime.getAvailable()).length,
}));
NODE
```

The observed output was `0.85.1` and `{"providers":40,"known":1356,"locallyConfigured":134}`. `ModelRuntime.create()` reads Pi's installed catalog and local configuration without selecting a network refresh.

Bot measured 112 locally configured models on the same date and Node version. Reproduce the count and compare one concrete entry without network access from the repository root:

```sh
repo=$(pwd)
PI_OFFLINE=1 node bot/src/cli.ts models --json | wc -l
PI_OFFLINE=1 node bot/src/cli.ts models --json > /tmp/bot-available.jsonl
cd "$(npm root -g)/@earendil-works/pi-coding-agent"
PI_OFFLINE=1 node --input-type=module > /tmp/pi-available.json <<'NODE'
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
const runtime = await ModelRuntime.create();
console.log(JSON.stringify((await runtime.getAvailable()).map(({provider, id}) => ({provider, model: id}))));
NODE
cd "$repo"
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const bot = readFileSync("/tmp/bot-available.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const pi = JSON.parse(readFileSync("/tmp/pi-available.json", "utf8"));
const wanted = {provider: "google", model: "gemini-3.7-flash"};
console.log(JSON.stringify({botCount: bot.length, piCount: pi.length, piHasWanted: pi.some((item) => item.provider === wanted.provider && item.model === wanted.model), botHasWanted: bot.some((item) => item.provider === wanted.provider && item.model === wanted.model), wanted}));
NODE
```

The first command prints `112`. The comparison prints `{"botCount":112,"piCount":134,"piHasWanted":true,"botHasWanted":false,"wanted":{"provider":"google","model":"gemini-3.7-flash"}}`. Pi therefore exposes `google/gemini-3.7-flash` from `getAvailable()` while Bot does not list it.

Bot supplies Pi with a separate Bot-owned credential store through `fileCredentialStore` (`bot/src/credentials.ts:186-195`, with the path fixed by `credentialPath` in `bot/src/invocation.ts:71-78`). Bot also recognizes and scrubs a fixed 51-name credential environment list in `bot/src/credentials.ts:110-158`. These are facts about the current boundary, not a proposed replacement.

ADR 0002 requires Bot to build on `pi-agent-core` and `pi-ai` as an SDK. ADR 0003 requires exact-pinned, bundled Pi and public exports without deep imports. ADR 0017 gives Bot its machine-wide owner-only credential file and hermetic run boundary. ADR 0021 says Pi owns provider discovery, credential shapes, authentication, refresh, and precedence while Bot supplies its credential-file boundary and environment snapshot.

## Required outcome

Ian requires Bot and Pi to agree on locally configured provider and model availability. Define **available** as locally configured: the provider and model entry is present in the local configuration and catalog that the runtime uses. Availability does not claim that a network request would succeed, that a credential is valid, or that a provider is currently callable.

## What remains open

This draft records the bug and its evidence. It does not choose the dependency, store-sharing, import, precedence, extension-loading, network, or migration design. It does not change runtime behavior. A later design must preserve ADRs 0002, 0003, 0017, and 0021 or record an explicit ruling that changes them.
