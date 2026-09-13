# ADR 0019 — The CLI surface: when a capability gets a word, and the two words it gets next

**Status: SUPERSEDED IN PART by ADR 0026 on 2026-09-04.** The noun-or-verb hierarchy, flat-reading pattern, preserved-spelling promise, one-screen help rule, and command vocabulary no longer govern the replacement CLI. The historical command decisions remain evidence for the temporary legacy handlers. The credential and model-content decisions remain accepted unless ADR 0026 changes them explicitly.

**Previously accepted — ratified by Ian 2026-08-07, as recommended,
all ten open choices included.** His criterion, in his words: the
simplest, the least surprise, the most standard, the most expected
from a user's perspective. So the ten opens resolve to the
recommendation stated at each: (1) the seven flat reading verbs are
the pattern, not grandfathered; (2) no `config path` on day one —
it waits in the growth map; (3) `bot config` names the credential
file's path and never opens it; (4) `--json` is one object; (5) no
`--refresh` anywhere; (6) no `--all` — naming a provider is the
widening; (7) `bot models` does not mark the home's choices; (8)
cost rides the default line, staleness disclosed in the help
screen; (9) NO `bot config set`, config.yaml keeps one writer, its
owner; (10) the words are `config` and `models`. Implementation:
tickets 0161 (`bot config`) and 0162 (`bot models`).

(Drafted 2026-08-07 by ticket 0157, from Ian's direction of
2026-08-07: model listing and configuration viewing want a designed
surface — subcommands over flags, nothing hidden behind weird
top-level options, an admin/config hierarchy welcome) ·
**Date:** 2026-08-07 ·
**Amends:** nothing. Every existing command keeps its spelling. This
states the law the surface already obeys and adds two words under it.

## Decision

### 1. The hierarchy law

**A capability gets a NOUN with verbs under it when it is a subject bot
owns that can be both read and changed. It gets a bare VERB at the top
when it is one reading with one answer shape and nothing to change.**
The bare form of a noun is its reading — `bot assembly` lists
(management.md:26), `bot auth` lists (auth.md:24) — so a noun with no
verbs yet is spelled exactly like a verb, and gaining its first verb
breaks nothing.

The existing surface passes without amendment (cli.ts:313-319).
`assembly` is the home's assemblies, changed by `install`, `link`,
`update`, `remove` (management.md:18-24); `auth` is the operator's
credentials, changed by `login`, `logout`, `import` (auth.md:17-22).
Nouns. `run` and `check` are the work and its dry reading. `runs`,
`show`, `output`, `logs`, `session`, `status` are six readings with six
answer shapes — a listing, a record, sealed bytes, tool calls, a
transcript, a summary — and nothing to change. `prune` reads and
deletes only what it read, only under `--delete`
(inspection.md:299-304): a reading with a consequence, not a subject.

**So the seven flat reading verbs are the PATTERN, not grandfathered.**
Each is a single reading, which is the law's own answer, and four of
them happening to concern runs does not make "runs" a subject bot
changes. (**Open 1:** Ian may instead rule them grandfathered and
require every future reading to hang under a noun. That is a rename,
and this ADR does not propose one.)

Three sub-laws follow from Ian's taste, each checkable:

**(a) A flag never selects between two different answers.** `--json`
and `--home` are legitimate — they change how one answer is rendered,
or which home it is about. `bot config --models` would be a flag
choosing a subject: banned. That is "subcommands over flags" stated so
a reviewer can apply it.

**(b) The first word after `bot` is never an option.** No
`bot --models`, no `bot --config`. `main` takes `argv[0]` as the
command (cli.ts:309) and the only bare option it accepts is `--help`
(help.ts:209). That stays the whole of it.

**(c) One word, one help screen, twenty-four lines.** `helpScreen` maps
one screen per top-level word (help.ts:202-210) — there is no per-verb
screen — and `tests/cli-help.test.ts:53` caps every screen at 24 lines.
A noun's whole verb family must fit one screen. Measured today: `prune`
is at 24, the cap, ruled LEFT 2026-08-06; `auth` is 21; `assembly` 18.
**`auth` has three lines of headroom, so a fourth verb with a two-line
gloss does not fit.** That is the mechanical ceiling on verbs per noun
(about five) and the reason to open a second noun rather than pile
verbs into one.

