---
flow: build
priority: 5
completed: 2026-09-10
---
# The documentation workflow grants each job only its required permissions

## Result

The documentation workflow now grants only `contents: read` at workflow scope. The build job inherits that read-only access. The deploy job replaces it with exactly `pages: write` and `id-token: write`. Checkout explicitly disables credential persistence.

The workflow kept its triggers, concurrency, two jobs, dependency, environment, commands, paths, Node selection, and four mutable action refs. Manual ticket 0078 owns the action pins and one inventory-based policy across both maintained workflows. Draft 0229 remains active until that ticket completes.

## Complexity and review

The design scored 7 and level 4. Permission placement controls a privileged identity token and Pages deployment. A wrong edit could retain unnecessary authority or stop publication. Sol Medium implemented the ticket. Separate Sol Medium agents reviewed the design and code.

Design review split least-authority repair from action pinning. The split isolates permission failures from action-runtime failures. It accepts a second hosted run and temporary mutable documentation action refs. The revised hosted rule accepts either successful deployment or the exact known Pages-disabled 404 after a successful build and artifact upload. Code review accepted the implementation without findings.

## Checks

The focused red proof rejected the prior workflow-level write permissions. The implementer, code reviewer, and primary agent ran `node --test scripts/docs-workflow.test.mjs` under Node 22.22.3. All three tests passed. A positive case changed all four action suffixes and still passed. Twenty hostile mutations failed. The implementer, code reviewer, and primary agent built all 24 documentation pages and ran root `make check`.

The primary complete check passed 45 project tests, 212 runtime test files with 1,466 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.05%. The production source ratchet remains 15,995 of 15,995 nonblank lines.

Hosted runtime run `34440600369` passed on exact implementation commit `0d40d88744a59032875edc02988a1eff9ef35617`. Hosted docs run `34440600359` passed its build and upload steps and produced one non-expired `github-pages` artifact. Deploy found the artifact and failed while creating the deployment with status 404 and `Ensure GitHub Pages has been enabled`. The existing issue now records that observation and remains open.

## Source

This manual ticket started from published commit `458e4901a458998f15fe3e9b622f4a35f7cedbcd`. Commit `d9978288` records the accepted design. Commit `0d40d887` implements it. Draft 0229 remains next through manual ticket 0078.
