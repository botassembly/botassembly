# Authentication

> **Stability: provisional.**
>
> Credential-provider integration and the details of login and import commands
> may change in a later publication. This chapter still specifies the behavior
> that ships now.

A runtime calls models, and calling a model needs a credential. The
authentication commands manage credentials, and they are the only part of bot that writes
them.

The credentials belong to the operator rather than to any workspace, so Pi
owns them in `auth.json` under its resolved agent directory. The default is
`~/.pi/agent/auth.json`. No
`--home` reaches them ([the home](home.md)). A `--home` given here is refused
rather than ignored, because a person who typed one is expecting per-home
credentials and does not have them. An existing Pi agent directory must be a real directory owned by the effective user with mode `0700`. Each operation validates only the Pi files that it uses. An existing `auth.json` or `models.json` must be a real regular file owned by the effective user with mode `0600`; a symbolic link is refused. Missing paths remain valid. Pi owns later agent-directory and authentication-file creation. Bot does not create a model file.

A credential-free provider catalog validates the agent directory and `models.json`. A model runtime or authentication listing also validates `auth.json`. The logout mutation runtime validates the agent directory and `auth.json` without loading `models.json`; the full logout command first resolves its provider through the credential-free catalog. Authentication import keeps its separate source and destination checks.

These checks limit which operating-system accounts can supply credential or command-capable local configuration through ordinary file access. They do not sandbox trusted configuration. Pi may run a supported command-backed key from `auth.json` or a leading `!command` value from `models.json` with the operator's filesystem and network authority. A same-account replacement or path race remains outside this boundary.

What the check does not do is worth saying plainly. It inspects a path and then lets Pi open that path again by name. It does not open the file without following links, and it does not compare the file it inspected with the file Pi then reads, so anything that can replace the path between the two wins. It validates the agent directory and stops: no ancestor of that directory is checked, so an agent directory reached through a writable or symlinked parent passes. The default agent directory sits under the operator's own home, where only the same account can do either. An agent directory redirected into a place another account can write is outside what these checks establish.

## The commands

| Command                     | Does                                          |
| --------------------------- | --------------------------------------------- |
| `bot auth list`             | bounded safe provider authentication status  |
| `bot auth login <provider>` | runs that provider's own sign-in and stores what it returns |
| `bot auth logout <provider>` | removes that provider's stored credential    |
| `bot auth import <file>`    | copies one compatible retired map into empty Pi authentication |

## The listing

`bot auth list [--offset N] [--limit N] [--json|-j]` is the current finite
form. It sorts provider identities bytewise before applying offset paging.
The default page holds 50 rows and the maximum holds 200. Human output carries
provider, method, and state, then the shown and total counts. JSON returns one
newline-terminated schema-version-1 `bot.auth.list` document with rows, page
facts, and summary counts. An empty provider catalog succeeds.

Each row carries only `provider`, `method`, `state`, and `credentialType`.
Method is `login` for a provider with OAuth, `key` for an API-key login, and
`ambient-only` otherwise. State is `stored` when Pi's safe credential metadata
names the provider and `unobserved` otherwise. Stored public metadata is the
only safe evidence in Pi 0.85.1. `unobserved` does not mean unavailable.
Credential type is `api_key` or `oauth` for a stored entry and null otherwise.
The command never asks Pi for provider authentication status or exposes a
credential value or Pi's free-text status label. It never resolves ambient
secrets, probes provider files, runs provider commands, refreshes
authentication, or uses the network.

Provider identities are at most 1,024 UTF-8 bytes. Encoded rows are below
4,096 bytes. Escaped human cells are at most 480 bytes, human rows are at most
4,096 bytes, and either complete output is below 1 MiB. Malformed requests
exit `2` before authentication access. Unsafe, corrupt, or invalid runtime
state exits `5` with one bounded error and no partial rows.

## Importing the retired store

`bot auth import SOURCE [--json|-j]` copies one complete compatible retired
Bot credential map into Pi's missing or valid empty `auth.json`. It never
merges, overwrites, selects, resolves, refreshes, or deletes credentials. The
source remains byte-for-byte and metadata unchanged. A successful nonempty
import preserves the source bytes exactly and returns `bot.auth.import` version
1 with `imported: true` and the effective `providerCount`. An empty map leaves
the destination unchanged, returns `imported: false` and count zero, and exits
`1`.

The source argument is at most 4,096 bytes. Each credential file is at most
1,048,576 bytes inclusive. The source parent and Pi agent directory must be
real effective-user-owned `0700` directories. The source and any destination
must be real effective-user-owned `0600` regular files with one link. Import
accepts only Pi API-key and OAuth credential shapes, including compatible
provider-specific extra fields.

