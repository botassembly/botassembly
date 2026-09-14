---
flow: build
priority: 2
deps: [0294]
---
# Export the ten remaining read-only readings

## Outcome

Ten read-only operations become importable functions returning the command's exact stdout, stderr, and exit code. `PENDING_EXPORT` shrinks to `auth.list` and `model.list`, and L4 stops being deferred for the ten.

## Current facts

Observed at `f9b6e57`. Ten pending handlers sit in `piFreeHandlers` (`new-command-dispatch.ts:73`) and take only `cwd`, `env`, `stdout`, `stderr`, and for three `rawStdout(): Writable`.

| Operation | Handler, and the private rule a wrapper must not copy | Class |
| --- | --- | --- |
| `capabilities` | `capabilities.ts:84`, identity fault `:93` | b |
| `home.show` | `home-command.ts:57`, `failed` `:30` | b |
| `home.busy` | `home-busy-command.ts:59`, `render` and `parse` | b |
| `assembly.check` | `assembly-check-command.ts:190`, `successfulCheck` | b |
| `assembly.list` | `assembly-list-command.ts:194`, `emitRows` | b |
| `run.check` | `run-check-command.ts:237`, `execute` | b |
| `run.checklist` | `run-checklist-command.ts:183`, `execute` | b |
| `run.events` | `run-events-command.ts:151`, `write` | b |
| `run.output` | `run-output-command.ts:72`, `copySelected` `:56` | b |
| `run.request` | `run-output-command.ts:87`, `copySelected` | b |
| `auth.list` | `auth-list-command.ts:158`, needs `authListRuntime` | c |
| `model.list` | `model-list-command.ts:286`, needs `modelRuntime`, network `:256-257` | c |

No operation is class (a): `capabilitiesResult` (`capabilities.ts:67`) and `renderHomeResult` are exported but cover the happy path only.

The ten are safe in an importer's process: `process.exit` lives in `process-output.ts:116-127` and the signal handlers in `signal.ts:113-115`, none of the ten imports either, none takes a lock, `capabilities.ts:9` declares stdout and stderr only, `home-command.ts:8` no `env`. One reach is real: `capabilities` calls `resolveRuntimeSourceIdentity` (`runtime-provenance.ts:76`), which spawns `git` via `execFile` (`:3`, `:13`) with ambient env and cwd, source root from `import.meta.url` (`:12`).

## Scope

Add `bot/src/command-reading.ts`, private, on no export path. It holds `commandReading(handler, args, cwd, env): Promise<CommandResult>`: a boundary whose `stdout` and `stderr` push copies into arrays and whose `rawStdout` returns a `Writable` pushing into the stdout array, awaited, returning `{ exit, stdout, stderr }`.

Add to `bot/src/public-run-readings.ts`, reached through the existing `bot/run-readings`. Each builds the command's own words and calls `commandReading`.

- `runCheckReading(home: string, run: string, check: string, options: { json?: boolean; raw?: boolean; file?: string; stage?: string; retry?: number; repeat?: number }, cwd: string, env: NodeJS.ProcessEnv)` matches `bot run check RUN CHECK [--json|--raw] [--file F] [--stage S --retry N] [--repeat N] --home HOME`.
- `runChecklistReading(home: string, run: string, options: { json?: boolean; stage?: string; retry?: number; repeat?: number }, cwd, env)` matches `bot run checklist RUN [--json] [--stage S --retry N] [--repeat N] --home HOME`.
- `runEventsReading(home: string, run: string, options: { json?: boolean; child?: string }, cwd, env)` matches `bot run events RUN [--json] [--child C] --home HOME`.
- `runOutputReading(home: string, run: string, stage: string | undefined, cwd, env)` matches `bot run output RUN [STAGE] --raw --home HOME`.
- `runRequestReading(home: string, run: string, cwd, env)` matches `bot run request RUN --raw --home HOME`.

Add `bot/src/public-admin-readings.ts`, declared as `"./admin-readings"` in `bot/package.json`:

- `capabilitiesReading(json: boolean)` matches `bot capabilities [--json]`.
- `homeShowReading(home: string, json: boolean, cwd: string)` matches `bot home show --home HOME [--json]`.
- `homeBusyReading(home: string, directory: string, options: { json?: boolean; quiet?: boolean }, cwd, env)` matches `bot home busy DIR --home HOME [--json|--quiet]`.
- `assemblyCheckReading(home: string, target: string, request: string | undefined, options: { json?: boolean; limit?: number; after?: string; in?: string; intelligence?: string; localContext?: "ignore" | "announce" | "use"; retries?: number; timeout?: number; slots?: Readonly<Record<string, string>> }, cwd, env)` matches `bot assembly check TARGET [REQUEST] --home HOME [options]`. It encodes the nine options at `cli-contract.ts:92-103`, each slot as `--NAME VALUE` (`:104`).
- `assemblyListReading(home: string, options: { json?: boolean; count?: boolean; fields?: readonly AssemblyListField[]; limit?: number; after?: string }, cwd, env)` matches `bot assembly list --home HOME [options]`.

