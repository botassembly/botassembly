---
flow: build
priority: 31
waits-on: ["botassembly/sdlc/0168"]
---
# Botassembly adopts descendant-safe activation

SDLC 0168 corrects canonical activation so a clean current main that provably contains a stored landed tip can activate without rolling later work backward. Botassembly carries a copied lifecycle set and must adopt the deployed canonical correction.

## What done looks like

- All five `sdlc/project` files match the deployed SDLC canonical files byte-for-byte and mode-for-mode.
- Propagation proves every replaced file is a historical canonical version and uses a temporary one-project registry; it does not modify another registered checkout.
- Consumer tests reproduce a stored activation tip followed by a later main descendant and prove Botassembly's adopted `success` activates the current clean main and returns the original exact receipt.
- Botassembly 0138 reaches ordinary done through Factory's activation path without rebuilding or repushing it.

## Boundary

- No Bot runtime, provider, model, queue, or canonical SDLC change.
- No reset, clean, stash, force push, or manual queue settlement.
