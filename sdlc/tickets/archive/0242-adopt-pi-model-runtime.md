---
flow: build
priority: 1
---
# Bot adopts Pi's public ModelRuntime boundary

## Outcome

An accepted ADR makes Pi's public `ModelRuntime` the source of provider, model, and local-auth behavior without loading Pi extensions.

## Current facts

Draft 0231 proves that Bot and installed Pi disagree about locally configured availability. Existing ADRs ban the coding-agent dependency, assign Bot its own credential file, require one captured authentication environment, and disable ambient credential-file probes. The 2026-09-10 public-alpha repair decision chooses `ModelRuntime` and accepts the larger dependency.

Installed `@earendil-works/pi-coding-agent@0.85.1` exports `ModelRuntime` from its package root. `ModelRuntime.create()` accepts public credential, auth-path, model-path, store, network, timeout, and signal options. It does not accept Pi's `AuthContext`. Its initial availability work can therefore read live `process.env` and perform Pi's provider-owned file probes. A controlled check changed `ANTHROPIC_API_KEY` after runtime creation and changed `getAvailable("anthropic")` from unavailable to available.

The default model path is Pi's agent-directory `models.json`. Declarative configuration can name literal values, environment references, headers, and `!command` credential sources. Commands run with the Bot process owner's authority and have a ten-second limit. This path resolves commands without the process cache, so a command may run again on a later authentication resolution. The public runtime does not expose every referenced environment name. Bot's current fixed credential scrub cannot promise to remove an arbitrary name introduced by local configuration.

The default auth path is Pi's agent-directory `auth.json`. Pi's auth storage owns locking, credential content, mutation, and refresh. An API-key credential in that file can name a `!command` source. That command has a ten-second limit and its result is cached for the process lifetime. Pi creates a missing parent directory with mode `0700` and a missing file with mode `0600` on POSIX systems. A scratch check proved that it leaves an existing `0644` file unchanged. A safe command-count reproduction called `getAuth('demo')` twice. The `models.json` command ran twice, while the `auth.json` command ran once across runtime creation and both reads. Bot must validate an existing store before using it.

## Scope

Create `sdlc/planning/adr/0030-pi-model-runtime-boundary.md`. Update the status headers of ADRs 0002, 0013, 0017, and 0021. Add one entry to `specification/CHANGELOG.md`. Change no other files and no runtime behavior.

Record this exact boundary:

- Bot imports `ModelRuntime` and `getAgentDir` only from the public package-root export of `@earendil-works/pi-coding-agent`. Bot does not deep-import the unexported `AuthStorage` or any other private path. Bot does not use the public `readStoredCredential` because that one-off reader does not join the live store's locked access path.
- Pi owns built-in providers, declarative `models.json` overlays, model availability, request preparation, authentication precedence, login, logout, OAuth refresh, credential content, locking, and mutation.
- Bot owns its command contracts, exact model-selection refusals, retry and record facts, secret-safe diagnostics, environment handling, stage-environment scrubbing, owner-only auth-store preflight, and explicit import from the retired Bot store.
- Bot never calls extension discovery, `ExtensionRunner`, `registerProvider`, or `registerNativeProvider`. Declarative providers are accepted. Executable Pi extensions are not loaded.
- Bot accepts Pi's live parent-process environment and provider-owned file probes as authentication inputs. This supersedes the captured-authentication-environment and always-false file-probe clauses in ADRs 0017 and 0021. Bot still passes a scrubbed copy to a stage. A mutation of `process.env` inside one Bot process can change later availability or request authentication.
- Pi local configuration is trusted operator input. A `!command` in `models.json` runs outside stage `access` rules with the operator's authority. It has a ten-second limit, uses uncached resolution, and may run again on a later authentication resolution. Bot does not claim that its fixed built-in credential scrub recognizes arbitrary environment names introduced by `models.json`. Operators must not reference a value there that an assembly process must not inherit. Ticket 0244 must publish this limit and prove that Pi's built-in credential environment names remain scrubbed.
- The owner-controlled `auth.json` content is also trusted operator input. Pi may execute a supported command-backed API key as the Bot process owner. That command has a ten-second limit and its result is cached for the process lifetime. Bot does not interpret that command or apply stage `access` rules to it. Owner-only preflight limits who can supply the file. It does not sandbox the file's content.
- Ordinary runtime creation restores local configuration and availability without model-catalog network access. `bot models --live` is the only catalog-refresh request. `PI_OFFLINE` is a hard veto for that refresh. It does not make a model run, login, or OAuth refresh network-free.
- Ticket 0245 validates the Pi agent directory and auth file before use. On POSIX systems, an existing directory or file with the wrong owner, type, or group/other permissions is refused. Bot does not silently repair it. Pi owns creation and locked writes after preflight. Platforms without POSIX ownership and mode checks retain Pi's supported account boundary and receive no stronger Bot claim.
- Every Bot consumer uses the same `ModelRuntime` path. No Bot reader accesses `auth.json` concurrently outside Pi's locking path. The old Bot credential file is only an explicitly named import source after migration.

