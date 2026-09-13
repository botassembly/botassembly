---
base: 732b15572542a3cc379436b072a5a1d712ef88a6
head: c82ff00533d3e249a833211aa6373f47f295b7bd
---

# Move the Pi packages together to 0.85.1

Bot now exact-pins and bundles `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent` at 0.85.1. The harness uses Pi's public creation, event, tool, and session APIs. New sessions use Pi's format-4 transactions at Bot's exact record path. Retained format-3 sessions remain readable.

Bot remains the only retry owner. Pi's retries and overflow continuation stay disabled beneath Bot's boundary. Prompt completion waits for the final selected assistant turn. Abort and close stay bounded when a provider ignores cancellation. Public faults preserve their cause chains.

The package grew because the coding agent and its dependency tree now ship inside it. A dry run measured 42,604,220 compressed bytes, 202,427,346 unpacked bytes, and 25,714 entries. The ticket records the alternatives and accepts this cost because ticket 0244 needs Pi's public model runtime.

Independent code review found stale generated bundle metadata in the lockfile. Regenerating the lockfile marked every bundled dependency correctly without changing versions, integrity hashes, resolved artifacts, or dependency edges. A separate review accepted that correction. `npm audit` reported zero vulnerabilities.

Two complete coverage runs exposed one test-only timing flake while more than 100 deltas crossed a one-mebibyte streaming proof. Isolated runs and the full owner file passed. The repair gives only that proof eight seconds to detect a hang. The shared four-second guard remains unchanged. The issue record preserves the measurements and accepted cost.

The final local check passed 93 repository checks, 143 conformance checks, and 1,591 runtime tests across 221 files. Coverage reached 92.26 percent of statements, 86.04 percent of branches, 94.21 percent of functions, and 97.21 percent of lines. Type checking, lint, dependency checks, dead-code analysis, cycle checks, size checks, documentation, and examples passed. GitHub Actions runtime run `34618911672` and documentation run `34618911705` passed on the published implementation commit.
