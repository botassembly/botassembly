# ADR 0031 — The specification is the smallest contract every runtime keeps

**Status:** accepted · **Date:** 2026-09-24 · **Ruled by:** Ian

## Decision

Botassembly is the specification plus `bot`. `bot` is its only runtime.

Every runtime supports everything in the specification, always. A runtime may do more than the specification says. It may never contradict the specification.

The specification stays as small as it can be. Every proposed addition must show that every runtime has to support it. An addition that only one runtime needs belongs in that runtime.

Runtime-specific behavior goes through hooks and runtime configuration. Cost limits are the standing example. A cost limit is a runtime concern and never a specification element.

ThinkThen is its own product with its own command line. It is a core primitive that Botassembly and other tools use. It is never a Botassembly runtime and never a part of Botassembly. An assembly reaches it through an ordinary command, such as a gate.

## Consequences

- A proposal to add a specification element names why every runtime must support it. Without that reason, the proposal becomes runtime configuration or a hook.
- Runtime configuration stays out of the conformance corpus. A second runtime would not have to match `bot`'s configuration.
- The open judgment issues are judged against this rule. The cost ceiling in item 2 of `sdlc/issues/2026-09-21-what-botassembly-owes-the-judgment.md` leaves the specification. Whether an answerer for `CHOOSE.md` and `LOOP.md`, or a stage with no agent, belongs in the specification must pass the same test.
- The 2026-09-14 ruling in `sdlc/planning/plan.md` stands. `bot` has no whole-run spending ceiling today. A later budget in `bot` would arrive as runtime configuration.
- Botassembly the platform names more than this repository: the specification and runtime, SDLC, the work queue, Optimizer, and Bench. Those live in separate repositories for now. A monorepo is not ruled out.