**(d) The overview is a budget.** It is 18 lines against the same cap.
**Six top-level lines exist, ever.** Each new word spends one; grouping
is how the surface grows after they are gone.

### 2. `bot config` — what one home is set up to do

A new top-level word, `--home`-bearing, reading only. Bot does not
write `config.yaml` today and §4 proposes it never will, so under the
law this is one reading and takes no verbs — except possibly `path`
(**Open 2**).

It prints three blocks. **Where:** the resolved home and which of the
three ways it resolved — a `--home` given, `BOT_HOME`, or the XDG
default (invocation.ts:45-49) — whether a `config.yaml` stands there,
the scratch root (invocation.ts:65) and the credential file's path
(invocation.ts:73), because nothing else names those two and a person
asking where their stuff is means all of it. **The defaults:** the
option keys the home sets and the built-in value for each it does not,
each stamped `home` or `default` — the value-plus-from vocabulary
`bot check` already prints (inspection.md:82-84, cli.ts:118-127).
**The profiles:** one line per cell, profile → tier → the bundle it
chooses, as home.md:84-100 writes them.

**The boundary against `bot check`, so neither grows into the other:
`bot config` answers "what does this home say"; `bot check` answers
"what will this run do".** Config shows two rungs, the home's and the
built-in default's; check resolves all eight against a real assembly
(inspection.md:49-61). Config never takes an assembly.

**The redaction law is STRUCTURAL, not a filter.** `bot config` prints
the parsed value, never the file's bytes. `readYamlOptions`
(home-config.ts:61-84) returns `{options, profiles}`; `options` comes
from `collectOptions` (documents.ts:208-217), which copies only
`OPTION_NAMES` (model.ts:3-12), and each profile cell is closed to
`provider`/`model`/`reasoning` (home-config.ts:18). **A key that is not
one of those is never in the value at all** — it was refused
`key-unknown` when the file was read. A secret an operator pasted into
`config.yaml` therefore cannot reach stdout by any path, because no
path exists from those bytes to the printer. There is nothing to
redact, which is a stronger promise than redacting, and it composes
with home.md:76-80 and ADR 0013's "no secrets in config, ever": a file
that holds no secret, printed through a reader that could not carry
one.

Two laws so it does not leak by a side door:

- **`bot config` names the credential file's path and never opens it.**
  Which providers are configured has an owner, `bot auth`
  (auth.md:55-59, auth.ts:124-136). (**Open 3:** Ian may rule that even
  naming the path belongs to auth.)
- **A listing may call `Models.checkAuth`; nothing that prints may ever
  call `Models.getAuth`.** `checkAuth` returns `AuthCheck { source?,
  type }` where `source` is a variable's NAME, e.g. `ANTHROPIC_API_KEY`
  (pi-ai auth/types.d.ts:90-93). `getAuth` returns `AuthResult` whose
  `auth` field IS the token (auth/types.d.ts:83-89). `bot auth` already
  obeys this (auth.ts:132); written down, it is a rule reviewable by
  grep rather than by intent.

**`--json` prints ONE object** — paths, defaults, profile table — not
one record per line. This is the one place inspection.md's
one-record-per-line convention (inspection.md:11-14) does not fit:
configuration is one value, not a list, and pretending otherwise puts
three unrelated line shapes on one stream. (**Open 4:** three JSONL
blocks, or no `--json` at all.)

### 3. `bot models` — what this machine can actually call

**Three vocabularies, and conflating them is the slop this exists to
avoid.** (1) The home's names — profiles and tiers, bot's own
vocabulary, known completely and offline, already answered by
`bot config`. (2) The provider catalog — pi-ai's, not bot's and not the
home's. (3) What this machine can call: the catalog narrowed to
providers with a complete credential, which is the question actually
being asked.

**The catalog IS reachable, and here is exactly how, without touching
ADR 0003 or ADR 0010.** Verified against the pinned
`@earendil-works/pi-ai@0.83.0` in this worktree:

