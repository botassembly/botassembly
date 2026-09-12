---
flow: build
priority: 9
---
# Botassembly adopts the current canonical before script

Factory Doctor reports that Botassembly's `sdlc/project/before` is the historical canonical version before SDLC 0150 classified transient green-main gate failures. This drift predates SDLC 0173's automatic propagation hook, so no later canonical landing triggered its one-time adoption.

Done, observably: replace only `sdlc/project/before` with the byte-identical, executable canonical file from the registered SDLC checkout; prove the replaced copy is a historical canonical version; keep Botassembly's complete gate suite green; and remove Botassembly's script-drift finding from Factory Doctor.

This is lifecycle adoption only. Do not change Bot runtime behavior, assertions, the other four lifecycle scripts, or SDLC canonical files. Future canonical changes remain the responsibility of SDLC 0173's automatic propagation mechanism.
