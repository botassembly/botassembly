---
flow: build
priority: 1
deps: [0289]
---
# Export three run readings through the package door

## Outcome

An outside consumer imports `run.list`, `run.show`, and `run.record` from a declared export path and gets the same bytes the command writes. `bot/tests/library-contract.test.ts` compares all three live against the command on one fixture home. `inspectRuns` and `inspectShow` stop being public. `PENDING_EXPORT` drops from fifteen entries to twelve.

## Current facts

Observed at `5907e29`, `bot/src` 18878 nonblank lines.

- `bot/package.json:7-12` declares four export paths. `bot/src/public-inspection.ts:2` re-exports `inspectRuns` and `inspectStatus`; `inspectShow` is public through `./one-run` (`bot/src/one-run.ts:274`).
- `bot/tests/library-contract.test.ts:33-36` lists fifteen read-only operations with no counterpart. `:50-52` holds the counterpart map with one entry, `run.session`. `:97-101` pins the three sizes to 25.
- Three read-only operations build the whole reading outside the command handler, including every fault:
  - `run.list`: `inspectRunList(home: string, query: RunListQuery)` (`bot/src/run-list.ts:326`) returns `Promise<CommandResult>` and never rejects (`:326-331`). `bot/src/run-list-command.ts:28-38` only parses with `parseRunList` (`bot/src/run-list-query.ts:189`) and writes the buffers.
  - `run.show`: `readRunShow(home: string, prefix: string, scratchRoot: string, dependencies?: RunShowDependencies)` (`bot/src/run-show.ts:323`) returns `Promise<RunShowReading>`, which is `{ json: Buffer; human: Buffer }` (`:220`). The handler picks one buffer and maps a rejection through `runShowFailure` (`:330`) and `newCommandFailure` (`bot/src/run-show-command.ts:22-29`).
  - `run.record`: `inspectRawShow(home: string, prefix: string, child: string | undefined, stdout: () => Writable, stderr: (bytes: string | Uint8Array) => void)` (`bot/src/raw-record.ts:48-50`) returns `Promise<number>` and holds every fault itself. `bot/src/run-record-command.ts:54-57` passes the boundary's two sinks and `undefined` for the child.
- `scratchRoot(env: NodeJS.ProcessEnv)` (`bot/src/invocation.ts:64`) is on no export path, and `bot/src/run-show-command.ts:23` is where the command supplies it.
- The other twelve read-only operations cannot be re-exported as they stand:
  - `run.output` and `run.request` keep the fault-to-bytes rule in the module-private `copySelected` (`bot/src/run-output-command.ts:56-70`), so `selectOutput` and `copyVerifiedOutput` alone reproduce only the happy path.
  - `run.check` (`bot/src/run-check-command.ts:223`), `run.checklist` (`bot/src/run-checklist-command.ts:170`), `run.events` (`bot/src/run-events-command.ts:122`), and `home.busy` (`bot/src/home-busy-command.ts:52`) build their result in a module-private function.
  - `assembly.check` (`bot/src/assembly-check-command.ts:164`) and `assembly.list` (`bot/src/assembly-list-command.ts:173`) build the document and write it to the boundary in the same function.
  - `auth.list` (`bot/src/auth-list-command.ts:143`) and `model.list` (`bot/src/model-list-command.ts:263`) take their Pi runtime from the boundary, and `model.list` may reach the network.
  - `home.show` and `capabilities` are closest: `renderHomeResult` (`bot/src/home-command.ts:40`) and `capabilitiesResult` (`bot/src/capabilities.ts:67`) are exported and return a `CommandResult` rather than writing. What stays in the handler is the input resolution: `readInstallation` with its `requireFeasible` hook (`bot/src/home-command.ts:57-70`) and runtime identity resolution (`bot/src/capabilities.ts:84-97`).
- `inspectShow` has no caller (`bot/src/one-run.ts:274`). Its two helpers `showChild` (`:262`) and `childUnavailable` (`:222`) have no other caller. `inspectRuns` keeps two internal test callers (`bot/tests/run-consumption.test.ts:7`, `bot/tests/run-consumption-observation.test.ts:29`), so it stays internal.
- `bot/tests/importable-readers.test.ts:53` calls `inspection.inspectRuns` through the door.
- `specification/elements/inspection.md:211` calls `inspectRuns({ usage: true })` public.

## Scope

