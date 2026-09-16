---
flow: build
priority: 1
deps: [0300]
---
# Ship declarations and state the library compatibility rule

## Outcome

Every declared `bot/*` package path resolves to generated ESM JavaScript under Node and to generated declarations under TypeScript. A consumer installed from the packed artifact runs and type-checks every path. The installed command starts and resumes a scripted run. The public library reference names each path, its document schemas, and the pre-1.0 compatibility rule.

## Current facts

Observed at `b9c5cf9`; `bot/src` is 19,902 nonblank lines.

- `bot/package.json:7-15` maps seven subpaths straight to `.ts` runtime files. It has no root `.` export, no `types` condition, no declaration build, and no `files` list. `npm pack --dry-run --json --ignore-scripts` includes the source and tests but no declarations.
- `bot/tsconfig.json:3-20` checks NodeNext TypeScript with `noEmit`, `allowImportingTsExtensions`, and strict options. That setting belongs to Bot's source build. An ordinary strict NodeNext or Bundler consumer which follows a public `.ts` target fails on Bot's relative `.ts` imports with `TS5097` unless it adopts Bot's source-only compiler option.
- Pinned npm 10.9.8 does not run a root package's `prepare` during `npm ci`; it does run `prepare` before `npm pack`. `make -C bot install` currently runs only `npm ci` (`bot/Makefile:10-14`), so a lifecycle hook alone would leave a clean checkout without declarations.
- Hosted fresh-cache evidence found a second package-ownership gap: `npm ci` can cache dependency tarballs needed to build and pack Bot without caching the registry packuments that a later offline consumer install needs to resolve unbundled dependencies. The actual `.tgz` therefore must carry every direct runtime dependency rather than pass only through a cache warmed by the package build.
- The checkout launcher executes `bot/src/cli.ts` (`Makefile:63-83`), and `bot/package.json:19-21` requires Node 22.22 or newer. That source path works outside `node_modules` under Node's built-in type stripping.
- Implementation evidence disproved the accepted packed-runtime design. An actual tarball installed offline under Node 22.22.3 fails every `.ts` package export and the `.ts` bin with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`: `Stripping types is currently unsupported for files under node_modules`. `--experimental-transform-types` produces the same refusal. The installed package therefore needs emitted JavaScript; declaration-only generation cannot satisfy the runtime contract.
- The outside-consumer proof symlinks the checkout into scratch `node_modules` and runs JavaScript (`bot/tests/importable-readers.test.ts:42-54,101-104`). It proves runtime export resolution, not packed installation or TypeScript resolution.
- The seven paths and targets are `./admin-readings` to `src/public-admin-readings.ts`, `./inspection` to `src/public-inspection.ts`, `./mutation-readings` to `src/public-mutation-readings.ts`, `./one-run` to `src/one-run.ts`, `./record-lines` to `src/record-lines.ts`, `./run-readings` to `src/public-run-readings.ts`, and `./session` to `src/session.ts` (`bot/package.json:7-15`). The four `public-*` entry modules intentionally narrow command readings; the older three paths expose their current source exports.
- Public signatures use `Buffer` and `NodeJS.ProcessEnv`, including `CommandResult` at `bot/src/new-command-result.ts:6` and the three command-reading doors. `@types/node` is currently a development dependency (`bot/package.json:46-55`; `bot/package-lock.json:27-36`), so an installed package does not own the Node declarations its public types require. A consumer compile can otherwise pass accidentally through the consumer's ambient Node types.
- Every run requires the exact-byte SHA-256 of a colocated lockfile before `run_start` (`bot/src/runtime-provenance.ts:86-101`; `specification/elements/record.md:118-135`). npm excludes `package-lock.json` from a tarball even when `files` names it. npm includes `npm-shrinkwrap.json` when `files` names it. A packed Bot with no publishable lockfile would refuse every start and resume before run birth.
- `CLI_CONTRACTS` has 27 operation descriptors and is the owner of structured kind and schema version (`bot/src/cli-contract.ts:9-38`). The command export tests cover 25 operations. `auth.list` and `model.list` remain outside the package doors because they require the Pi runtime (`bot/tests/library-contract.test.ts:37-40`). Raw `run.output`, `run.record`, `run.request`, and `run.session` have no schema version.
- The publication is unreleased and targets 0.1.0. Later pre-1.0 releases may change contracts without migration, and 1.0 is the first cross-version compatibility boundary (`specification/README.md:34-38`). Ticket 0300 expressly left TypeScript declaration stability to this ticket (`sdlc/tickets/archive/0300-mutating-command-exports.md:62,71,92-96`).

## Package contract

Replace every string export with this ordered conditional shape, using the corresponding names listed below:

```json
"./admin-readings": {
  "types": "./types/public-admin-readings.d.ts",
  "default": "./dist/public-admin-readings.js"
}
```

| Export path | Runtime target | Declaration target |
| --- | --- | --- |
| `./admin-readings` | `./dist/public-admin-readings.js` | `./types/public-admin-readings.d.ts` |
| `./inspection` | `./dist/public-inspection.js` | `./types/public-inspection.d.ts` |
| `./mutation-readings` | `./dist/public-mutation-readings.js` | `./types/public-mutation-readings.d.ts` |
| `./one-run` | `./dist/one-run.js` | `./types/one-run.d.ts` |
| `./record-lines` | `./dist/record-lines.js` | `./types/record-lines.d.ts` |
| `./run-readings` | `./dist/public-run-readings.js` | `./types/public-run-readings.d.ts` |
| `./session` | `./dist/session.js` | `./types/session.d.ts` |

`types` comes first because TypeScript requires that order. `default` selects emitted ESM JavaScript for Node and other resolvers. Set the package bin to `dist/cli.js`. Do not add a root export or a CommonJS target.

Generate ESM JavaScript and declarations from all `bot/src/**/*.ts` with pinned TypeScript 5.9.3. Add `bot/tsconfig.package.json`, extending the checked source options and setting `noEmit: false`, `declaration: true`, `emitDeclarationOnly: false`, `rootDir: "src"`, `outDir: "dist"`, `declarationDir: "types"`, and `rewriteRelativeImportExtensions: true`; include only `src/**/*.ts`. Do not emit source maps. Add one `build` script, backed by `bot/scripts/build-package.mjs`, which removes only `bot/dist` and `bot/types`, invokes that project once, rewrites only relative declaration module specifiers whose final suffix is `.ts` to `.js`, and prepends the exact directive `/// <reference path="../node_modules/@types/node/index.d.ts" />` to each of the seven declaration targets in the table. TypeScript rewrites static and dynamic relative imports in emitted JavaScript, but not declaration specifiers or the `new URL("./cli.ts", import.meta.url)` child entry. Make that child entry select its sibling `.ts` when executing from source and `.js` when executing from `dist`. Reject any other hand-maintained runtime rewrite. Add only the explicit source return annotations declaration emit requires. Do not hand-author public signatures or change command behavior.

