---
base: 0fec4f62effb6018c542fd5900f3346cfcb8fb93
head: 0fc713e3a8e0c5812ce30e5a193c9471470800d1
---

# Docs require the complete same-commit check

The documentation workflow now calls the repository's runtime workflow as a reusable job from the exact caller commit. Deployment needs both the site build and that complete check. The existing publication variable, Pages environment, and deployment-only write authority remain. Changes under `examples/**` now trigger documentation alongside `docs/**`, `specification/**`, and the workflow itself.

The runtime workflow accepts `workflow_call` while preserving pull-request and main-push checks, full Git history, non-root execution, ancestry validation, pinned dependency preparation, and the single `make check` entry point. A future Linux and macOS matrix stays inside that runtime workflow, so Pages keeps one aggregate dependency.

Official GitHub documentation confirmed that `./.github/workflows/runtime.yml` resolves from the caller's commit and that the unchanged deployment condition retains the implicit success requirement across its dependencies. Tests pin the exact local call, site inputs, permissions, deploy dependency list, and trigger set. Hostile mutations reject external or ref-qualified calls, skipped or suppressed checks, partial duplicated jobs, removed dependencies, broadened authority, and omitted inputs.

Independent design review rejected the first draft because it failed to state that pull-request checks remain, overstated implementation complexity, and assumed an SDLC-only completion commit would trigger docs. The repaired design preserved all three runtime triggers, used level-3 routing, and requires an exact-commit manual docs dispatch for completion evidence. Independent extra-high code review found no material defect and passed all three workflow suites.

The complete local gate passed 139 repository and documentation tests, 1,586 runtime tests across 204 files, all 143 conformance cases, static checks, the repository scanner, and the production-size check. Production TypeScript remains 17,962 nonblank lines. Hosted runtime run `34775135489` passed on the implementation commit. Hosted documentation run `34775135812` built the site, passed its nested complete check on that same commit, and then completed successfully.
