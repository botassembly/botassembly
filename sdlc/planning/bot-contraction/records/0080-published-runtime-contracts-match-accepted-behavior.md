---
flow: quickfix
priority: 6
completed: 2026-09-10
---
# Published runtime contracts match accepted behavior

## Result

The active specification and maintained invocation guide now state the behavior that Bot already implements. Pre-release contracts change with the runtime until the first public release creates the first compatibility boundary. Both resume spellings derive the assembly, optional flow, and request from the donor. They resolve current authored controls again. Only contiguous plain root stages can carry into a resumed run. LOOP, CHOOSE, PARALLEL, FANOUT, DESCEND, and their contents run fresh.

The guide now separates the commands. `bot resume RUN` accepts the four existing path and identity controls. `bot run resume RUN` adds bounded correlation metadata and structured JSON output. Correlation enters `run_start` and the structured result. JSON changes output form. No active guide teaches the removed `bot run --continue` spelling.

One documentation check protects both retired claims across regular specification Markdown and maintained guides. It excludes changelog history, conformance fixtures, generated pages, planning, records, and archives. Thirteen rejecting cases and five permitting cases prove command occurrence binding, negation, clause and sentence subject boundaries, both compatibility noun orders, and Markdown headings, quotes, lists, and nested markers.

## Complexity and review

The design scored 5 and level 2. The work crossed several public documents and needed hostile proof, but it changed no runtime state, record contract, command parser, workflow, or compatibility implementation. Luna High implemented the ticket with high reasoning. Separate Sol Medium agents reviewed the design and code.

Five design remediations and five implementation remediations closed real false-positive and false-negative paths. Reviews separated the two commands' option sets, tied correlation and JSON claims to their actual meanings, bounded refusal text to each retired command occurrence, evaluated every relevant modal clause, stopped subject carry at another subject, and normalized repeated Markdown prefixes. The final code review accepted without findings after 19 adversarial content probes and eight path-scope checks.

## Checks

The focused red proof failed on the two live contradictions. The final focused test passed all five subtests with thirteen rejecting and five permitting in-memory cases. All ten documentation script tests passed. The documentation build produced 24 pages.

The implementer, code reviewer, and primary agent ran root `make check` under Node 22.22.3. The primary check passed 53 project tests, 212 runtime test files with 1,466 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.05%. The production source ratchet remains 15,995 of 15,995 nonblank lines.

Hosted runtime run `34454691028` passed on exact published implementation head `7f50007a4ac3937b22e1be8f90decf5a53084fa7`. Hosted docs run `34454691070` passed its build and artifact upload and produced non-expired artifact `10142968405` for that head. Deployment found the artifact and reached the existing Pages-disabled HTTP 404 with the explicit enablement message. The external Pages issue remains open and does not reflect a documentation build failure.

## Source

This manual ticket started from published commit `2983530826008e6e36cd38fb9f5500fb16506658`. Commits `811c862a` through `d3e41808` record the design, reviews, and remediations. Commit `f25354b5` contains the accepted implementation. Commit `7f50007a` records final review acceptance and is the exact hosted implementation head. This ticket completes source draft 0225. Draft 0227 is next.