1. Add `bot/src/public-run-readings.ts` and declare it in `bot/package.json:7-12` as `./run-readings`, the way `public-inspection.ts` serves `./inspection`.
2. Re-export `inspectRunList`, `parseRunList`, `runListFailure`, and the types `RunListQuery`, `RunListResult`, and `CliFailure` from that file unchanged. Write no second copy of the document.
3. Add `runShowReading(home: string, run: string, json: boolean, env: NodeJS.ProcessEnv): Promise<CommandResult>` to that file. It derives the scratch root by calling `scratchRoot(env)` itself, so `scratchRoot` stays off the door, and it reproduces `bot/src/run-show-command.ts:22-29` exactly: the chosen buffer on success, `newCommandFailure("run.show", runShowFailure(reason), json)` on a rejection.
4. Add `runRecordReading(home: string, run: string): Promise<CommandResult>` to that file. It calls `inspectRawShow(home, run, undefined, sink, collect)` with an in-memory `Writable` and a collecting stderr callback, and returns the collected buffers with the returned exit. It holds no selection, no verification, and no fault rule of its own.
5. Delete `inspectShow`, `showChild`, and `childUnavailable` from `bot/src/one-run.ts`. Drop `inspectRuns` from `bot/src/public-inspection.ts:2` and keep it exported from `bot/src/inspection.ts` for its two test callers.
6. Move `run.list`, `run.show`, and `run.record` out of `PENDING_EXPORT` (`bot/tests/library-contract.test.ts:33-36`) and into `COUNTERPARTS` (`:50-52`), each with a live comparison. `:97-101` keeps the arithmetic at 25.
7. Update `bot/tests/importable-readers.test.ts:53` to read through `./run-readings`, and assert the door no longer carries `inspectRuns` or `inspectShow`.
8. Correct the word "public" at `specification/elements/inspection.md:211` and add one `specification/CHANGELOG.md` entry naming the new export path and the two retired readers.
9. Raise `sdlc/ratchet.json:4` to the measured total in the same commit, with the justification and the search-for-slack sentence the ratchet requires.

Exclude the twelve operations above. Exclude `types` and the compatibility statement, which ticket 4 carries. Exclude requirement L4, the structured refusal comparison, which stays deferred: it falls out for `run.list` alone, because `inspectRunList` (`bot/src/run-list.ts:326-331`) already returns a refusal as the same result rather than throwing, and no refusal comparison is added to the contract test here.

## Acceptance

Start red, one mutated copy per operation, because `operationFault` returns on the first offender (`bot/tests/library-contract.test.ts:60-66`). For each of the three names, remove that one name from `PENDING_EXPORT` with no counterpart added and require the failure naming exactly that operation, the way `:82-87` already does for `run.list`.

Then compare live on the fixture at `bot/tests/library-contract.test.ts:111`, byte for byte, each comparison also asserting the fixture's own run name appears in the compared bytes:

- `bot run list --json --home HOME` against `inspectRunList(home, parseRunList(["--json"]).query)`, comparing `stdout`.
- `bot run show RUN --json --home HOME` against `runShowReading(home, RUN, true, { ...process.env })`, comparing `stdout`.
- `bot run record RUN --raw --home HOME` against `runRecordReading(home, RUN)`, comparing `stdout`.

Then run `sh sdlc/scripts/test` and `make check` at the root.

## Dependencies

Ticket 0289, landed at `e6923ec`.

## Risk facts

`runRecordReading` holds the whole record snapshot in memory, where the command streams it to stdout. A consumer reading a large record pays that memory; the bound is the file, and no new limit is invented here. `runShowReading` duplicates the handler's four-line fault mapping, so a later change to `bot/src/run-show-command.ts` that skips the exported function would diverge silently; the live comparison is the only thing that catches it. The environment argument makes the scratch root a consumer input, so a consumer passing a different `env` gets different scratch paths in the document than the command would.

## Size decision

- Starting production size: 18878 nonblank lines
- Ending production size: 18882 nonblank lines
- Simpler approach tried: exporting all fifteen read-only operations in one ticket, then exporting five by adding `run.output` and `run.request`.
- Why insufficient alternatives were rejected: twelve of the fifteen need handler surgery first. Ten build the document or the runtime input inside the handler, and two of those, `auth.list` and `model.list`, also need a Pi runtime handed to the importer, which is an export shape this ticket should not decide in passing. `run.output` and `run.request` look ready because `selectOutput`, `selectRequest`, and `copyVerifiedOutput` are already exported, but the rule that turns a mismatch or a fault into the command's bytes lives in the module-private `copySelected` (`bot/src/run-output-command.ts:56-70`), so a wrapper would match the command only on success. The three here need no handler surgery: the whole reading, faults included, already exists as a function the handler only prints.
- Production code added: one file of about 35 nonblank lines and one export path.
- Production code deleted: `inspectShow`, `showChild`, and `childUnavailable` in `bot/src/one-run.ts`, about 25 nonblank lines, and one name from the `./inspection` door.
- Accepted cost: twelve read-only operations stay in `PENDING_EXPORT` and sibling tickets carry them. The new path declares no `types` until ticket 4.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: the ticket opens a new public export path and decides the argument list and return shape of two wrappers a consumer then depends on, which is a compatibility decision. The readings walk a run directory and read durable record files, so the work is ordered asynchronous reading. Proof is exact-byte comparison across three operations and two output modes. A wrong shape ships to importers and costs a version to correct.
- Selected model: `claude-opus-5` medium implements; `claude-opus-5` medium reviews

## Review

- Origin: proposed ticket 2 in the 2026-09-14 admin surface and library requirements note.
- Design review: rejected once for two operations whose fault path lives in the handler, an unexported scratch root argument, an unreachable red demonstration, and unspecified function signatures. Accepted after revision.
