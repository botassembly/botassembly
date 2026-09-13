---
flow: build
priority: 10
completed: 2026-09-08
---
# Bot reports its source identity outside a run

## Result

`bot capabilities` now reports the Bot source identity without creating a run. JSON retains `data.commands` and adds `runtime`, `runtimeSource`, `runtimeDigest`, and `runtimeTreeSha256`. Markdown adds exactly one identity line after its heading. A missing Git identity reports source `unknown`, null JSON digest, and human `-`.

The capability command and a fresh top-level `run_start` share the package-version constant and the same bounded source-identity resolver. The resolver owns local Git and source-tree hashing once. The source-tree hash identifies the package and TypeScript bytes observed on disk. It does not claim to identify modules Node already loaded.

The command reads package source and may invoke local Git. It reads no Bot home, provider, credentials, network, or cache. A required source-tree identity failure exits 4 with empty stdout and the common retryable `dependency-failed` result under cause `runtime-identity-unavailable`. The command inventory, options, limits, generated help, schema version 1, and unsupported `bot --version` result remain unchanged.

## Design review

Independent design review corrected two stale claims in source draft 0209. The draft listed only `runtime`, `runtime_source`, and `runtime_digest` on `run_start`, but ticket 0054 had already added `runtime_tree_sha256`. The capability result therefore needs four source rather than three. The draft also named the factory replacement as the observed caller. The admitted evidence names one downstream analysis tool that needed the Bot version before it could identify a run.

The accepted design specifies the exact camel-case JSON fields, human line, unknown-Git forms, dependency failure, unchanged descriptor inventory, source-reading boundary, and source-tree meaning. It keeps lockfile, Node, and provider-adapter provenance inside run records. Capability discovery does not read those unrelated facts.

## Review and checks

Commit `9a09a472` preserves the red proof before production changes. The focused command was `PATH=/home/ian/.nvm/versions/node/v22.22.3/bin:$PATH npm test -- --run tests/capabilities.test.ts -t "capabilities reports the same source identity|capabilities renders unknown Git identity"`. Two tests failed and eight were skipped. The JSON data contained only `commands`; it omitted all four source identity fields. The injected unknown-source result also produced only the command inventory.

Commit `6dbb61f1` implemented the accepted identity reading and publication updates. The final focused command passed 39 tests across `capabilities.test.ts`, `runtime-provenance.test.ts`, `spec-publication.test.ts`, and `record-event-shape.test.ts`. Type checking passed. ESLint and all 29 custom lint-rule cases passed. Git diff checks passed.

Independent code review accepted `6dbb61f1` without findings. With Node 22.22.3, the primary complete offline check passed. It ran 19 project tests, 210 runtime test files with 1,442 tests, and 143 of 143 conformance cases. Coverage reported 97.06 percent of production lines across 105 production modules. The source ratchet passed at 16,022 of 16,022 nonblank lines.

No live-provider test ran.

## Size decision

- Starting commit: `5b03bc76`, the current main baseline after manual ticket 0061
- Starting production size: 15998 nonblank lines
- Ending production size: 16022 nonblank lines
- Net increase: 24 nonblank lines
- Simpler approach tried: call the full existing runtime-provenance resolver from capabilities and select its four source fields.
- Why insufficient alternatives were rejected: the full resolver also reads the lockfile and provider-adapter manifest. Those facts remain run-only provenance, and the accepted capability boundary excludes provider reads. The implementation factors the existing Git and source-tree work into one narrow resolver that both full run provenance and capability discovery call.
- Duplication search: `rg -n "runtimeSource|runtimeDigest|runtimeTreeSha256|runtime_tree_sha256|resolveRuntimeProvenance|runtimeTreeIdentity" bot/src` found the one run-start constructor, full provenance resolver, source-tree hasher, and their callers. The implementation reuses those owners. It adds no second Git command or hashing loop.
- Production code deleted: the refactor removes the inline source and tree assembly from the full provenance resolver. No command or retained behavior can leave under this ticket.
- Reason: 24 net nonblank lines add the narrow shared result, four capability facts, one human line, bounded dependency failure, and one shared package-version constant.
- Accepted cost: 24 maintained production lines and one local source scan per valid capability request. The command performs no home, provider, credential, cache, or network work.

## Source

This manual ticket came from draft 0209. The draft is consumed by this record. The strict-umask lifecycle provenance issue is next, followed by draft 0181.
