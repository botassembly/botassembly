---
flow: build
priority: 1
deps: [0300]
---
# Ship declarations and state the library compatibility rule

## Outcome

Every declared `bot/*` package path resolves to the current TypeScript runtime under Node and to generated declarations under TypeScript. A consumer installed from the packed artifact type-checks every path. The public library reference names each path, its document schemas, and the pre-1.0 compatibility rule.

## Current facts

Observed at `b9c5cf9`; `bot/src` is 19,902 nonblank lines.

- `bot/package.json:7-15` maps seven subpaths straight to `.ts` runtime files. It has no root `.` export, no `types` condition, no declaration build, and no `files` list. `npm pack --dry-run --json --ignore-scripts` includes the source and tests but no declarations.
- `bot/tsconfig.json:3-20` checks NodeNext TypeScript with `noEmit`, `allowImportingTsExtensions`, and strict options. That setting belongs to Bot's source build. An ordinary strict NodeNext or Bundler consumer which follows a public `.ts` target fails on Bot's relative `.ts` imports with `TS5097` unless it adopts Bot's source-only compiler option.
- Node remains a source runtime. The launcher executes `bot/src/cli.ts` (`Makefile:63-83`), and `bot/package.json:19-21` requires Node 22.22 or newer. This ticket does not add a JavaScript build.
- The outside-consumer proof symlinks the checkout into scratch `node_modules` and runs JavaScript (`bot/tests/importable-readers.test.ts:42-54,101-104`). It proves runtime export resolution, not packed installation or TypeScript resolution.
- The seven paths and targets are `./admin-readings` to `src/public-admin-readings.ts`, `./inspection` to `src/public-inspection.ts`, `./mutation-readings` to `src/public-mutation-readings.ts`, `./one-run` to `src/one-run.ts`, `./record-lines` to `src/record-lines.ts`, `./run-readings` to `src/public-run-readings.ts`, and `./session` to `src/session.ts` (`bot/package.json:7-15`). The four `public-*` entry modules intentionally narrow command readings; the older three paths expose their current source exports.
- Public signatures use `Buffer` and `NodeJS.ProcessEnv`, including `CommandResult` at `bot/src/new-command-result.ts:6` and the three command-reading doors. `@types/node` is currently a development dependency (`bot/package.json:46-55`; `bot/package-lock.json:27-36`), so an installed package does not own the Node declarations its public types require.
- `CLI_CONTRACTS` has 27 operation descriptors and is the owner of structured kind and schema version (`bot/src/cli-contract.ts:9-38`). The command export tests cover 25 operations. `auth.list` and `model.list` remain outside the package doors because they require the Pi runtime (`bot/tests/library-contract.test.ts:37-40`). Raw `run.output`, `run.record`, `run.request`, and `run.session` have no schema version.
- The publication is unreleased and targets 0.1.0. Later pre-1.0 releases may change contracts without migration, and 1.0 is the first cross-version compatibility boundary (`specification/README.md:34-38`). Ticket 0300 expressly left TypeScript declaration stability to this ticket (`sdlc/tickets/archive/0300-mutating-command-exports.md:62,71,92-96`).

## Package contract

Replace every string export with this ordered conditional shape, using the corresponding names listed below:

```json
"./admin-readings": {
  "types": "./types/public-admin-readings.d.ts",
  "default": "./src/public-admin-readings.ts"
}
```

| Export path | Runtime target | Declaration target |
| --- | --- | --- |
| `./admin-readings` | `./src/public-admin-readings.ts` | `./types/public-admin-readings.d.ts` |
| `./inspection` | `./src/public-inspection.ts` | `./types/public-inspection.d.ts` |
| `./mutation-readings` | `./src/public-mutation-readings.ts` | `./types/public-mutation-readings.d.ts` |
| `./one-run` | `./src/one-run.ts` | `./types/one-run.d.ts` |
| `./record-lines` | `./src/record-lines.ts` | `./types/record-lines.d.ts` |
| `./run-readings` | `./src/public-run-readings.ts` | `./types/public-run-readings.d.ts` |
| `./session` | `./src/session.ts` | `./types/session.d.ts` |

