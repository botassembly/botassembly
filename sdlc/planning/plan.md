# Bot specification and runtime plan

Updated 2026-09-12. This is the current planning entry point. The specification states today's contract. Tickets describe accepted changes. Issues retain observed problems that do not yet support an implementation.

## Direction

Build a readable file format and a dependable runtime. Prioritize safe execution defaults, honest records, checking, running, stopping, resuming, and inspection. Keep control mechanisms tied to actual procedures and observed use.

The [first public alpha plan](decisions/2026-09-12-first-public-alpha-plan.md) is the accepted work sequence for `0.1.0`. An independent Astra extra-high review rejected its first authority boundary and accepted the corrected plan after it covered model-backed choices, subflow file inputs, enforceable publication checks, and exact-candidate qualification. Ticket 0264 leaves 13 retained issue files and 19 base release outcomes; its [starting-path matrix](notes/2026-09-12-0264-disposition-matrix.md) records every disposition.

The [direction decision](decisions/2026-09-08-ideal-state-direction.md), [post-contraction strategy](decisions/2026-09-09-post-contraction-strategy.md), [Pi boundary](adr/0030-pi-model-runtime-boundary.md), and [record publication decision](decisions/public-run-records.md) retain the reasoning that the alpha plan changes or builds upon.

## Next work

Work one reviewed ticket at a time from the alpha plan. Ticket 0263 isolated all tests from the operator's Pi authentication. Ticket 0264 classified every starting issue from landed evidence and promoted only confirmed release defects. The next ticket repairs the specification gate and puts it inside the complete local and hosted check.

Security and evidence work follows before runtime contract repair: remove runtime-derived public evidence, add known-secret detection, make file, Bash, and subflow-control authority explicit for ordinary stages and model-backed choices, confine subflow file input, minimize assembly-process environments, and enforce the private executable Pi configuration boundary Ian approved on 2026-09-12.

Correctness work then repairs whole-run consumption totals, timestamp-faithful run listings, descent depth, and current authentication and model qualification. FANOUT's four-key option contract already agrees across parser, specification, documentation, and conformance. Release work binds documentation publication to the complete gate, publishes the security and concurrency contract, prepares one exact `0.1.0` candidate, qualifies that commit from a clean clone, and tags that same commit only after Ian authorizes publication.

Every ticket receives independent design review, red-green implementation where behavior changes, independent code review, focused proof, and the smallest complete integration gate its risk requires. A ticket adds a dependency only when an earlier outcome technically prevents its work.

## No draft backlog

The draft directory is empty by decision.

- The unexplained provider stall remains an issue. An independent recurrence, or a deterministic reproduction and proved cause, plus relevant completed-operation timing evidence can justify a new ticket.
- The proposed retry and send-back reading is closed because no caller needs it. Observed demand must define any future ticket.
- The proposed installation-storage contraction is closed because it names no useful simplification. A future ticket must name the simplification, preserved guarantees, and any proposed guarantee changes.

An observed unresolved problem belongs in `sdlc/issues/`. A selected change with a supported outcome and proof belongs in `sdlc/tickets/`. This project does not keep speculative implementation drafts.

## Settled configuration decision

Ian approved requiring a current-owner regular `models.json` under a mode-`0700` directory, with file mode `0600`, no link, and no group write. This closes a path into configuration-backed command execution and can require an operator to copy shared Pi configuration into a private file. The implementation ticket will amend ADR 0030's former compatibility boundary.

## Later work

- Compare parent-only work with bounded delegation on the same requests after the release boundary is stable.
- Evaluate answer quality separately from runtime correctness.
- Add true process and credential separation only with a defined containment promise.
- Add richer retry readings only when a caller needs them.
- Revisit the provider stall only after the issue's evidence condition is met.
- Consider npm publication through its own package-content, provenance, installation, and upgrade design.
- Define cache inspection and cleanup after observed use establishes its boundary.

## Release rule

No public `v0.1.0` tag exists until every release blocker is complete, every issue has a recorded disposition, and the same recorded candidate commit passes local, hosted, clean-clone, and live qualification. Public evidence contains no runtime session. Release notes state every accepted limit.