- `Models.getModels(provider?)` (pi-ai models.d.ts:89) and
  `Models.getAvailable(providerId?)` (models.d.ts:103) are declared on
  the `Models` interface (models.d.ts:82), reached through the package
  root `"."` in pi-ai's `exports` map. cli.ts:2 and auth.ts:8 already
  import `Models` from `@earendil-works/pi-ai`; credentials.ts:12
  imports `builtinModels` from `@earendil-works/pi-ai/providers/all`, a
  sanctioned subpath (`"./providers/*"`). **ADR 0003 bans
  `@earendil-works/*/dist/*` and file-URL probing; neither is used
  here.** No `dist/` path, no internal module, nothing hoisting moves.
- **No new package.** ADR 0010's admitted set is untouched: bot already
  constructs the `Models` this would read — `providerModels`,
  credentials.ts:144-149, shared by runs and by `bot auth`.
- **Offline.** `getModels` is sync ("sync read of last-known models").
  `getAvailable` is async only because auth resolution is, and bot's
  `snapshotAuthContext` (credentials.ts:125-133) reads the injected
  environment and bot's own credential file and nothing else. Measured
  here: 38 providers, 1153 models, `getAvailable()` in 1 ms, no socket.

**And here is what it honestly is, which the help screen must say out
loud.** The catalog is the PINNED pi-ai's baked-in catalog. It goes
stale with the pin, not with the provider, and a Pi upgrade is a
reviewed event (ADR 0003). Of the 38 providers exactly one (`radius`)
is dynamic and reports zero until a refresh; `Models.refresh()`
(models.d.ts:99) is the only network path on this surface, and bot
injects no `ModelsStore` (credentials.ts:145 passes `authContext` and
`credentials` only), so a refreshed list would not outlive the process.
**Therefore no `--refresh` and no `bot models refresh`** (**Open 5**): a
reading command that reaches the network and cannot keep what it got is
a slow way to be no more current.

**The scale of the catalog decides the default.** 1153 lines is not an
answer a person reads.

- **`bot models` bare lists what this machine can call** —
  `getAvailable()`. Holding one Anthropic key that is 15 lines; holding
  nothing it is zero lines, exit 1, and stderr says which nothing, the
  house rule (inspection.md:22-26): no provider is configured, and
  `bot auth` is where that is fixed.
- **`bot models <provider>` lists that provider's whole catalog**,
  callable or not — `getModels(provider)`. Naming the provider is the
  person accepting the length; `openrouter` is 303 lines and they asked
  for it. (**Open 6:** a `--all` over all 1153. `bot logs --all` is the
  precedent, but it lifts a bound bot imposed on its own reading, where
  this bound is "you have not configured it" — a different fact.
  Recommended: leave it out, and let the argument be the widening.)
- **It takes no `--home`.** The catalog is the machine's, like the
  logins, and no home changes it — the reason `bot auth` refuses a
  `--home` rather than ignoring it (auth.ts:175-177). (**Open 7:**
  whether `bot models` should mark which models the home's profiles
  name. Recommended no — one command, one subject; the cross-check
  belongs in §4.)

**Why not a verb under `bot auth`.** The overlap is real — auth already
lists providers and their standing. Against: auth is its own subject
*because* it is the operator's and not the home's (auth.md:7-13), and
hanging models there makes it mean "everything about providers", after
which `bot auth` bare has two readings. The mechanical answer settles
it: `auth --help` is 21 lines against a cap of 24 (§1c).

**What a line carries**, all static from the pin, none of it a secret:
provider, model id, context window, maximum output, whether it reasons,
and cost per million tokens in and out — the fields on `Model` (pi-ai
types.d.ts:647-666), and what a person choosing a model for a profile
wants. (**Open 8:** whether cost belongs on the default line or behind
`--json`; the prices in a pin go wrong before the model ids do.)

### 4. The growth map

- **Reads or edits the home's configuration → a verb under `config`.**
  In likely order: `bot config path` (the one line a shell wants,
  unparsed); `bot config check` (validate the home's own file, and its
  profiles against the catalog — the cross-check §3 declined, which
  needs no assembly and has no other home); `bot config edit` (open
  `$EDITOR`, with the rule that comes with it: bot opens an editor, bot
  does not become one).