`types` comes first because TypeScript requires that order. `default` preserves the present ESM runtime target for Node and other resolvers. Do not add a root export or a CommonJS target.

Generate declarations from all `bot/src/**/*.ts` with pinned TypeScript 5.9.3. Add `bot/tsconfig.types.json`, extending the checked source options and setting `noEmit: false`, `declaration: true`, `emitDeclarationOnly: true`, `rootDir: "src"`, and `declarationDir: "types"`. Add one package-owned build script which removes only `bot/types`, invokes that project, and rewrites relative declaration specifiers ending in `.ts` to `.js`; TypeScript does not rewrite those declaration specifiers itself. Add only the explicit source return annotations declaration emit requires. Do not hand-author public signatures or change runtime behavior.

`types/` is generated, ignored, and absent from Git. Add `"files": ["src", "types"]`, so a pack contains the runtime source, generated declarations, package metadata, the executable target, and bundled production dependencies, but not tests or development scripts. Add `prepare` to rebuild declarations after `npm ci`, for a Git dependency, and before `npm pack`; do not run two lifecycle builds. Move exact-pinned `@types/node` 26.1.2 into `dependencies` and include it in `bundleDependencies`, so the installed declarations do not depend on an undeclared consumer package. Keep `private: true`, version `0.0.1`, the Node engine, the bin target, all runtime dependencies, and the existing bundled Pi packages unchanged.

## Compatibility and documentation

Add `docs/src/content/docs/reference/library.md` and place it beside Command reference in the sidebar. It must say:

- the package is ESM and runs its TypeScript source on Node 22.22 or newer;
- consumers import only the seven declared paths;
- before 1.0, paths, exported names, parameters, return types, declarations, and returned document schemas may change or disappear without migration, so a consumer pins the exact package version or source revision;
- schema versions distinguish documents within the matched runtime publication. A `@1` document does not promise compatibility with a later pre-1.0 package;
- 1.0 is the first promised cross-version boundary;
- CommonJS `require`, undeclared subpaths, JavaScript build artifacts, npm-registry publication, parsed-object returns, and TypeScript versions other than the pinned 5.9.3 check are not promised.

The page has one authored table mechanically checked against `package.json` and `CLI_CONTRACTS`. `admin-readings` lists its six version-1 kinds; `mutation-readings` lists its nine version-1 operations, with both run operations returning `bot.run.result@1`; `run-readings` lists its six structured version-1 kinds and three raw readings; `one-run` includes raw `run.session`; `inspection`, `record-lines`, and `session` say that they return lower-level readings with no command-document schema. The table must not claim exports for `auth.list` or `model.list`.

Add a `specification/CHANGELOG.md` entry naming the declaration paths, packed-artifact proof, and compatibility rule. Change no normative assembly, record, command, error, or schema text. Do not bump `bot/package.json` or a document schema version.

## Scope and exclusions

Add declaration generation, package metadata, the packed-consumer test, the library reference, sidebar entry, and changelog entry. Preserve every runtime export and its behavior. Keep the typed parsed-document layer, `auth.list`, and `model.list` for later tickets. Do not publish a package, add a root export, compile JavaScript, redesign function arguments, or broaden platform support.

The generated internal declarations may exist in the artifact because public declarations refer to internal types. Package `exports` remains the import boundary. The artifact test must reject imports of undeclared source or declaration subpaths and must confirm the private names already guarded at `bot/tests/importable-readers.test.ts:85-92` remain absent from public namespaces.

## Acceptance

Start red in a new `bot/tests/package-types.test.ts`. Assert all seven exports have the exact conditional targets above, then build and pack. Before the fix, the missing `types` condition or the packed TypeScript consumer must fail; preserve a mutation which removes one `types` target and requires a failure naming that path.

