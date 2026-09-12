# ADR 0011 — Upstream engagement with Pi

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

Capabilities the runtime needs that Pi does not cleanly expose are filed
upstream early — before our seam freezes — and glued minimally on public API
in the meantime, with each glue site marked `// upstream: <issue>` for
deletion. We track upstream weekly in a local FOSS checkout and upgrade the
pin deliberately (ADR 0003).

The ranked asks:

1. **Stabilize harness prompt/idle semantics** (currently marked provisional).
   The gating model (ADR 0007) rests on "prompt() resolves ⇔ agent went
   quiet" and on sequential prompt cycles on one harness being supported use.
2. **Export the classifiers and lenses** the predecessor deep-imported:
   `isRetryableAssistantError`, `isContextOverflow`, `normalizeProviderError`
   (pi-ai), cache-waste lenses, and the faux provider + event-stream helpers
   for deterministic testing. Converts the worst predecessor fragility into
   supported API at near-zero upstream cost.
3. **Per-session subprocess management:** enumerate/kill a session's spawned
   children through public API (today private and process-global). P4 sharpened
   the ask: direct parentage + process groups already cover everything except a
   `setsid` escapee (live reproduction in
   `prototypes/p4-signals/findings.md`), and pidfd cannot fix that either — the
   right upstream shape is spawn-time containment (cgroup or equivalent) for
   what Pi's bash tool spawns. The predecessor's pidfd C helper stays retired.
4. **Truncated-turn repair:** a sanctioned "synthesize cancelled tool results
   and continue" for assistant-tail transcripts; interim glue is a neutral
   continuation prompt (ADR 0007).
5. Smaller: per-prompt output-token budget; a supported "will this transcript
   fit this model" function; the 64-char cache-key clamp bug; exported
   per-provider credential env names; published-types hygiene so embedders do
   not need `skipLibCheck`; a harness-level `toolExecution` option (today
   per-tool only — P6) and batch termination honoring *any* `terminate: true`
   rather than requiring every result to set it, which today costs a mixed
   invalid+valid control-tool batch one extra provider round (P6, live
   reproduction in `prototypes/p6-driver-record/`).
6. **Move the auth/model-runtime layer down out of the interactive product:**
   `ModelRuntime`/`AuthStorage` (locked file-backed credential store, OAuth
   refresh under cross-process lock) live in `pi-coding-agent`, so an
   embedder that wants the user's stored logins must either depend on the
   interactive product or reimplement a locking store. Both are wrong;
   pi-ai already owns refresh inside `store.modify()`, so the store belongs
   beside it (ADR 0013).

One deliberate non-ask: mid-flight session suspend/resume. Pi documents full
durability as impossible for an embedder, the predecessor agreed twice (its
ADRs 0003, 0034), and spec invariant 44 ("a dead run is dead") closes the
question on our side.

## Context

The first runtime is also the first serious embedder feedback Pi's agent-core
SDK gets. Asks filed while our prototypes are fresh carry working
reproductions, which is what gets them accepted.
