---
base: 21bd5488311a6d57fd75fc8753dddf5844b0210e
head: e88d9d04a5ea8ccbba0b1f66f31aaa26f763138a
---

# Stored Git protocol fails closed

The stored-state collector now interprets supported Git repositories and settled protocol output completely. Real fixtures cover SHA-1 and SHA-256 repositories, linked worktrees, gitlinks without descent, `.gitmodules`, replacement refs, repository-owned alternate object storage, hostile ambient Git settings, and disabled repository filesystem-monitor execution.

Metadata parsing accepts only exact modes, types, stages, identifiers, sizes, separators, paths, and NUL framing. Batch parsing works across arbitrary chunk boundaries and rejects permutation, missing or wrong objects, non-ASCII grammar aliases, malformed sizes, truncation, duplicate responses, and trailing bytes. Repeated object identifiers are read and detected once while every semantic state remains distinct.

Limits and counters now agree at every tested edge. Empty scans start no object operation. Request refusal names the first excluded object. Framing includes headers, newlines, and terminators. Partial bodies count delivered bytes and identify the active object. Candidate and unique limits apply at object headers. Logical and finding limits apply later in deterministic semantic projection and return no partial findings. Invalid injected limits refuse before Git starts.

Independent design review accepted the repository and settled-protocol split after correcting logical admission order, test-adapter authority, and filesystem-monitor containment. Independent code review then found three defects: high-bit metadata could alias valid ASCII, a later truncated object named the first candidate, and the test adapter allowed extra Git arguments. The remediation added strict seven-bit grammar checks, active-object failure attribution, and exact stateful command validation. Independent review accepted all corrections.

Thirty-three focused tests passed through trusted settled adapters. No focused test called the production child launcher, which remains ticket 0272's boundary. The complete local gate passed 127 repository and documentation tests, 1,710 runtime tests across 203 files, all 143 conformance cases, static checks, and the production-size check under a minimal environment. Hosted runtime run `34724127951` passed on the exact implementation commit. Production size moved from 18,648 to 18,679 nonblank lines.

This completion does not claim production spawn, stdin flow, timeouts, signals, stream failures, forced cleanup, late events, or disclosure-safe lifecycle accounting. Ticket 0272 owns those proofs before working-state scanning or gate integration can use the collector.
