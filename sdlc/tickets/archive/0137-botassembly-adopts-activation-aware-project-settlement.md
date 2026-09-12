---
flow: build
priority: 19
waits-on: ["botassembly/sdlc/0166"]
---
# Botassembly adopts activation-aware project settlement

Factory 0090 adds the durable consumer behavior for a landing whose registered checkout still needs activation. SDLC 0164 changes canonical `success` to produce that result and support activation-only reconciliation; SDLC 0166 makes one-sided activation input fail closed. Botassembly has no private lifecycle behavior, so its copied project scripts must adopt the corrected deployed canonical contract.

## What done looks like, observably

- All five `sdlc/project` files match SDLC's deployed canonical bytes and executable modes.
- Propagation proves every replaced file is a historical canonical version and refuses an unproven customization.
- The proof uses a temporary project registry containing only this attempt's Botassembly worktree. It never invokes zero-argument propagation against the live registry and never modifies another registered checkout.
- Consumer tests exercise the activation-pending result and activation-only invocation with the adopted script. No Bot runtime behavior changes in this ticket.
- Tests prove base-only and tip-only activation requests fail before Git or deploy side effects.
- Doctor reports no lifecycle-script drift for Botassembly after landing.

## Hard choice settled here

Adopt the complete canonical set mechanically rather than selectively merging `success`. Botassembly-specific behavior belongs in its own project hooks, not a lifecycle fork.

## Boundary

- No Bot runtime, CLI, provider, assembly, or run-record change.
- No SDLC canonical-script change.
- No Factory, Deck, BioMCP, or SDLC registered checkout is modified by this ticket's propagation command.
