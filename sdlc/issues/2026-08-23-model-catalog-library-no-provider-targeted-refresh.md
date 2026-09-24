# The pinned model-catalog library has no provider-targeted refresh

Moved from Ian's notes vault on 2026-09-24. Written 2026-08-23; nothing was rechecked on the move.

2026-08-23. The library bot pins for model catalogs exposes only a collection-wide `Models.refresh()`. There is no way to refresh one provider's catalog, so `bot models --live PROVIDER` contacts every configured dynamic provider even though it prints only the named one's models (repo issue: `botassembly/sdlc/issues/2026-08-21-named-live-models-refresh-all-providers.md`; ticket 0126 pursues a local workaround at bot's own seam).

A provider-targeted refresh in the library would be the clean fix. Per the standing rule, no issue is opened upstream from any session or flight — whether and how to contact the maintainers is Ian's call. If 0126 lands a satisfactory local workaround, this note is just a record; if it refuses, this note is the request that needs Ian's decision.
