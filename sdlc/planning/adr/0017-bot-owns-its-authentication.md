# ADR 0017 — Bot owns its authentication: its own credential file, its own login, and the end of `BOT_AUTH`

**Status:** accepted with staged supersession by ADR 0030 · **Date:** 2026-08-06 · **Milestones:** Ticket 0244 ends the captured-authentication-environment, always-false file-probe, and sealed-from-Pi-configuration rules. Ticket 0245 ends the Bot-owned live credential-file rule. Owner-only handling, secret-safe reporting, stage scrubbing, and explicit import remain subject to ADR 0030's arbitrary-local-configuration limit. · **Supersedes:** the `BOT_AUTH` arm of ADR 0013's 2026-08-01 reviewed event.

## Decision

**1. The credential file has one fixed, bot-owned location:**
`${XDG_CONFIG_HOME:-~/.config}/bot/credentials.json`, the directory
born `0700` and the file written `0600` (the store already writes
`0600` — credentials.ts:58). It is machine-wide, not per-home:
credentials belong to the operator, homes are workspaces, and a login
should not be repeated per project. `XDG_CONFIG_HOME` is read from the
boundary snapshot like every other platform variable (`XDG_CACHE_HOME`
already is, for scratch). The file's shape is unchanged — the JSON
object of pi-ai credentials that `fileCredentialStore` reads today.

**2. `BOT_AUTH` retires entirely, clean break, no alias** — the same
pre-1.0 rule that retired `tools`. The runtime resolves the fixed path
always; there is no bot-named environment variable for auth at all.
`BOT_HOME` remains the runtime's own bot-named variable, scrubbed from stage
shells. Provider credential environment names consumed by the parent are
scrubbed too; this companion hygiene prevents them riding into a stage shell.
The 2026-08-01 "the pointer is not the file" ruling is not reversed but retired
with the pointer. Redirection for tests and foreign setups goes through
`XDG_CONFIG_HOME`, a platform convention, not a bot invention.

**3. A `bot auth` verb family, the smallest that closes the loop:**

- `bot auth` — one line per provider: id, credential type (`oauth` /
  `api key` / `environment`), configured or not. Never a token, never
  a key fragment, never an expiry secret.
- `bot auth login <provider>` — runs the provider-owned flow through
  pi-ai (`Models.login(providerId, type, interaction)` —
  pi-ai/dist/models.d.ts:116) and the minted credential lands in bot's
  file through the existing conforming store. Bot supplies only the
  `AuthInteraction` adapter (prompt + notify over the terminal); pi-ai
  owns every client id, endpoint, PKCE exchange, and device-code poll
  internally. Bot never opens a browser — it prints the URL pi-ai
  hands it, and the manual-paste / device-code paths make headless
  logins work.
- `bot auth logout <provider>` — `Models.logout`, which is
  `credentials.delete` under the store's own lock.
- `bot auth import <path>` — the one-time bridge: reads a pi-ai-shaped
  credential file at an operator-named path through the same
  conforming store (same lock protocol, so importing from a live
  interactive store is safe) and writes its entries into bot's file.
  The operator names the path; no `~/.pi` literal enters `src/`, and
  after the import bot never looks back.

**4. The resolution order is pi-ai's own and does not change:** a
stored credential owns its provider; the environment snapshot is the
fallback for providers with nothing stored (documented API keys keep
working exactly as documented — the 2026-08-06 kept-but-scrubbed
ruling stands). `fileExists` keeps answering false: the Vertex
service-account file probe stays retired — Ian blessed the retirement
2026-08-06, and this ADR records it as law. Bot's credentials come
from bot's file and bot's snapshot, and from nowhere else on the
machine.

**5. This is scoping, not a security boundary.** A stage agent runs as
the operator's user and could open `~/.config/bot/credentials.json` by
its well-known path — file modes narrow the audience, nothing here
prevents a determined read or write. Ian's stated concern is agents
*modifying* run directories or credentials; prevention of that is the
future sandboxing ADR's job, said here so nobody mistakes this ADR for
it. What this ADR does close: no bot-run agent, tool, or provider
resolution ever *consults* Pi's configuration, sessions, or store —
the hermetic seal is about whose configuration governs a run, and
after this it is bot's alone.

