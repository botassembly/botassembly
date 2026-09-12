# ADR 0030 — Pi owns the model runtime boundary

**Status:** accepted · **Date:** 2026-09-10 · **Decision owner:** Ian Maurer · **Implements:** Ticket 0242

**Amended 2026-09-12:** Ian approved replacing the accepted `models.json` compatibility boundary before `0.1.0`. The release plan requires a current-owner regular file under a private directory, mode `0600`, no symbolic link, and no group write. The existing implementation remains an acknowledged gap until release-plan outcome 10 lands. Same-account command execution and path races remain accepted limits.

## Decision

Bot will use Pi's public `ModelRuntime` as its provider, model, availability, request-preparation, and authentication boundary. Bot imports `ModelRuntime` and `getAgentDir` only from the package root of `@earendil-works/pi-coding-agent`. Bot will not deep-import the unexported `AuthStorage` or any other private path. Bot will not use the public `readStoredCredential` because that one-off reader does not join the live store's locked access path.

Pi owns built-in providers, declarative `models.json` overlays, model availability, request preparation, authentication precedence, login, logout, OAuth refresh, credential content, locking, and mutation.

Bot owns its command contracts, exact model-selection refusals, retry and record facts, secret-safe diagnostics, environment handling, stage-environment scrubbing, owner-only authentication-store preflight, and explicit import from the retired Bot store.

Every Bot consumer will use the same `ModelRuntime` construction path. No Bot reader will access `auth.json` concurrently outside Pi's locking path. The retired Bot credential file will remain only as an explicitly named import source after migration.

## Provider and extension boundary

Bot accepts Pi's built-in providers and declarative providers from `models.json`. Bot never calls extension discovery, `ExtensionRunner`, `registerProvider`, or `registerNativeProvider`. Bot does not load executable Pi extensions.

## Environment and trusted configuration

Bot accepts Pi's live parent-process environment and provider-owned file probes as authentication inputs. A mutation of `process.env` inside one Bot process can change later availability or request authentication. Bot still gives each stage a scrubbed copy of the environment.

Pi local configuration is trusted operator input. Before use, Bot requires the Pi agent directory to be owned by the current user and not world-writable. Bot permits an owner-controlled `models.json` symlink. Its resolved target must be a regular file owned by the current user and must not be world-writable. This preserves the current local Pi configuration. Bot accepts the same-account, owner-controlled group, and path-race limits and makes no sandbox claim.

A `!command` in `models.json` runs outside stage `access` rules with the Bot process owner's filesystem and network authority. Pi gives the command ten seconds. This path uses uncached resolution, so the command may run again on a later authentication resolution. Bot cannot discover every environment name referenced by local configuration. Operators must not reference a value there that an assembly process must not inherit. Ticket 0244 must publish this limit and prove that Pi's built-in credential environment names remain scrubbed. Corrupt or unreadable model configuration fails before provider contact.

The owner-controlled `auth.json` content is also trusted operator input. Pi may execute a supported command-backed API key as the Bot process owner. Pi gives that command ten seconds and caches its result for the process lifetime. Bot does not interpret that command or apply stage `access` rules to it. Owner-only preflight limits who can supply the file. It does not sandbox the file's content.

## Network boundary

Ordinary runtime creation restores local configuration and availability without model-catalog network access. `bot models --live` is the only catalog-refresh request. `PI_OFFLINE` is a hard veto for that refresh. It does not make a model run, login, or OAuth refresh network-free.

## Authentication-store boundary

Ticket 0245 validates the Pi agent directory and authentication file before use. On POSIX systems, Bot refuses an existing directory or file with the wrong owner, wrong type, or group or other permissions. It refuses an authentication-file symlink. Bot does not silently repair existing state. Pi owns creation and locked writes after preflight. Platforms without POSIX ownership and mode checks retain Pi's supported account boundary and receive no stronger Bot claim.

Pi exposes no public arbitrary OAuth credential-import API. Bot therefore owns one narrow migration exception. It takes the destination-path lock, validates both stores, and copies the complete compatible old map through mode-`0600` atomic replacement only when Pi's destination is missing or is a valid empty object. It refuses a nonempty destination. Bot never merges, overwrites, decodes, or selectively copies credentials. Pi owns every later write.

## Migration order

1. Ticket 0243 creates Bot-owned harness, tool, execution, event, and cleanup types while the Pi packages remain at `0.83.0`. It preserves the existing catalog, credential, and session owners.
2. Ticket 0250 makes retained session and tool readers decode Pi formats 3 and 4. Ticket 0251 preserves logical entries across pages. Ticket 0252 indexes format-4 entries and invalidates old caches.
3. Ticket 0249 adds direct exact pins and bundled declarations for `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent`, all at `0.85.1`. It updates integrity evidence and moves only the Pi-facing adapter.
4. Ticket 0244 constructs `ModelRuntime` with Bot's existing credential store. It adopts Pi's built-in and declarative provider and model behavior, applies the environment and model-file trust decisions above, and loads no extensions.
5. Ticket 0245 changes `ModelRuntime` to Pi's supported `auth.json` path after strict preflight exists. It removes Bot's store as a live source. Ticket 0260 later supplies the narrow import from the old Bot file.
6. Ticket 0231 was archived after tickets 0243, 0250 through 0252, 0249, 0244, and 0245 preserved its evidence and closed the mismatch.

