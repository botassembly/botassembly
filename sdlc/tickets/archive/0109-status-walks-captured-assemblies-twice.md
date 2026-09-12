---
flow: build
priority: 3
---
# Status walks captured assemblies twice

Promoted 2026-08-21 from
`sdlc/issues/0109-status-walks-captured-assemblies-twice.md`
(severity should-fix, filed by the 2026-08-20 observability review;
priority low at triage — cost, not correctness).

`bot status` (`bot/src/inspection.ts:318-327`) recursively sizes
the whole home, then recursively sizes every captured assembly
again for `copyBytes` — repeated walk and stat work that grows with
retained captures at the stated multi-run load.

Done, observably: one recursive walk accumulates both the total and
the capture subtotal, and status's reported numbers are unchanged
for the same home.
