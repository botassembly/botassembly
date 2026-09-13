# ADR 0004 — TypeScript, erasable syntax only, no build step

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

The runtime is TypeScript restricted to erasable syntax
(`erasableSyntaxOnly: true`): no enums, no namespaces, no parameter
properties. Node runs the `.ts` files directly via native type stripping
(present unflagged since Node 22.18; the dev machine runs 22.22). There is no
compile step, no `dist/`, no source maps. `tsc --noEmit` runs as a check in
`make check`, exactly like lint.

## Context

The JSDoc-instead-of-TypeScript argument is really an argument against the
build step, not against types. JSDoc + `checkJs` would keep the checker but
make consuming Pi's generic-heavy API (TypeBox tool schemas, typed event
unions) painful in comment syntax. Native type stripping takes both benefits:
full checking against Pi's real `.d.ts`, and source files that are the
artifact. The strictness flags come from the predecessor's `tsconfig.base.json`
(strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `noImplicitReturns`), which were good.

## Consequences

- Union exhaustiveness (causes, stop reasons, sentinel types) is checked at
  compile time — a new member breaks the build, not a run.
- The runtime ships as source (it is a pinned, bundled application, not a
  library); if a compiled artifact is ever wanted, it is a release-time
  bundling concern, not a development one.
- Anything non-erasable that creeps in fails fast under the flag.
