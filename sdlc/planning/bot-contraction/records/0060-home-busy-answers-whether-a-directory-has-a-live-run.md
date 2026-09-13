---
flow: build
priority: 10
completed: 2026-09-08
---
# `bot home busy` answers whether a directory has a live run

## Result

`bot home busy DIRECTORY` now exposes the existing directory-liveness predicate through the noun command surface. Human output reports `Busy: yes` or `Busy: no`. Version-1 JSON reports the same boolean as `data.busy`. Both modes exit zero for either valid answer. Quiet mode writes nothing and exits zero for busy or one for idle.

The command resolves relative directories against the caller's working directory. Home selection uses explicit `--home`, then `BOT_HOME`, then the platform default. Missing state answers idle. An unreadable or malformed run tree remains conservative and answers busy. The legacy command and the noun command call the same `isBusy` implementation. The legacy parser, output, exits, and liveness rules remain unchanged.

Capability discovery, generated help, the inspection specification, conformance coverage, the command matrix, and the retirement ledger publish the implemented command. The caller migrations remain separate work. Legacy command deletion remains held until deployment and every caller row has a verified migration commit.

## Review

Independent Sol Medium design review accepted manual ticket 0060 after it fixed the command shape, output bytes, exit behavior, malformed-request cases, home precedence, shared predicate boundary, and publication requirements.

Sol Medium implemented the accepted ticket. Independent Sol Medium code review rejected the first commit because its busy proof relied only on malformed state, the conformance chapter copied a stale capability list, and the retirement ledger still marked the command missing. The remediation added a current valid run record under a real held lock, proved relative busy and idle targets through every noun mode and legacy quiet parity, tied conformance to the compiled inventory, and marked the replacement implemented. The follow-up review accepted the remediation.

## Checks

The first focused run was red. All four new tests failed because `home busy` reached the unsupported-home path and no capability, help, matrix, or specification entry existed.

The final focused run passed 39 tests across `home-busy.test.ts`, `cli-worktree-lock.test.ts`, `capabilities.test.ts`, `cli-help.test.ts`, and `spec-publication.test.ts`. The valid live-run fixture uses a real held lock. It proves that a relative owned directory is busy and an unrelated directory is idle. Human and JSON results are exact. Quiet noun results match the legacy command byte-for-byte and exit-for-exit.

Bot lint, all 29 custom lint cases, type checking, documentation generation, specification checks, dependency pins, unused-code checks, cycle checks, and `git diff --check` passed during implementation and remediation. The source measurement reports 15,989 nonblank production lines after the change.

With Node 22.22.3 and the five lifecycle scripts normalized to mode 0755 in this worktree, the primary complete offline check passed. It ran 19 project tests, 210 runtime test files with 1,437 tests, and 143 of 143 conformance cases. Coverage reported 97.06 percent of production lines across 105 production modules. The source ratchet passed at 15,989 of 15,989 nonblank lines.

No live-provider test ran.

## Size decision

- Starting production size: 15910 nonblank lines
- Ending production size: 15989 nonblank lines
- Net increase: 79 nonblank lines
- Simpler approach tried: call the existing `isBusy` predicate directly and keep the noun handler limited to its closed parser and three result modes.
- Why insufficient alternatives were rejected: routing through the legacy handler could only return a quiet exit and could not produce the human or JSON result. Extending that handler would change the legacy parser and result boundary. Reusing `home show` parsing would mix an explicit-home identity command with an ambient-home liveness command and add conditionals to both behaviors.
- Production code deleted: none. The legacy handler cannot leave until its callers deploy both replacements and close every ledger row.
- Reason: one small noun handler owns validation and rendering while both command spellings share the established liveness predicate. Compiled descriptors continue to drive dispatch, capabilities, and help.
- Accepted cost: 79 production lines and one public noun command. The implementation carries no new liveness, filesystem, process, or network rule.

## Source

This manual ticket came from draft 0218. The draft is consumed by this record. Draft 0207 is next.