`dist/` and `types/` are generated, ignored, and absent from Git. Add `"files": ["dist", "types", "npm-shrinkwrap.json"]`. A pack contains emitted JavaScript, generated declarations, the publishable dependency lock, package metadata, the executable target, and bundled production dependencies. It contains no TypeScript source, source maps, tests, or development scripts. Rename `bot/package-lock.json` to byte-identical `bot/npm-shrinkwrap.json`; update the runtime provenance default, hosted npm-cache paths and their test, and ADR 0030's live evidence link. `npm ci` continues to install that one exact lock, and every checkout and artifact hashes the same lockfile bytes. Do not keep two dependency locks or add a fallback which could hash different files.

Add one `prepare` script which runs `npm run build` for Git dependency installation and `npm pack`. Because root `npm ci` does not run it under pinned npm, make `bot/Makefile`'s `install` target run `npm ci` and then the same `npm run build`; add no second lifecycle hook and no separate runtime and declaration builds. The repository launcher and direct source command remain `bot/src/cli.ts`; package self-references resolve through `package.json` to built `dist` files after `make -C bot install`. Move exact-pinned `@types/node` 26.1.2 into `dependencies`. Set `bundleDependencies` to every direct runtime dependency: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@types/node`, `ajv`, `proper-lockfile`, and `yaml`. Preserve their exact versions and the existing dependency graph. Keep `private: true`, version `0.0.1`, and the Node engine unchanged.

