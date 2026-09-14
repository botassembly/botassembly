---
flow: build
priority: 2
deps: []
---
# Pin the credential registry to Pi's provider sources

## Outcome

A Pi upgrade that adds, renames, or removes a credential environment name fails the gate while `CREDENTIAL_ENVIRONMENT_NAMES` is stale. A test pins the registry to Pi's sources.

## Current facts

Observed at `a82cbbf`. Record 0286 left this limit open: the registry is Pi's names at the pin.

- `bot/package.json:32` pins `@earendil-works/pi-ai` at `0.85.1`, which publishes no list of these names. `dist/index.d.ts` exports none, and `dist/env-api-keys.d.ts` is internal, reachable only through `./compat`, and partial: two lookups keyed by one provider that exclude ambient sources.
- Reads spread past `dist/providers/**`: `dist/api/bedrock-converse-stream.js:948-958` reads `AWS_REGION`, `AWS_DEFAULT_REGION`, and `AWS_SESSION_TOKEN` through `dist/utils/provider-env.js:38-43`, which falls back to `process.env`. Scanning `dist/**/*.js` yields 63 names against Bot's 52.
- Bot holds two names Pi never reads, `AWS_CONTAINER_AUTHORIZATION_TOKEN` and `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`. The AWS SDK reads them beneath Pi in `credential-provider-http/dist-es/fromHttp/fromHttp.js`. `AWS_SESSION_TOKEN` is not among them, because Pi itself reads it.
- Pi reads 13 names Bot lacks. Eight are authentication inputs Bot scrubs nowhere, drift the pin found: `AWS_REGION` and `AWS_DEFAULT_REGION`; `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_RESOURCE_NAME`, and `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, which address where the key is sent (`dist/api/azure-openai-responses.js:168-169`); `KIMI_OAUTH_HOST`, `KIMI_CODE_OAUTH_HOST`, and `PI_OAUTH_CALLBACK_HOST`, which steer where an OAuth credential is obtained (`dist/auth/oauth/kimi-coding.js:18`, `dist/auth/oauth/anthropic.js:16`). These are the same kind as `CLOUDFLARE_ACCOUNT_ID` and `AWS_PROFILE`, already in the non-secret list. Five are behavior flags carrying no credential: `AWS_BEDROCK_SKIP_AUTH`, `AWS_BEDROCK_FORCE_HTTP1`, `AWS_BEDROCK_FORCE_CACHE`, `AZURE_OPENAI_API_VERSION`, and `PI_CACHE_RETENTION`.

## Scope

- Add one test beside `bot/tests/spec-credential-names.test.ts` scanning `dist/**/*.js` of the pinned `pi-ai` and comparing the names with `CREDENTIAL_ENVIRONMENT_NAMES` both ways.
- Extraction rule: names passed to `env(...)`, `getProviderEnvValue(...)`, or `resolveValue(...)`, names inside an `envApiKeyAuth(label, [...])` array, and the constants in `env-api-keys.js`. Resolve module-level string constants, because `providers/cloudflare-auth.js` reads through them. Take no bare uppercase literal: `HIGH`, `LOW`, and `NVIDIA` sit here too.
- Carry two declared exception lists with their reasons: the two AWS container authorization token names the SDK reads beneath Pi, and the five behavior flags above.
- Add the eight authentication inputs above to the non-secret list in `credential-environment.ts` and to the non-secret fenced list in `slots.md`, scrubbed and never redacted like `GOOGLE_CLOUD_LOCATION`. This is the one behavior change.
- Add one sentence to `slots.md` or ADR 0030 saying a test pins the registry to Pi's source. Exclude runtime imports from Pi's internals and every redaction change.

## Acceptance

Start with failing tests. Plant `getProviderEnvValue("BOT_FAKE_KEY")` in a scratch copy of a provider file and require red naming it. Remove one registry name and require red the other way. Then run both credential tests, then `make check` at the root.

## Dependencies

None.

## Risk facts

The test reads `node_modules`, so it fails on an uninstalled tree. A computed name escapes the rule. Both exception lists go stale silently when Pi moves. A stage that read `AWS_REGION` or an Azure endpoint name stops seeing it.

## Size decision

- Starting production size: 18874 nonblank lines
- Ending production size: 18882 nonblank lines
- Simpler approach tried: Import a list from Pi.
- Why insufficient alternatives were rejected: Pi publishes no list. `env-api-keys` is internal and partial.
- Production code added: Eight registry names.
- Production code deleted: None.
- Accepted cost: Both exception lists need review at each Pi upgrade.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 4
- Minimum level floor: none
- Final level: 2
- Reasons: One registry and one document change together, eight names. The proof is a deterministic set comparison. Production behavior only widens scrubbing.
- Selected model: `claude-sonnet-5` high implements; `claude-opus-5` medium reviews

## Review

- Origin: The open limit recorded in `sdlc/records/0286-scrub-provider-reports.md`.
- Design review: rejected twice, first for a narrow scan root, a missed `AWS_SESSION_TOKEN` read, the missed region names, no extraction rule, and a needless dependency, then for exempting six authentication inputs. Accepted after the six moved to the non-secret list.
