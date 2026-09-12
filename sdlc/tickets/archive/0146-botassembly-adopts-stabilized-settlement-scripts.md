---
flow: build
priority: 24
waits-on: ["botassembly/sdlc/0169", "botassembly/sdlc/0170", "botassembly/sdlc/0171", "botassembly/sdlc/0176"]
---
# Botassembly adopts the stabilized settlement scripts

SDLC 0169 corrects withdrawal liveness, SDLC 0170 and 0171 preserve activation across teardown failure and an interrupted landing, and SDLC 0176 keeps a retryable fault's candidate aligned with its resumed sealed stages. Botassembly carries copied `failure` and `success` scripts, so its deployed checkout must adopt the complete settled contract after all four changes land.

Done, observably: all five `sdlc/project` files match the deployed SDLC canonical bytes and executable modes; propagation proves each replaced file is a historical canonical version; consumer checks cover the changed withdrawal and activation outcomes without changing Bot runtime behavior; and Doctor reports no lifecycle-script drift afterward.

The propagation command uses a temporary registry containing only this attempt's Botassembly worktree. It does not modify another registered checkout. No Bot runtime behavior changes beyond the separately authorized prune ticket, and no SDLC canonical file changes.
