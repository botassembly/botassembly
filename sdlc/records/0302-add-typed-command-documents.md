---
base: 99fc963e4b763d07ff68c4b88f2f4f522b1102f5
head: edc7b1800ec652bd6cd1c915a5adf64a038fbe2e
---

# Add typed command documents over the byte readings

All 21 structured public command counterparts now have typed `*Document` functions beside their unchanged exact-byte `*Reading` functions. Each typed result retains the original exit, stdout, and stderr bytes. Valid operation documents remain documents at any exit, command refusals return the common typed error arm, and invariant or transport failures still reject.

One registry derives every operation identity, success bound, and inclusive or exclusive rule from `CLI_CONTRACTS`. Ordinary commands use exclusive JSON framing. Login retains its opaque bounded interaction prefix and logout accepts only its exact advisory. Only their matching post-mutation synchronization failures may retain both a success document and final error envelope. `home.busy` now publishes and enforces its exact inclusive 65-byte success-document limit without applying that limit to common error envelopes.

The package exports exact document and nested row types through the existing seven paths. Actual packed-artifact consumers import and call representative functions under Node and type-check under strict TypeScript 5.9.3 NodeNext and Bundler resolution. Raw operations and the Pi-runtime-owned `auth.list` and `model.list` remain outside the typed document set.

## Verification

Design review rejected three drafts before accepting the framing registry, generic nonzero-document rule, authentication-only dual-stream exceptions, opaque login prefix, exact logout advisory, and narrow specification reconciliation. A later independently accepted amendment added descriptor ownership for the exact inclusive `home.busy` bound.

Implementation followed red-green development. The first focused failure proved the built package lacked both read-only and mutation document exports. Later red proofs exposed incomplete registry comparison, overly broad run types, synthetic wrapper coverage, descriptor-independent bounds, authentication fixtures that bypassed public wrappers, and the accidental application of the 65-byte `home.busy` success bound to valid common error envelopes.

The final implementation derives all 21 rows from their owning descriptors, narrows emitted public types, drives real wrappers once through mutation and authentication cases, separates success-document and common-error bounds, and retains exact command bytes. Focused suites passed 112 tests. The actual packed artifact passed eight Node, NodeNext, and Bundler cases. Typecheck, lint, dead-code, cycle, diff, specification, public-tree, install, and platform checks passed. The complete local gate passed 161 repository and documentation tests, all 143 conformance cases, and 1,922 runtime tests across 229 files. Production size finished at 20,266 nonblank lines, four below the accepted ceiling.

The independent reviewer rejected three implementation rounds. The same reviewer accepted `edc7b1800ec652bd6cd1c915a5adf64a038fbe2e` after verifying descriptor-derived bounds, exact types, real-wrapper behavior, authentication framing, `home.busy` success and refusal behavior, packed consumers, cleanup, and the complete gate. Verdict: `ACCEPT` with no remaining findings.

## Honest limitations

Typed wrappers validate framing, bounds, operation identity, kind, and schema version. They do not validate every nested field in bytes from an untrusted source. The package remains ESM-only and pre-1.0. The four raw operations keep byte readings only. `auth.list` and `model.list` still require the Pi runtime and remain outside the public counterpart set.

## Hosted runs

Branch runtime run `35113520100` passed Ubuntu, macOS, WSL, complete check, and coverage at exact commit `edc7b1800ec652bd6cd1c915a5adf64a038fbe2e`.

After landing the same commit, main runtime run `35115287125` passed native platforms, complete check, and coverage; push-only WSL skipped as designed. Main documentation run `35115287745` passed the site build, native platforms, complete check, coverage, and deployment; push-only WSL skipped as designed.

- Origin: `sdlc/tickets/archive/0302-add-typed-command-documents.md`, plan item 32, and requirements L2 through L4 in the 2026-09-14 admin surface requirements note.
