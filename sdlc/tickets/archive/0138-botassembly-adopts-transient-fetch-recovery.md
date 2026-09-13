---
flow: build
priority: 30
waits-on: ["botassembly/sdlc/0167"]
---
# Botassembly adopts transient fetch recovery

SDLC 0167 makes canonical `tasks` retry one failed fetch and preserve a useful bounded diagnostic after two failures. Botassembly has no private lifecycle behavior, so its copied lifecycle set must adopt that deployed contract before normal dispatch resumes.

## What done looks like, observably

- All five `sdlc/project` files match SDLC's deployed canonical bytes and executable modes.
- Propagation proves every replacement is a historical canonical version and refuses an unproven customization.
- The propagation command uses a temporary registry containing only this attempt's Botassembly worktree. It never uses the live registry or modifies another checkout.
- Consumer tests exercise recovery after one fetch failure and the useful double-failure diagnostic without contacting a real remote.
- Doctor reports no lifecycle-script drift for Botassembly after landing.

## Boundary

- No Bot runtime, provider, assembly, or run-record behavior changes.
- No SDLC canonical file changes.
- No other registered checkout is modified.