Import locks Pi's destination before either file read, then locks the retired
source. It revalidates opened descriptors, parent identities, named leaves,
and exact source bytes before one atomic rename. The temporary file is
exclusive, owner-only, synced, revalidated, and closed before that rename.
Failures before rename preserve the destination. Failures after rename retain
the exact successful result. Import never prints credential content and emits
its own bounded result or stable failure instead of the retired-store warning.

One line per provider the runtime knows, whether or not anything is stored for
it: the provider's name, how a person signs in to it — its own login where it
has one, otherwise a key — and its standing. The standing is one of two plain
answers: `stored`, when the credential store's safe metadata names the
provider, and `unobserved` otherwise. The command reads no ambient secret, so
`unobserved` says what was not observed and never that the provider is
unavailable.

## Logging in

The provider owns its own sign-in. The runtime supplies a terminal and nothing
else: it prints the URL the provider hands it, prints a device code and where
to enter it, asks for what the provider asks for, and reads a secret without
showing it. **The runtime never opens a browser** — it prints the URL and a
person opens it, which is what makes a login over a remote shell work.

A login is a conversation, so it needs a terminal: with input piped in, it
refuses up front rather than waiting for an answer that cannot come. The
provider is matched by name exactly, never nearly, because a login stored under
the wrong name is a login nothing will look for. Provider interaction stays on
standard error. Ordinary human success is one bounded sentence. `--json` or
`-j` returns one version-1 `bot.auth.login` result with the canonical provider,
`authenticated: true`, and only the returned credential type: `api_key` or
`oauth`. The result never exposes another credential field.

The provider identity is at most 256 UTF-8 bytes. Each rendered interaction is
at most 2,048 bytes, and a login accepts at most 100 interactions and fewer
than 65,536 interaction bytes. Either success result is shorter than 4,096
bytes. Cancellation before mutation exits 1. A request refusal exits 2. A
provider failure exits 4 without repeating provider failure text. An unproven
storage failure exits 5 without claiming whether storage changed. When Pi
reports that persistence succeeded but in-process synchronization failed, Bot
keeps the truthful success result on standard output, adds one non-retryable
`synchronization-failed` error on standard error, and exits 5.

## Logging out

`bot auth logout PROVIDER [--json|-j]` resolves one exact provider through the
credential-free catalog, then invokes Pi's idempotent logout. It does not list
credentials first. The dedicated Pi runtime uses the live authentication path,
no model file, no creation refresh, and disabled model network. Bot performs no
credential read, authentication or availability check, or provider refresh
before deletion, so stored command-valued credentials are not evaluated. A successful transaction completes even when
the credential was already absent and leaves every other provider alone.
Human output is one bounded completion sentence. JSON returns one
newline-terminated version-1 `bot.auth.logout` result with only the canonical
provider and `result: "completed"`. Completed does not claim that a credential
existed or that ambient authentication is disabled.

The provider identity is at most 256 UTF-8 bytes and either result is shorter
than 4,096 bytes. Request and provider validation precede the retired-store
warning and credential access. Cancellation before deletion exits 1. Request
refusal exits 2. An unproven storage failure exits 5 without a completion
result. When Pi reports that deletion succeeded but in-process synchronization
failed, Bot preserves the completion result, writes one non-retryable
`synchronization-failed` error, and exits 5. Pi owns parsing, mutation, typed
post-delete synchronization, and the file lock that serializes same-provider
logout with login and OAuth refresh.

## The laws

**No command here ever prints a credential**, a fragment of one, or an expiry —
not a listing, not a success, not a refusal, not a failure. That is the whole
of what makes a terminal safe to paste.

**A stored credential owns its provider**, and the environment answers for the
providers that have none. Provider API keys in the environment keep working
exactly as their own documentation describes.

**The runtime reads no other credential store.** Bot's retired credential file
is `$XDG_CONFIG_HOME/bot/credentials.json`, or `~/.config/bot/credentials.json`
when the variable is unset. That is the path the warning below stats and the
path `bot auth import` is normally pointed at. If Bot's retired credential
file exists, `bot run start`, `bot run resume`, and `bot model list`, plus `bot auth list`, `bot auth login`, and `bot auth logout`, warn once after
validation and before authentication begins. Help, capabilities, assembly commands, checks,
and record inspection do not warn. `bot auth import` is excluded from this
warning and emits its import-specific result or failure. The
retired file remains unchanged and inactive except as this command's explicit
source. An operator can still roll back to a version that reads the preserved
file.