- **About a provider or a credential → a verb under `auth`, and only
  after auth's screen is re-cut** (§1c). Candidate: `bot auth check
  <provider>` — does this credential still work. It is the one verb
  that would legitimately need the network, which is exactly why it
  must be a verb a person types and never a default.
- **Reads a run → a top-level reading verb**, the seven's pattern.
- **Changes what the home holds → a verb under `assembly`.**
- **About the catalog → an argument or flag on `models`**, never a new
  word.

**Budget: six top-level lines existed; `config` and `models` spend two;
four remain.** When they are gone the next capability groups under an
existing noun or displaces one. That number is what makes this map real
rather than decorative.

**What stays OUT, so nobody re-litigates it.** No interactive mode:
nothing drops into a prompt loop. `bot auth login` is the one
conversation, it is one the PROVIDER asked for (auth.md:37-44), it is
bounded by one login, and it refuses up front without a terminal
(auth.ts:153). No chat verb, no REPL, no `bot ask` — bot runs agents
and is not a chatbot (ADR 0002). No `bot config set`: `config.yaml` is
a file a person owns, greps and copies between homes (ADR 0018's whole
control story), and a second writer turns it into a file that must be
kept in step with something; editing it is editing it (**Open 9** —
precisely the convenience Ian may want, and his to overrule). No
daemon, no scheduler, no background anything — inspection.md:301-303
says it for prune and it generalizes.

### 5. Help-screen exhibits

Plain English, and no noun that exists only in our code — no rung, no
sentinel, no bundle, no invocation. Home, assembly, flow, stage, run,
profile, tier, provider and model are user words: a person writes them
in `config.yaml`. Counts below are the count `cli-help.test.ts:53`
takes, against its cap of 24.

**`bot config --help` — 22 lines**

```text
usage: bot config [--json] [--home DIR]

What one home is set up to do: where the home is, the defaults every
assembly inherits, and the model choices the home names. It only
reads — the file is yours to edit, and nothing here writes it.

Each default says where it came from: `home` when the home's
config.yaml sets it, `default` when nothing does. Profiles are listed
one line per tier, with the model each one chooses.

Nothing here prints a credential. The credential file is named so you
know which one this machine uses, and never opened; bot auth is
where the logins are.

options:
  --json       one JSON object: the paths, the defaults, the profiles
  --home DIR   the home to read (default BOT_HOME, else
               ~/.local/share/bot)

example:
  bot config --home ./trial
```

**`bot models --help` — 23 lines**

```text
usage: bot models [provider] [--json]

The models this machine can call: one line per model, with its
provider, how much it can read at once, how much it can write, and
what a million tokens cost in and out.

With no provider named it lists only the models whose provider you
are signed in to or hold a key for — the list you can actually use.
Name a provider and it lists that provider's whole catalog, callable
or not; some of them are long.

The catalog is the one built into the model library bot ships with,
so it is as current as bot is. Nothing here asks a provider for a
newer list, and nothing here reaches the network.

Takes no --home: models belong to the machine, the way logins do.

options:
  --json   one JSON object per model, in the same order

example:
  bot models anthropic
```

**The overview they land in — 20 lines**

```text
bot — run agent assemblies and inspect what they leave behind

usage: bot <command> [arguments]

  run      run a flow against a request
  check    validate an assembly and report what would run
  assembly list, install, link, update, remove the home's assemblies
  auth     the logins bot runs with
  config   what one home is set up to do
  models   the models this machine can call
  runs     list the runs the home holds
  show     read one run's record
  output   write out what one run answered
  logs     the tool calls the home's runs made
  session  read the transcript of one stage
  status   report what the home holds and what it weighs
  prune    report old runs; delete them only when told