`bot/tests/library-contract.test.ts`:

- Move the ten names into `COUNTERPARTS`, naming each function and path.
- Widen the red loop at `:88` to the new names; swap its stale-entry case's `run.output` for `auth.list`.
- `agree` compares stdout, stderr, and exit code, and takes the marker plus the stream to search it in: `capabilities`, `home.show`, `assembly.list` name no run, and a refusal leaves stdout empty.
- `commandBytes` becomes `commandResult`, catching `execFile`'s rejection for its `code`, `stdout`, `stderr`. An undefined `code`, left by a signal kill, fails the comparison rather than reading as exit 0.
- Fixture gains a sealed output event, a retained request, a `check` event with a capture file, a `mark` tool call, one installed assembly, one plain directory.
- `home.busy` is compared in JSON mode on an unlocked directory, asserting `"busy": false` both ways, since quiet mode writes no bytes. Quiet is a second case asserting exit 1 alone.

Add `bot/tests/command-reading.test.ts`: a stub handler writes to `stdout`, `stderr`, and `rawStdout()`, then returns 4. Assert the ordinary write precedes the raw write in the returned stdout, the error write is the returned stderr, and the exit is 4.

Replace `sdlc/planning/plan.md:45` with: "31. **Planned:** export `run.output` and `run.request` through the `run-readings` door ticket 0291 opened, by driving their handlers with a collecting boundary, so `copySelected` stays module-private and the exported reading returns the command's own bytes."

Add one `specification/CHANGELOG.md` paragraph under `## 2026-09-14` beginning "Ticket 0295", naming the new path, the ten operations, and the refusal bytes. Change no handler, and no command output.

## Acceptance

1. Per operation: delete its name from `PENDING_EXPORT` first, watch the first test fail naming it, then watch its wrapper and comparison pass.
2. `run.checklist` on an unmatched run: both sides write the same `run-missing` stderr and exit 1, marker searched in stderr.
3. Change that run name in the wrapper alone; the comparison fails.
4. `runOutputReading` matches `bot run output RUN --raw` on the sealed output and the mismatch refusal.
5. `home.busy` agrees in JSON mode, and on exit 1 in quiet mode.
6. `bot/tests/command-reading.test.ts`, `bot/tests/library-contract.test.ts`, `make check`.

## Dependencies

Ticket 0294 changes what `assembly check` and `assembly list` print; land it first. Note tickets 3 and 4 follow and cover the new path.

Required follow-up, not here: these readings hand back bytes, so a consumer parses JSON itself. The next library ticket adds a purely additive typed layer over the ten, parsing `stdout`, checking `kind` and `schemaVersion` against the descriptor, returning the document or the same refusal.

## Size decision

- Starting production size: 18899 nonblank lines
- Ending production size: 19061 nonblank lines
- Simpler approach tried: extract a reading out of each handler, as `runShowReading` does.
- Why insufficient alternatives were rejected: extracting a reading puts each handler's fault rule in a second place, the limitation record 0291 carries. The collecting boundary leaves every rule where it is and costs one helper module instead of ten extracted readers.
- Production code added: 162 nonblank lines, against an estimate of 125 to 135, mostly `assemblyCheckReading`'s option encoding. `bot/src/command-reading.ts` holds 43, `bot/src/public-admin-readings.ts` holds 67, and the five new wrappers in `bot/src/public-run-readings.ts` hold 52.
- Production code deleted: none.
- Accepted cost: a reading hands back bytes, so a consumer parses JSON itself, and `runOutputReading`, `runRequestReading`, and `runCheckReading --raw` hold the delivered bytes in memory where the command streams them.

## Complexity

- Contract 2, state and timing 1, reach 1, proof 2, cost of error 1. Total 7. Floor: none. Level 3.
- Reasons: a new export path, and a new decision that a reading carries exit code and stderr. Exact-byte proof across ten operations, three modes, success and refusal.
- Selected model: `claude-opus-5` medium implements; `claude-opus-5` medium reviews independently

## Review

- Origin: requirement L1 and proposed tickets 2 and 4 in the 2026-09-14 admin surface and library requirements note, and plan item 31.
- Design review: accepted with nine edits: a typed follow-up, the quiet busy case, the marker stream, the capabilities git reach, side-effect witnesses, size, a helper test, citations, the plan wording. Two implementer notes: the red loop sits at `bot/tests/library-contract.test.ts:89`, and `capabilitiesReading` calls the handler with two arguments so the default resolver at `bot/src/capabilities.ts:85` applies, because `commandReading(handler, args, cwd, env)` has no slot for a third.