Derive the package root from the executing `runtime-provenance` module. When that module runs from `src`, retain the existing checkout behavior and exact `package.json` plus regular `src/**/*.ts` tree hash. When it runs from `dist`, never adopt an enclosing consumer repository's Git `HEAD`: report source `unknown`, digest null, and hash `package.json` plus regular `dist/**/*.js` files with the existing byte framing and domain. Both modes hash the colocated `npm-shrinkwrap.json`. Update `specification/elements/record.md`, `specification/elements/inspection.md`, and the current Bot contraction summary to describe the source-or-emitted runtime snapshot. The field names, record shape, checkout hash, and schema versions do not change.

## Compatibility and documentation

Add `docs/src/content/docs/reference/library.md` and place it beside Command reference in the sidebar. It must say:

- the installed package is ESM and runs emitted JavaScript on Node 22.22 or newer; the repository launcher runs its TypeScript source from a checkout;
- consumers import only the seven declared paths;
- before 1.0, paths, exported names, parameters, return types, declarations, and returned document schemas may change or disappear without migration, so a consumer pins the exact package version or source revision;
- schema versions distinguish documents within the matched runtime publication. A `@1` document does not promise compatibility with a later pre-1.0 package;
- 1.0 is the first promised cross-version boundary;
- CommonJS `require`, undeclared or direct `dist` and `types` subpaths, source files in the package, source maps, npm-registry publication, parsed-object returns, and TypeScript versions other than the pinned 5.9.3 check are not promised.

The page has one authored table mechanically checked against `package.json` and `CLI_CONTRACTS`. `admin-readings` lists its six version-1 kinds; `mutation-readings` lists its nine version-1 operations, with both run operations returning `bot.run.result@1`; `run-readings` lists its six structured version-1 kinds and three raw readings; `one-run` includes raw `run.session`; `inspection`, `record-lines`, and `session` say that they return lower-level readings with no command-document schema. The table must not claim exports for `auth.list` or `model.list`.

Add a `specification/CHANGELOG.md` entry naming the emitted runtime, declaration paths, packed-artifact proof, runtime-tree distinction, and compatibility rule. Apart from the runtime-tree wording above, change no normative assembly, record, command, error, or schema text. Do not bump `bot/package.json` or a document schema version.

## Scope and exclusions

Add the ESM runtime and declaration build, package metadata, publishable shrinkwrap provenance, source-or-emitted runtime identity, the packed-consumer test, the library reference, sidebar entry, and changelog entry. Preserve every runtime export and command result. Keep the typed parsed-document layer, `auth.list`, and `model.list` for later tickets. Do not publish a package, add a root export, add CommonJS, redesign public function arguments, or broaden platform support.

The generated internal declarations may exist in the artifact because public declarations refer to internal types. Package `exports` remains the import boundary. The artifact test must reject imports of undeclared source or declaration subpaths and must confirm the private names already guarded at `bot/tests/importable-readers.test.ts:85-92` remain absent from public namespaces.

## Acceptance

Start red in a new `bot/tests/package-types.test.ts`. Assert all seven exports have the exact conditional targets above and the bin names `dist/cli.js`, then build, pack, install, and import. Before the fix, the packed runtime fails with the observed `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`; the missing `types` condition also fails the strict consumer. Preserve table-driven mutations which replace one `.js` runtime target with its `.ts` source and remove one `types` target, and require failures naming each changed path.

Then prove from the actual `.tgz`, installed into a scratch consumer rather than symlinked to the checkout:

