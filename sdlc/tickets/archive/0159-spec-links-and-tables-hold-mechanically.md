---
flow: build
priority: 5
opens: sdlc/scripts/spec
---
# Spec links and tables hold mechanically

Two rendering defects sit in the specification today (at d0224ce): the Frontmatter refusal table in `refusals.md:57-62` is split by a prose paragraph, orphaning the `slot-reserved` row outside the table; and `conformance.md` lines 69, 76, 95, and 118 link to `invocation.md`, `home.md`, and `invariants.md` from the specification root where those files actually live under `elements/` (lines 137-139 link correctly). Nothing checks either class, so both rotted silently.

## Done, observably

- The refusals table renders whole with every row inside it, and the four links resolve.
- The spec gate refuses a specification change whose relative links do not resolve to files in the repository.
- A test proves the link check: a deliberately broken link turns the gate red naming the file and target.
- The duplicate line in `bot/tests/conformance-passing.txt` (143 lines, 142 unique) is removed and the ledger check rejects duplicates.

## Boundary

Mechanical integrity only. No contract sentences change meaning; table and link repairs are format-only. Markdown table linting beyond "the known break is fixed" is optional — add it only if the design finds a cheap check.