Then prove from the actual `.tgz`, installed into a scratch consumer rather than symlinked to the checkout:

1. The artifact contains `package.json`, `src/**/*.ts`, and `types/**/*.d.ts`; it contains no `tests/`, `scripts/`, TypeScript config, ESLint config, or Vitest config. Every package target exists. Cleanup removes the scratch install, tarball, and generated `bot/types` even after failure.
2. Plain Node 22.22 imports all seven paths from the installed artifact. Runtime value-export names match declaration value-export names, and the guarded private names remain absent.
3. The pinned TypeScript 5.9.3 compiler checks one strict consumer under `module` and `moduleResolution` `NodeNext`, and the same consumer under `module: ESNext` with `moduleResolution: Bundler`, both with `skipLibCheck: false` and without `allowImportingTsExtensions`. The consumer imports a value from every path and every currently exported named type, exercises representative arguments and resolved return types, and uses `@ts-expect-error` to prove undeclared subpaths and private exports stay unavailable.
4. A declaration rebuild succeeds from a clean missing `types/` directory. Every relative declaration specifier ends in `.js`, every target resolves, and a second build produces byte-identical declaration files.
5. A documentation test compares the seven table rows to `package.json` and derives the structured and raw operation lists from `CLI_CONTRACTS`, preventing a stale schema inventory.

Run the focused package, outside-consumer, and library-contract tests; `npm -C bot run typecheck`; `npm -C bot run lint`; `git diff --check`; the production-size check; `make check`; `make platformcheck`; and hosted Linux, macOS, and manually dispatched WSL platform legs.

## Dependencies

Ticket 0300 is landed and recorded. It fixes the current seven-path surface. Tests use only the local package, pinned dependencies, scratch directories, and the local npm cache populated by `npm ci`. They use no registry publication, network request, paid service, provider, or credential.

## Size decision

- Starting production size: 19,902 nonblank lines.
- Expected ending production size: no more than 19,906 nonblank lines. Declaration configuration, generation, tests, and documentation sit outside `bot/src`; only declaration-emission annotations may touch production source.
- Simpler approach tried: point each `types` condition at its runtime `.ts` file.
- Why rejected: strict NodeNext and Bundler consumers then inherit Bot's `.ts` import specifiers and fail with `TS5097` unless they copy Bot's source-only `allowImportingTsExtensions` setting. Hand-authored declarations would duplicate seven changing public surfaces and could drift from source.
- Accepted cost: packing runs one declaration build, the artifact carries generated declarations and `@types/node`, and the generator rewrites declaration-only relative suffixes. Node continues to run source `.ts` files.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 2
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: this ticket creates the public TypeScript resolution and pre-1.0 compatibility contract for seven paths. It reaches package metadata, generated artifacts, Node, two TypeScript resolution modes, public documentation, and installed consumers. Proof must distinguish source-check success from an independently packed install and catch declaration drift and private-name leakage. A wrong declaration breaks consumers but remains correctable in the next pre-1.0 release.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. An independent `gpt-5.6-sol` agent with medium reasoning reviews the code.

Re-score if implementation requires a JavaScript build, a root package export, CommonJS support, handwritten public declarations, or a compatibility promise beyond the current pre-1.0 rule.

## Reversible decisions

The `types` directory, generated-declaration approach, `default` runtime condition, and documentation placement can change in a later pre-1.0 ticket. Ian can instead require CommonJS or a compiled JavaScript artifact, but either choice widens this ticket and the release contract. The existing pre-1.0 and 1.0 boundary remains the governing decision.

## Review

- Origin: plan item 24, requirement L5 and proposed ticket 4 in `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`, and the current handoff at `sdlc/planning/notes/2026-09-14-handoff-admin-surface.md:9-15`.
- Design review: pending.
- Code review: pending.