## Context

Why the last arm of 0013 falls. 0139 landed the injection half of the
seal: provider resolution reads bot's snapshot (`snapshotAuthContext`),
stage shells hold a composed environment (`inheritEnv=false`), scratch
and temp are bot's. What remained was the credential file itself —
and in practice `BOT_AUTH` has been a pointer straight into Pi's
world: `smoke/run.sh:290` defaults it to `$HOME/.pi/agent/auth.json`,
so every live ladder to date authenticated out of the interactive
agent's store. "Seal bot off from Pi's configuration" ends with bot
holding its own file, minting its own logins, and needing no pointer.

Why this is buildable now (research of 2026-08-06, against the pinned
`@earendil-works/pi-ai@0.83.0`; file:line evidence in the session
record): the login flows moved INTO pi-ai. `Provider.auth.oauth.login`
/ `auth.apiKey.login` are public-surface values reached through
`builtinProviders()`; `Models.login`/`Models.logout` wrap them and
persist through the injected store; pi-ai's own reference CLI does
exactly this in ~40 lines. Anthropic and OpenAI-Codex both carry
browser-PKCE flows (Codex also device-code); the flow modules'
client ids and endpoints are consumed internally and never imported
by us. pi-ai 0.83.0 reads no `~/.pi` path anywhere, keeps no config
or catalog files, and its only ambient file probe (the gcloud ADC
check) is off the `createModels` path entirely. ADR 0011's upstream
ask #7 is thereby satisfied by upstream's own evolution: the auth
layer came down to pi-ai, and the store half was already ours (ADR
0013's conforming store). No new dependency, no deep import, no
reopening of ADR 0002 or 0010.

Two residual ambient reads, named so the seal's claim stays honest
rather than absolute: (a) pi-ai's OAuth flows read
`PI_OAUTH_CALLBACK_HOST` from the real `process.env` (a callback bind
host, default `127.0.0.1`) through a path the injected context does
not cover — cosmetic, login-time only, recorded not fought; (b) the
callback ports are fixed (Anthropic 53692, Codex 1455), so a login
concurrent with another login — or with the interactive `pi` CLI's —
can collide; Codex degrades to manual-paste, Anthropic refuses and is
retried. Neither touches runs; both are login-command-only.

## Consequences

- `bot auth` is the first verb family with a subcommand — the verb
  list grows by one word, and the CLI's noun discipline holds (auth is
  its own subject, not a lens on runs).
- The guides change from "point `BOT_AUTH` at it" to "run
  `bot auth login`" (install-and-use.md:30-34 is the site). One-time
  migration for existing setups is `bot auth import
  ~/.pi/agent/auth.json` — the guide may name that path; source may
  not.
- `smoke/run.sh` drops its `BOT_AUTH` default and preflights bot's own
  file instead; the first sealed ladder follows the operator's one
  `bot auth import`. Unit tests keep injecting stores and env through
  dependencies; CLI-level witnesses redirect `XDG_CONFIG_HOME` into
  test scratch and never touch the real `~/.config`.
- The literal `TMPDIR` rider (stage shells carry `TMPDIR=$TMP` so an
  agent's own `mktemp` lands in run scratch) rides the first
  implementation ticket here, as ruled 2026-08-06.
- Implementation is ticketed separately with its own budgets; the verb
  family and interaction adapter are new src and will need a ratchet
  petition sized the standing way (nominal at the observed 4x). The
  order of value: retire `BOT_AUTH` + fixed path + import first (the
  seal completes and smoke goes sealed), login second (the `.pi`
  folder becomes unnecessary for new machines), list/logout with it.
- ADR 0013's consequence "the spec stays silent on credentials" ends:
  a user-facing verb needs its inspection.md section and help screen,
  spec-terse, when the tickets land.
