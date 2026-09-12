---
flow: build
priority: 5
---
# Canonical script proof does not depend on moving SDLC

Botassembly's lifecycle-adoption proof compares this checkout with the currently registered SDLC checkout. A canonical SDLC change can therefore make Botassembly main red before its own adoption ticket gets a lease.

ADR 0019 keeps byte-identical lifecycle scripts but moves adoption under each consumer's Factory lease. Botassembly needs a green baseline while a newer canonical revision waits.

## Done, observably

- Botassembly carries a committed provenance manifest naming the adopted SDLC commit plus the hash and executable state of each lifecycle script.
- Its tests compare local scripts with that manifest rather than with a moving sibling checkout.
- The initial manifest describes the canonical revision already present, so no lifecycle-script bytes or Bot behavior change.
- A local script change without a matching manifest update fails, while a later adoption can update both atomically.

## Boundary

Factory Doctor still reports lag from current canonical SDLC. Do not adopt a newer script here, change Bot runtime behavior, or touch BioMCP or BioData.
