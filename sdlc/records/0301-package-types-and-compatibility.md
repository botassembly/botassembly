---
base: b9c5cf90c5251c4a42994e3d999e179b78b5c887
head: 401350fd90ef10fab6b881e19d96761f8eb072ac
---

# Publish package runtime, types, and compatibility

All seven public package paths now expose generated declarations and emitted ESM JavaScript. The executable uses the same emitted runtime. The artifact excludes source, maps, and development scripts while carrying one publishable shrinkwrap, the exact seven direct runtime dependencies, their mechanically checked closure, and package-owned Node declarations.

An actual packed artifact installs offline from a separate empty cache. Node 22.22.3 imports all seven paths, and strict TypeScript 5.9.3 consumers resolve them under NodeNext and Bundler without their own ambient Node types. The installed command and scripted start and resume use the emitted tree. Private and undeclared paths remain closed. The library documentation now states the pre-1.0 compatibility rule.

## Verification

Design review rejected the first draft, accepted its declaration design, then reopened after Node refused TypeScript source below `node_modules`. The revised design emits JavaScript and declarations together. A later hosted empty-cache failure reopened package ownership narrowly. The accepted amendment bundles the exact direct runtime set and proves its closure without changing dependency versions or edges. The archived ticket preserves every review decision and red-green transition.

Implementation started from failing export, installed-runtime, declaration-portability, fresh-cache, lifecycle, fixture-permission, timing, and nested and hoisted esbuild-launcher cases. The repairs isolate package construction from concurrent readers, derive the documented operation inventory from `CLI_CONTRACTS`, pin npm 10.9.8 in the hosted gate, preserve required esbuild launchers across Git repacking, make Pi fixture permissions deterministic, await package setup before cleanup, and grant only the measured package setup a bounded 300-second allowance.

The final local gate at `401350fd90ef10fab6b881e19d96761f8eb072ac` passed 227 Bot test files with 1,903 tests, 143/143 conformance cases, and 161 repository tests. The focused package and prepare set passed 10/10 in 182.75 seconds. Typecheck, lint, diff, install, platform, public-tree, and the 19,908-line production ratchet passed.

Code review first rejected two medium findings: concurrent shared-output mutation and a hand-copied documentation inventory. The implementation isolated generated package trees and derived the inventory from the runtime contracts. The same independent reviewer accepted the final implementation at `401350fd90ef10fab6b881e19d96761f8eb072ac` after the package-ownership and hosted lifecycle remediations.

## Honest limitations

The package promises ESM only. It does not promise a root export, CommonJS, source maps, registry publication, or compatibility across pre-1.0 minor versions. `auth.list` and `model.list` still need the Pi runtime and remain outside the public counterpart set.

## Hosted runs

Branch runtime run `35093362006` passed Ubuntu, macOS, WSL, complete check, and coverage at exact commit `401350fd90ef10fab6b881e19d96761f8eb072ac`. Main runtime run `35094970987` passed native platforms, complete check, and coverage at the same commit; push-only WSL skipped as designed. Main documentation run `35094971244` passed the site build, native platforms, complete check, and coverage; push-only WSL and disabled deployment skipped as designed.

- Origin: `sdlc/tickets/archive/0301-package-types-and-compatibility.md`, plan item 24, and requirement L5 and proposed ticket 4 in the 2026-09-14 admin surface requirements note.