## Staged supersession

Ticket 0243 ends ADR 0010's blanket ban on wrapper types over Pi. Bot accepts one reviewed compatibility boundary because Pi's public runtime types changed together and leaked through production consumers. The cost is an abstraction with one implementation. The mechanical import check and exact file allowlist contain that cost. ADR 0010 still rejects speculative wrappers and other one-implementation abstractions.

Ticket 0249 ends ADR 0002's coding-agent package ban only for the public package-root exports `ModelRuntime` and `getAgentDir`.

Ticket 0244 ends ADR 0013's rejection of `ModelRuntime`. It also ends ADRs 0017 and 0021's captured-authentication-environment, always-false file-probe, and sealed-from-Pi-configuration rules.

Ticket 0245 ends ADR 0013's separate-store outcome. It also ends ADRs 0017 and 0021's Bot-owned or Bot-supplied live credential-file rules. Ticket 0260 implements the migration exception recorded here.

ADR 0021's Pi-owned authentication semantics, secret-safe reporting, and no-secret stage rule remain. They are subject to the arbitrary-local-configuration limit recorded above.

## Rejected alternatives

- Retain Bot's duplicated model catalog and credential store.
- Copy Pi data or write another `models.json` reader.
- Import private Pi paths.
- Use a higher-level Pi path that discovers executable extensions.

## Accepted costs

Bot accepts a larger bundled dependency, coordinated upgrades of three Pi packages, trusted shell-backed local configuration, owner-controlled model-file symlinks, the named same-account and path-race limits, Pi's in-place locked authentication writes, ambient parent-process authentication inputs, and no promise that arbitrary configuration environment names are scrubbed from assembly processes. A nonempty Pi authentication store requires manual migration resolution.

## Evidence

Archived ticket [0231](../../tickets/archive/0231-bot-and-pi-availability-mismatch.md) records the former mismatch between Bot's copied catalog and locally configured Pi models. The [public-alpha repair decision](../decisions/2026-09-10-public-alpha-repair-boundaries.md) selected Pi's runtime boundary. The [Pi boundary qualification](../bot-contraction/pi-boundary-qualification.md) records the API and migration investigation. Bot's current [`package.json`](../../../bot/package.json), [`package-lock.json`](../../../bot/package-lock.json), and [`model-runtime.ts`](../../../bot/src/model-runtime.ts) show the exact dependencies and the shared Pi runtime that closed the mismatch.

The installed `@earendil-works/pi-coding-agent@0.85.1` package exports its root, RPC entry, client source, and experimental plugin in `package.json`. Its root `dist/index.d.ts` exports `getAgentDir`, `readStoredCredential`, and `ModelRuntime`. `dist/core/model-runtime.d.ts` exposes public credential, authentication-path, model-path, model-store, network, timeout, catalog URL, signal, and refresh options. It exposes no `AuthContext` option. `dist/core/model-runtime.js` and `dist/core/model-config.js` show the live environment and provider configuration behavior. `dist/core/provider-composer.js` uses the uncached configuration resolver for `models.json` API keys and headers. `dist/core/resolve-config-value.js` shows cached and uncached command paths with the same ten-second limit. `dist/core/auth-storage.js` uses the cached resolver for command-backed API keys and shows `0700` directory creation, `0600` file creation, locked in-place writes, and the separate one-off credential reader. `dist/config.js` provides `getAgentDir`. These are installed public exports, types, and implementation evidence. Bot will depend only on the public package-root exports named in this decision.

A controlled Node 22.22.3 reproduction created one runtime with `PI_OFFLINE` set, no model file, and an empty injected credential store. It removed the non-secret test variable before construction and then assigned a non-secret placeholder after construction. Availability changed in the same runtime: `{"beforeAvailable":false,"afterAvailable":true}`. The reproduction restored the environment afterward and printed no credential.

A second controlled Node 22.22.3 reproduction created a temporary existing `auth.json` with mode `0644`, constructed `ModelRuntime` against that path with no model file, and observed `{"before":"644","after":"644"}`. The reproduction removed the temporary directory afterward and printed no credential. This proves Pi does not tighten an existing permissive file and supports the owner-only preflight in ticket 0245.

A safe command-count reproduction called `getAuth('demo')` twice. The `models.json` command ran twice. The `auth.json` command ran once across runtime creation and both reads. The reproduction printed counts and no credential values.

Ian can overturn this decision before the staged migration finishes. Reversal after ticket 0245 would require replacing Pi's live authentication owner and migration contract.
