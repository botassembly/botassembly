---
flow: build
priority: 1
deps: []
---
# Hold every operation to an importable counterpart

## Outcome

One test walks every operation in `CLI_CONTRACTS` and fails on any operation that has no importable counterpart returning the document the command prints in `--json` mode, or the bytes the command prints for a raw operation. An operation added without an export breaks the build. The operations that have no export yet sit in one checked in allowlist that later tickets shrink.

## Current facts

Observed at main, `bot/src` 18882 nonblank lines.

- `bot/src/cli-contract.ts:9` names 25 operations and `:445` holds the 25 descriptors. Sixteen carry `mutates: false` and nine carry `mutates: true`.
- Four operations declare `output: { kind: "raw" }`: `run.record` (`bot/src/cli-contract.ts:296`), `run.output` (`:352`), `run.request` (`:362`), and `run.session` (`:382`). The other 21 name a `kind` and a `schemaVersion`.
- `bot/package.json:8-11` declares four export paths: `./inspection`, `./one-run`, `./record-lines`, `./session`. No export carries an operation name.
- `bot/tests/importable-readers.test.ts:39-40` symlinks the package into a scratch `node_modules` and runs a consumer script under `node`. That is the import pattern an outside consumer uses. Line 60 asserts the door exposes no runtime and no mutation.
- Two exported readers answer a retired vocabulary. `inspectRuns` returns `{ schemaVersion: 1, runs }` (`bot/src/inspection.ts:198`) while `bot run list --json` returns `bot.run.list@1` with `data`, `page`, `summary`, and `warnings` (`bot/src/run-list-query.ts:6`). `inspectShow` has no caller in the package, and `bot run show` builds `bot.run.show@1` at `bot/src/run-show.ts:179`.
- Ian ruled on 2026-09-14 that the importable `run.start` and `run.resume` start the run in a child process. Every other operation runs in the importer's process.

## Scope

1. Add `bot/tests/library-contract.test.ts`. It iterates `CLI_CONTRACTS`, and for each operation outside the allowlist it imports the counterpart through a declared export path, calls it, runs the command with the same arguments against the same fixture home, and compares. A named operation compares the parsed `--json` document. A raw operation compares the exact stdout bytes.
2. Carry two checked in lists in that file. `PENDING_EXPORT` names the read-only operations that have no export yet. `PENDING_MUTATION` names `assembly.install`, `assembly.link`, `assembly.remove`, `assembly.update`, `auth.import`, `auth.login`, `auth.logout`, `run.start`, and `run.resume`, with one comment saying the next ticket admits them under ruling 1 and that the two run verbs spawn a child.
3. Carry a third checked in structure, a map from each operation to its importable counterpart. The export paths (`bot/package.json:8-11`) carry no operation names, so the map is the trigger for both directions. An operation absent from the map and from both lists fails. An operation named in the map and in an allowlist also fails, so a landed export forces its entry out. The exclusion shrinks and never goes silent.
4. Use the consumer pattern of `bot/tests/importable-readers.test.ts:39-40` unchanged. Build one fixture home holding one finished run, and drive the command through the same `node` child the consumer script runs in.
5. Compare `run.session` live, so the test lands with at least one real comparison and no allowlist covers every operation. `bot/src/run-session-command.ts:97` passes `reading.output` straight to stdout, and `:124` calls the same `inspectSession` (`bot/src/one-run.ts:413`) the consumer imports at `bot/tests/importable-readers.test.ts:46`. State the invocation pair exactly. `run.session` declares `modes: ["markdown", "raw"]` and no `json` (`bot/src/cli-contract.ts:383`), and `run-session-command.ts:124-125` passes a page request only when `--raw` is absent, while `inspectSession`'s page argument is optional (`bot/src/one-run.ts:414`). The command runs with `--raw`. The import runs with `raw = true` and `page = undefined`. The bytes must be identical. Change no file under `bot/src`.

Exclude every export addition, every change to `bot/package.json`, and the retirement of `inspectRuns` and `inspectShow`. Exclude requirement L4, the rule that a refusal reaches the importer as the command's structured error envelope. The export tickets carry it, and this test compares successful readings only. Leave `bot/tests/importable-readers.test.ts:60` as it stands, because the mutating door opens in a later ticket.

## Acceptance

Start red. Add a twenty sixth descriptor to a scratch copy of `CLI_CONTRACTS` and require a failure naming that operation. Delete one entry from `PENDING_EXPORT` and require a failure naming the missing counterpart. Add an entry for an operation that already has a counterpart and require a failure naming the stale entry.

Then run `sh sdlc/scripts/test` and `make check` at the root.

## Dependencies

None.

## Risk facts

The test spawns the command once per operation, so it costs more wall time than a unit test. A comparison that normalizes too much hides a real divergence. The allowlist starts long and proves little until the next tickets shrink it.

## Size decision

- Starting production size: 18882 nonblank lines
- Ending production size: 18882 nonblank lines
- Simpler approach tried: merging this ticket with the export work, so the read only half of the test goes green on landing.
- Why insufficient alternatives were rejected: that merge writes sixteen importable counterparts, changes four export paths, and retires two public readers in one commit. The test alone with an exact allowlist lands green on main today, adds no production line, and gives the export tickets the failing rung they close one operation at a time.
- Production code added: none.
- Production code deleted: none.
- Accepted cost: the allowlist names 24 operations on landing, so the contract is enforced against growth before it is enforced against the backlog. `inspectRuns` and `inspectShow` stay public until the ticket that replaces them.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 5
- Minimum level floor: none
- Final level: 2
- Reasons: the test states one public rule over 25 explicit cases, and the proof compares exact bytes for raw operations and a parsed document for the rest. A wrong allowlist entry leaves a contract unwitnessed, which the next ticket corrects cheaply.
- Selected model: `claude-sonnet-5` high implements, `claude-opus-5` medium reviews

## Review

- Origin: proposed ticket 1 in the 2026-09-14 admin surface and library requirements note.
- Design review: rejected once for an all-pending allowlist, an imprecise raw comparison, no trigger for the second allowlist direction, and an unstated refusal rule. Accepted after revision.
