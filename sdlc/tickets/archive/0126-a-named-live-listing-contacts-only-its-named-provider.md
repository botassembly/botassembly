---
flow: build
priority: 5
---
# A named live listing contacts only its named provider

`bot models --live PROVIDER` calls the pinned library's
collection-wide refresh, so asking for one provider's catalog
contacts every configured dynamic provider
(`sdlc/issues/2026-08-21-named-live-models-refresh-all-providers.md`).
The command prints one provider's models and quietly spends every
credential's network access to do it. That is a boundary problem:
a named request must limit its reach to what it named, and it gets
worse anywhere credentials are shared or metered.

## What done looks like, observably

- `bot models --live PROVIDER` performs network access against the
  named provider only. Other configured providers see no request —
  observable by pointing two mock providers at the runtime and
  asserting only the named one is contacted, kept as a test.
- `bot models --live` with no provider keeps today's behavior:
  refreshing everything is what an unqualified live listing means.
- The listing's output is unchanged; only its reach narrows.

## Boundary

The pinned library offers no provider-targeted refresh, so this is
a local workaround at bot's own seam — filtering what is refreshed,
or refreshing through a per-provider path if the library exposes
one indirectly. No issue is opened on the upstream project from
this ticket or its flights, per the standing rule: the library gap
is documented in the notes folder and whether to contact the
maintainers is Ian's decision. If no honest local workaround
exists, that is a refusal explaining why, not a silent widening of
the boundary.