1. The artifact contains `package.json`, `npm-shrinkwrap.json`, `dist/**/*.js`, `types/**/*.d.ts`, and the complete npm bundle closure of the seven direct runtime dependencies named above; `bundleDependencies` exactly covers `dependencies`. It contains no `package-lock.json`, `src/`, source map, `tests/`, `scripts/`, TypeScript config, ESLint config, or Vitest config. Every export, declaration, and bin target exists. The shrinkwrap bytes equal the renamed repository lock bytes. Only the allowlisted package files, npm-required metadata, and declared bundle closure appear. Cleanup removes the scratch install, tarball, empty consumer cache, and generated `bot/dist` and `bot/types` even after failure.
2. After packing, create a new empty npm cache which was not used by `npm ci` or `npm pack`. Install the actual tarball into a scratch consumer with pinned npm 10.9.8, `--offline`, `--ignore-scripts`, and no package lock. The install must make no registry request and require no cached packument. From that same install, plain Node 22.22 imports all seven paths and invokes the installed `bot` bin. Runtime value-export names match declaration value-export names, and the guarded private names remain absent. After a checkout build, package self-reference imports of all seven paths resolve to the same `dist` targets. Runtime and type resolution must reject `bot/src/*`, `bot/dist/*`, `bot/types/*`, and every other undeclared subpath.
3. The pinned TypeScript 5.9.3 compiler checks one strict consumer under `module` and `moduleResolution` `NodeNext`, and the same consumer under `module: ESNext` with `moduleResolution: Bundler`, both with `skipLibCheck: false`, `types: []`, and no `allowImportingTsExtensions`. The consumer has no own `@types/node` and no ambient Node types. It imports a value from every path and every currently exported named type, exercises `Buffer` and `NodeJS.ProcessEnv` in representative signatures and resolved return types, and uses `@ts-expect-error` to prove undeclared subpaths and private exports stay unavailable. Assert no consumer-root `node_modules/@types/node`, assert `node_modules/bot/node_modules/@types/node`, and capture TypeScript resolution evidence which resolves `@types/node/index.d.ts` from that exact nested path through the package-relative reference.
4. A package build succeeds from clean missing `dist/` and `types/` directories. Every relative executable import points to `.js`; the source-and-emitted child CLI selector reaches `src/cli.ts` and `dist/cli.js` respectively; every relative declaration specifier ends in `.js`; each public declaration target starts with the exact Node type reference; and every target resolves. No source map exists. A second build produces byte-identical `dist` and `types` trees.
5. From a clean checkout state, `make -C bot install` creates the complete `dist` and `types` trees after `npm ci`. A following `npm pack` invokes the sole `prepare` hook and produces the same trees without another lifecycle owner. A scratch consumer also installs a committed disposable local Git dependency with scripts enabled and receives working `dist`, declarations, exports, and bin from that `prepare`; the proof remains offline and cleans the Git fixture.
6. Invoke the installed artifact's bin against a private scratch home and one local assembly. A scripted `bot run start --json` succeeds, then `bot run resume --json` carries the completed stage and succeeds without provider or network contact. Both `run_start` events record source `unknown`, null Git digest, the SHA-256 of the installed `npm-shrinkwrap.json`, matching hashes of the installed `package.json` and `dist/**/*.js` runtime tree, the executing Node, and the resolved provider adapter. A focused provenance test retains the checkout `src/**/*.ts` hash and proves an emitted runtime never reads an enclosing consumer Git repository.
7. A documentation test compares the seven table rows to `package.json` and derives the structured and raw operation lists from `CLI_CONTRACTS`, preventing a stale schema inventory.

Run the focused package, outside-consumer, and library-contract tests; `npm -C bot run typecheck`; `npm -C bot run lint`; `git diff --check`; the production-size check; `make check`; `make platformcheck`; and hosted Linux, macOS, and manually dispatched WSL platform legs.

## Dependencies

Ticket 0300 is landed and recorded. It fixes the current seven-path surface. Packaging uses the local cache populated by `npm ci`; the consumer proof uses a separate empty cache and only the actual tarball's bundle. Tests use scratch directories and a scripted run. They use no registry publication, network request, paid service, provider call, or credential.

## Size decision