`bot <command> --help` describes one command.
```

The two new lines sit after `auth`: the machine's subjects first, then
the home's, then what the runs left behind.

### 6. The recommendation, and the options it beat

**RECOMMENDED — two new top-level words: `bot config` (takes `--home`)
and `bot models` (takes none), both readings, neither with verbs on day
one, the redaction law structural, and the catalog's staleness said out
loud in its own help screen.**

**Option A — fold both into `bot status`.** Cheapest: no top-level line
spent. Rejected: status answers what the home holds and what it weighs,
in one line, the shape `docker system df` taught
(inspection.md:287-292). Making it answer three unrelated questions
forces a flag to select which one — sub-law (a) broken in the first
commit — and changes a command the specification already pins.

**Option B — one `config` noun holding both: `bot config show`,
`bot config models`.** Spends one top-level line instead of two, and
Ian did say a config hierarchy is welcome. Rejected: models are not the
home's configuration. `bot config --home ./trial models` would read a
home to answer a question no home has a part in, and `bot config` bare
would stop having one obvious reading. The saving is one line out of
six.

**Option C — a literal `bot admin <verb>` group.** The most direct
reading of "an admin hierarchy is welcome", reserving ONE top-level
line for every future administrative verb. Rejected twice over.
`admin` is a category, not a subject — it names nothing bot owns, and
grouping by category is how a CLI ends up with plumbing and porcelain.
And the one-screen rule (§1c) would make `bot admin --help` describe
every unrelated verb under it inside 24 lines, running out at about
five while meaning nothing in particular. The budget is not tight
enough to force it; if it ever is, C is the right move then, not now.

**Option D — `bot auth models`.** Argued and rejected in §3: it costs
auth its single subject, and its screen has three lines left.

**Open 10 — the two words themselves.** `models` is plural to match the
listings (`runs`, `logs`); `config` is what the file is called. Ian
ratifies vocabulary (he ratified `profile` and `tier` himself, ADR
0018), so `model`, `settings`, `home`, or anything else is his to name,
and the law above holds whatever the words turn out to be.

## Context

Ian's words on 2026-08-07 were that model listing and configuration
viewing want proper design, not slop, with the taste behind them:
subcommands over flags, nothing behind weird top-level options, an
admin/config hierarchy welcome (punchlist.md:53-56). What made this an
ADR rather than a ticket is that bot has no stated rule for the shape a
new capability takes. `assembly` and `auth` became nouns for reasons
obvious in the moment and never written down — ADR 0017's consequence
line calls auth "the first verb family with a subcommand" and says "the
CLI's noun discipline holds" without saying what the discipline is. Two
capabilities arriving the same day is the moment to say it, because the
third and fourth would otherwise each be argued from scratch.

Model listing needed research rather than a decision. "List the models"
sounds like one question and is three, and the tempting answer — print
the catalog — would be bot claiming to know something it knows only as
of its pin. Two things had to be established first: that the catalog is
reachable on sanctioned surface at all, and what it actually holds.
Both were measured here against pi-ai 0.83.0 rather than assumed, and
the numbers — 38 providers, 1153 models, one dynamic provider reporting
zero, `getAvailable()` in 1 ms with no network — are what turned "list
the models" into "list the models this machine can call, and say where
the list came from".

## Consequences

- The overview grows from 18 lines to 20 against a cap of 24 that
  `tests/cli-help.test.ts:53` enforces and `prune` already sits at.
  Four top-level lines remain after this ADR, forever.
- `specification/elements/inspection.md` gains two sections and two
  rows in its command table, which already carries `bot auth` as a
  cross-reference row (inspection.md:37-48). Both are readings, so
  inspection is their chapter and no new chapter is needed. Spec-terse,
  when the tickets land, never ahead of the behavior.
- `bot models` is the first command whose answer depends on the pinned
  Pi's *content* rather than its interface, so a Pi upgrade becomes
  visible to users and not only to the build. That argues for naming
  the version somewhere, and against pinning any test to a model count.
- Implementation is two tickets, positioned after ratification.
  `bot config` reads only what the runtime already parses and should be
  small; `bot models` needs its own reading of the `Models` surface plus
  the empty-answer and provider-not-found refusals. Both need a ratchet
  petition sized the standing way (ADR 0015), and corpus rows only where
  a refusal is new.
- The `checkAuth`-not-`getAuth` law is the first rule here a lint could
  carry. It is law and left to review; a `no-restricted-syntax` rule is
  a cheap follow-up if it is ever violated once.
- ADRs 0003, 0010, 0013, 0017 and 0018 all stand. This spends no new
  dependency, opens no deep import, prints no credential, and moves no
  configuration out of the home.