Record the migration order:

1. Ticket 0243 adds direct exact pins and bundled declarations for `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent`, all at `0.85.1`. It updates integrity evidence and preserves the existing catalog and credential owners.
2. Ticket 0244 constructs `ModelRuntime` with Bot's existing credential store. It adopts Pi's built-in and declarative provider and model behavior, applies the environment and scrub decisions above, and loads no extensions.
3. Ticket 0245 changes `ModelRuntime` to Pi's supported `auth.json` path after owner-only preflight and explicit migration behavior exist. It removes Bot's store as a live source and retains an explicit import from the old Bot file.
4. Archive draft 0231 only after tickets 0243 through 0245 preserve its evidence and close the mismatch.

Reject four alternatives: retaining Bot's duplicated catalog and store; copying Pi data or writing another `models.json` reader; importing private Pi paths; and using a higher-level path that discovers extensions. Record the accepted costs: a larger bundled dependency, coordinated three-package upgrades, trusted shell-backed local configuration, Pi's in-place locked auth writes, ambient parent authentication inputs, and no promise that arbitrary configuration environment names are scrubbed from assembly processes.

State the exact superseded clauses and their effective milestones. Ticket 0243 ends ADR 0002's coding-agent package ban only for the public root exports of `ModelRuntime` and `getAgentDir`. Ticket 0244 ends ADR 0013's rejection of `ModelRuntime` and ends ADRs 0017 and 0021's captured-authentication-environment, false-file-probe, and sealed-from-Pi-configuration rules. Ticket 0245 ends ADR 0013's separate-store outcome and ends ADRs 0017 and 0021's Bot-owned or Bot-supplied live credential-file rules. The old ADR status headers preserve this staged meaning. ADR 0021's Pi-owned authentication semantics, secret-safe reporting, and no-secret stage rule remain, subject to the explicit arbitrary-local-configuration limit above.

## Acceptance

The ADR and specification changelog state the exact ownership, trust boundary, network behavior, migration sequence, rejected choices, costs, and superseded clauses. They cite draft 0231, the public-alpha repair decision, the Pi boundary qualification, the current Bot manifests, installed 0.85.1 package-root exports and types, and the ambient-environment and permissive-file reproductions.

The diff changes only this ticket, the new ADR, the four old ADR status headers, and the specification changelog. `git diff` proves no package, lockfile, source, test, normative specification element, or generated-document change. Documentation generation and the complete repository check pass.

## Dependencies

None.

## Risk facts

This changes architecture and credential ownership. Later tickets depend on an exact decision.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 10
- Minimum level floor: level 4 for credential and coordinated-migration risk
- Final level: 4
- Reasons: The ADR changes public provider and credential ownership. It accepts ambient authentication inputs, trusted executable configuration, shared locked storage, and a coordinated migration across three later tickets.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation introduces a different contract, state, reach, proof, or cost-of-error fact.

## Review

- Design review: accepted after the public API, ambient authentication, local configuration trust, auth-store safety, staged supersession, migration, proof, and complexity boundaries became exact
- Code review: accepted after the ticket and ADR distinguished uncached `models.json` commands from cached `auth.json` command-backed keys; completed at `8659844`