- Starting production size: 19902 nonblank lines
- Ending production size: 19908 nonblank lines
- Simpler approach tried: point each `types` and runtime condition at source `.ts`, enable `--experimental-transform-types`, or add the generic `/// <reference types="node" />` directive to generated entries.
- Why insufficient alternatives were rejected: Node 22.22.3 refuses TypeScript under `node_modules` with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, including with the transform-types flag. Strict NodeNext and Bundler consumers also inherit Bot's `.ts` import specifiers and fail with `TS5097` unless they copy Bot's source-only setting. The generic Node directive does not select the package's nested bundled copy. Hand-authored JavaScript or declarations would duplicate changing surfaces and drift from source.
- Production code deleted: none. The six added lines select the source or emitted provenance tree, the source or emitted child CLI, and annotate two declaration-emission returns.
- Accepted cost: install and packing run one deterministic JavaScript-and-declaration build. The artifact carries emitted ESM JavaScript, declarations, the complete direct runtime dependency bundle, and the publishable shrinkwrap. This increases artifact bytes but adds no production source line and changes no dependency version or edge. The checkout launcher continues to run source `.ts` files, while installed consumers run `.js` files.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 2
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: rescoring after the emitted-runtime discovery remains 7. This ticket creates the public runtime, TypeScript resolution, and pre-1.0 compatibility contract for seven paths. It reaches package metadata, build output, dependency and source-or-emitted provenance, Node, two TypeScript resolution modes, hosted cache setup, public documentation, and installed consumers. Proof must distinguish source-check success from an independently packed start and resume, catch runtime and declaration drift and private-name leakage, and prove the package supplies its Node types. A wrong runtime target, declaration, or omitted lock breaks consumers or every packed run but remains correctable before release.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. An independent `gpt-5.6-sol` agent with medium reasoning reviews the code.

Re-score if implementation requires a root package export, CommonJS support, handwritten runtime or public declarations, source maps, or a compatibility promise beyond the current pre-1.0 rule.

## Reversible decisions

The `dist` and `types` directories, generated-artifact approach, `default` runtime condition, and documentation placement can change in a later pre-1.0 ticket. Ian can instead require CommonJS, source maps, or shipped TypeScript source, but each choice widens the release contract. The existing pre-1.0 and 1.0 boundary remains the governing decision.

## Review

- Origin: plan item 24, requirement L5 and proposed ticket 4 in `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`, and the current handoff at `sdlc/planning/notes/2026-09-14-handoff-admin-surface.md:9-15`.
- Design review: rejected once. The first draft omitted the lockfile npm excludes from packs, let consumer ambient Node types hide a missing package dependency, and assumed root `npm ci` ran `prepare` under pinned npm.
- Design response: the package now uses one publishable `npm-shrinkwrap.json` for checkout and artifact provenance and proves successful installed scripted start and resume. Every public declaration carries a package-relative path reference to the bundled nested Node types, and strict consumers have no own or ambient Node types. Isolated TypeScript 5.9.3 probes resolved that nested copy under both NodeNext and Bundler; the generic `types="node"` directive did not provide that ownership guarantee. `make -C bot install` explicitly generates declarations after `npm ci`; one `prepare` remains for Git installation and packing. Disposable npm 10.9.8 probes reproduced package-lock omission, shrinkwrap inclusion when named in `files`, root-ci's absent prepare, and pack's prepare.
- Design re-review: accepted by the same independent reviewer. The reviewer verified the single `npm-shrinkwrap.json` provenance artifact, packed scripted start and resume, the explicit package-relative Node type reference under strict NodeNext and Bundler consumers without ambient Node types, the explicit post-`npm ci` declaration build and sole `prepare` hook, the artifact allowlist, the 19,910 production-line cap, complexity level 3, and the `gpt-5.6-sol` medium-reasoning implementation and review route.
- Implementation-discovered design rejection: an actual offline `.tgz` installation under Node 22.22.3 rejected every source export and the installed command with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` and `Stripping types is currently unsupported for files under node_modules`; `--experimental-transform-types` did not change the result. The prior declaration-only artifact could not meet its accepted installed-runtime proof.
- Reopened design response: emit ESM JavaScript to `dist`, route all package runtime targets and the bin there, build runtime and declarations together, exclude source and maps from the artifact, and identify the installed runtime from its emitted tree. A disposable actual tarball installed offline imported all seven paths, ran the emitted command, and completed scripted start and resume with matching emitted-tree provenance. The 19,930 cap, level 3 score, and Sol Medium route replace the accepted revision's size statement.
- Reopened design review: accepted. The reviewer reproduced Node 22.22.3's TypeScript-under-`node_modules` refusal and accepted the emitted ESM `dist` runtime, `dist/cli.js` bin, seven export targets, source-or-emitted provenance, actual-tarball imports and scripted start and resume, strict consumer declarations, artifact allowlist, lifecycle and cleanup rules, 19,930 production-line cap, complexity level 3, and `gpt-5.6-sol` medium-reasoning implementation and review route.
- Implementation red evidence: the initial package contract test failed because `./admin-readings` still targeted `./src/public-admin-readings.ts` instead of the ordered declaration and runtime conditions. The first actual tarball then failed all installed source exports and the source bin with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, which reopened the design. Declaration emission next exposed two inferred `SlotExecutionEnv` returns with `TS2742`; explicit source return annotations resolved only that portability defect.
- Implementation green evidence: the actual-tarball suite passes 8 tests under Node 22.22.3. It proves the exact artifact allowlist, seven installed imports, private and undeclared subpath refusal, strict TypeScript 5.9.3 NodeNext and Bundler consumers with only the package-owned nested Node types, deterministic emitted trees, clean and Git installs, and installed scripted start and resume with emitted-tree provenance. The focused provenance, outside-consumer, and library-contract suite passes 53 tests; the library documentation check passes 1 test; the runtime-workflow check passes 4 tests; type checking, lint, unused-code analysis, cycle detection, pinned dependencies, the 19,908-line ratchet, clean install, install check, and platform check pass. The complete repository gate passes 161 script tests and 1,901 Bot tests across 226 files.
- Hosted fresh-cache design rejection: a later hosted proof used an empty consumer npm cache and showed that the tarball still depended on registry packuments for unbundled `ajv`, `proper-lockfile`, and `yaml`. The packaging `npm ci` had cached usable tarballs without enough metadata for that consumer resolution, so the warmed-cache green result did not prove package ownership.
- Package-ownership response: bundle all seven exact direct runtime dependencies and require the same actual tarball to install offline from a newly empty cache before imports, type checks, the installed command, and scripted start and resume. Versions, dependency edges, production size 19,908, complexity level 3, and the Sol Medium route remain unchanged.
- Independent package-ownership re-review: accepted at reviewed commit `ebb2e08ec87511a01b515f2f92c59f3839df6602`. The reviewer accepted the exact seven-dependency bundle, fresh empty-cache offline tarball install, artifact and cleanup rules, unchanged dependency graph and production size, and retained level 3 Sol Medium route.
- Code review at `78e885f`: rejected with two medium findings. The package proof built and removed the checkout's shared `dist` and `types` while Vitest ran other files concurrently, and the documentation test hand-copied the eligible operation inventory instead of deriving it from `CLI_CONTRACTS`.
- Code review response: package build, pack, self-reference, tarball installation, and cleanup now operate in one isolated scratch copy. The documentation check derives paths from explicit `auth.list` and `model.list` exclusions, the unavoidable `run.session` exception, mutation ownership, and the remaining run and administrative contracts. Structural regression probes fail on the former shared-output mutations and 25 copied eligible operation names, then pass after the changes.
- Package-ownership red evidence: after a successful `npm ci` populated a newly empty npm cache, actual tarball installation with another empty cache failed with `ENOTCACHED` on the `ajv` registry packument. This reproduced hosted runtime run 35078982907; its Linux, macOS, and WSL platform jobs passed, while the Ubuntu complete check stopped at that install.
- Package-ownership green evidence: `bundleDependencies` exactly equals the seven direct runtime dependencies. The isolated actual-tarball suite passes 8 tests with pinned npm 10.9.8 and a separate empty consumer cache, and proves every packed dependency file belongs to the mechanically walked dependency and optional-dependency closure. The focused provenance, outside-consumer, and library suite passes 53 tests; the derived documentation check passes 1 test; the workflow check passes 4 tests; type checking, lint, unused-code analysis, cycle detection, pinned dependencies, the 19,908-line ratchet, and diff check pass. Clean install, install check, and platform check pass. The complete repository gate passes 161 script tests and 1,901 Bot tests across 226 files after remediation.
- Code review: pending.
