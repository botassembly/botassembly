---
flow: build
priority: 1
deps: [0289, 0291, 0295]
---
# Export every mutating command through the library door

## Outcome

An outside consumer imports all nine mutating operations from `bot/mutation-readings` and receives the command's exact stdout, stderr, and numeric exit code. Assembly and authentication mutations run in the importer's process. `run.start` and `run.resume` run in one direct child Bot process. Every command refusal remains the same bounded structured error in JSON mode. Runtime owners, locks, pruning, dispatch, and collection helpers stay private.

## Current facts

Observed at `7895765`; `bot/src` is 19,682 nonblank lines.

- `CLI_CONTRACTS` holds 27 descriptors (`bot/src/cli-contract.ts:480`). Nine set `mutates: true`: `assembly.install`, `assembly.link`, `assembly.remove`, `assembly.update`, `auth.import`, `auth.login`, `auth.logout`, `run.start`, and `run.resume` (`bot/src/cli-contract.ts:155-199,233-237,454-478`). Each names a schema-version-1 document; both run verbs use `bot.run.result`.
- `PENDING_MUTATION` names those nine and says the run verbs use a child while the other seven remain in process (`bot/tests/library-contract.test.ts:42-49`). `COUNTERPARTS` has sixteen read-only operations (`:59-76`). `auth.list` and `model.list` remain in `PENDING_EXPORT`; this ticket does not move them.
- `bot/package.json:7-14` declares six paths and no mutating path. The outside-package proof symlinks Bot into scratch `node_modules` (`bot/tests/importable-readers.test.ts:39-40`). Its line 63 still rejects a door that exposes “runtime or mutation,” even though the approved surface now includes mutation.
- The seven in-process handlers already own parsing, mutation, rendering, and refusal bytes. Assembly handlers take `cwd`, `env`, and the process clock (`assembly-create-command.ts:12-18,93-105`; `assembly-update-command.ts:11-20,115-120`; `assembly-remove-command.ts:12-18,85-92`). Authentication import resolves its source against `cwd` and its Pi destination through the boundary (`auth-import-command.ts:101-112,537-550`). Login and logout own provider lookup, Pi mutation, cancellation, and synchronization failures (`auth-login-command.ts:161-216`; `auth-logout-command.ts:70-120`).
- `processBoundary` constructs those Pi services lazily from one environment snapshot, but it also deletes `BOT_HOME` from the live process (`bot/src/cli.ts:60-106`). A library call must not mutate the importer's environment. `admittedMain` owns the retired-store advisory and dispatch (`:122-143`), so a second auth dispatch would miss command bytes.
- The run handler executes in its current process (`bot/src/run-mutation-command.ts:43-92`). A started run installs process signal handlers and owns descendant cleanup (`bot/src/run.ts:322-354`). Ian ruled that the importable run functions instead start this same command in a child process; in-process run execution is not promised (`sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md:153-157`). ADR 0005 keeps each run tree in one OS process and records the signal contract (`sdlc/planning/adr/0005-one-process-per-run.md:7-24`).
- `CommandResult<number>` is `{ exit, stdout, stderr }` with buffers (`bot/src/new-command-result.ts:6`). `commandReading` already preserves write order for Pi-free handlers (`bot/src/command-reading.ts:35-51`), but it has no authentication, interaction, signal, or child-process boundary.

## Public contract

Add `./mutation-readings` in `bot/package.json`, backed by `bot/src/public-mutation-readings.ts`. It exports these functions and no handler, runtime, or dependency-injection type. Every function returns `Promise<CommandResult<number>>` and treats `json: true` exactly as the command's `--json` flag.

```ts
assemblyInstallReading(home: string, source: string, options: { json?: boolean; name?: string }, cwd: string, env: NodeJS.ProcessEnv)
assemblyLinkReading(home: string, source: string, options: { json?: boolean; name?: string }, cwd: string, env: NodeJS.ProcessEnv)
assemblyRemoveReading(home: string, name: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv)
assemblyUpdateReading(home: string, name: string | undefined, json: boolean, cwd: string, env: NodeJS.ProcessEnv)
authImportReading(source: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv)
authLoginReading(provider: string, options: { json?: boolean; readLine?: (hidden: boolean) => Promise<string>; signal?: AbortSignal }, cwd: string, env: NodeJS.ProcessEnv)
authLogoutReading(provider: string, options: { json?: boolean; signal?: AbortSignal }, cwd: string, env: NodeJS.ProcessEnv)
runStartReading(home: string, target: string, request: string | undefined, options: RunStartReadingOptions, cwd: string, env: NodeJS.ProcessEnv)
runResumeReading(home: string, donor: string, options: RunResumeReadingOptions, cwd: string, env: NodeJS.ProcessEnv)
```

`RunStartReadingOptions` has optional `json`, `correlation`, `idFile`, `in`, `intelligence`, `localContext`, `retries`, `script`, `timeout`, `slots`, `stdin`, and `signal`. `localContext` is `"ignore" | "announce" | "use"`; `slots` is `Readonly<Record<string, string>>`; `stdin` is `Uint8Array`. `RunResumeReadingOptions` has optional `json`, `correlation`, `idFile`, `in`, `slots`, and `signal`. The function builds only the options each descriptor publishes at `bot/src/cli-contract.ts:439-477`. The start wrapper places its typed target and optional request after the command's `--` marker, so a request beginning with `-` stays literal. Resume accepts no marker and no stdin because it reuses the donor's request.

The caller supplies `cwd` and `env` explicitly, as the existing reading doors do. Each call copies `env` once. Relative homes, sources, task files, working directories, scripts, slots, and id files resolve against `cwd` through the existing handlers. The wrapper never changes the supplied object or `process.env`. Pi's documented request-time ambient environment reads remain as recorded in ADR 0030; this ticket adds no environment isolation claim (`sdlc/planning/adr/0030-pi-model-runtime-boundary.md:21-29`).

The seven in-process functions invoke the command's own dispatch once through a private collecting boundary. The boundary shares the CLI's lazy Pi constructors and retired-store advisory without calling `processBoundary` or deleting `BOT_HOME`. `authLoginReading` presents an interactive boundary only when `readLine` exists. Provider notices and prompts join returned stderr in order; `readLine(hidden)` supplies the answer and its value is never copied to either returned stream. Without that callback, login returns the command's `terminal-required` refusal. Login and logout pass `signal` to their current handlers and return their existing structured `cancelled` result when aborted. Assembly operations and auth import expose no abort option because their handlers have no cancellation contract.

The two run functions spawn `process.execPath` directly with the package's `cli.ts`, no shell, `cwd`, a copy of `env`, and three pipes. The child always receives explicit `--home`; stdin is closed after writing `options.stdin` or zero bytes. A positional `request` wins by the command's existing rule and does not cause stdin to be read. Because the pipe is not a terminal, the child emits no terminal progress. Structured stdout fits the existing 65,536-byte result contract and diagnostics retain their existing bounds. Human mode may return the accepted output and keeps the command's existing lack of a memory bound.

An abort after spawn sends one `SIGTERM` to the direct child. The run's installed handler records the signal, stops its owned process groups, releases its lock, and exits with its recorded signal result. The wrapper continues draining and resolves only after the direct child's exit, close, stdout EOF, and stderr EOF agree. It maps a direct signal termination to `128 + signal number`; a handled run normally closes with numeric exit 143. It applies no second runtime timeout and sends no process-group signal. A child that has not settled can keep the promise pending, just as the command can remain running. An already-aborted signal rejects with `AbortError` before mutation. Spawn failure, pipe failure, disagreeing child settlement, or failure to write stdin rejects because no trustworthy command result exists. Once the command produces a refusal or result, the wrapper never turns that result into a throw.

These boundary rejections are library transport failures, not command refusals. Every request, state, dependency, integrity, cancellation, and run failure that reaches the handler retains the command's output stream, error envelope, code, cause, retryability, details, and exit code. The public functions do not parse returned JSON. The typed layer remains the later planned outcome.

## Scope

1. Add the export path and the nine functions above. Reuse one private in-process invocation collector and one private child runner. Do not copy a handler's parser, mutation, renderer, refusal table, Pi credential logic, or run runtime.
2. Refactor the CLI's lazy Pi boundary construction only as needed so the CLI and in-process collector share it. Preserve CLI environment removal in the invoked CLI process. The imported path never mutates global environment.
3. Move all nine names from `PENDING_MUTATION` to `COUNTERPARTS`, naming their function and `bot/mutation-readings`. Keep `PENDING_EXPORT` unchanged.
4. Replace the broad assertion at `bot/tests/importable-readers.test.ts:63` with a scan of every declared public namespace for these private names: `lockRun`, `inspectPrune`, `runCommand`, `runOperation`, `resumeOperation`, `manage`, `dispatchNewCommand`, `commandReading`, `configuredModelRuntime`, and `createProcessGroups`. Keep the existing `inspectRuns` and `inspectShow` retirement checks.
5. Add a `specification/CHANGELOG.md` entry naming the path, nine operations, in-process versus child split, returned byte result, cancellation behavior, and the transport-rejection limit. Command descriptors, command output, schemas, and the normative command specification do not change.
6. Raise `sdlc/ratchet.json` only to the measured production total. Do not add types declarations or a compatibility promise; plan item 24 owns both. Do not add parsed document returns; the typed layer follows that ticket.

## Dependencies

Tickets 0289, 0291, and 0295 are landed and recorded. They supply the exhaustive operation map, the `run-readings` pattern, and the collecting boundary. No unlanded ticket or external service blocks this work. Tests use local repositories, scripted runs, and fake authentication boundaries; they use no paid service or real credential.

## Acceptance

Red first: remove each name from `PENDING_MUTATION` without adding its counterpart. The existing one-name mutated-copy loop must fail naming that exact operation. Add an outside-package import of `bot/mutation-readings`; it must fail before the export exists. Add one child-runner test before its implementation and require the missing start child call.

Then prove:

1. An outside consumer imports and calls all nine functions. Every successful or refused call returns only `{ exit, stdout, stderr }`; no command refusal rejects.
2. Install, link, remove, update, and auth import run against separate equivalent fixture homes for the import and command. Their result bytes, stderr, exit, and changed filesystem state agree. Cover JSON success and one structured refusal. Update uses local repositories and reaches no network.
3. Login and logout compare their deterministic JSON refusals with the command through the same environment. Focused boundary tests inject the existing fake provider and runtime to prove successful mutation, ordered interaction text, hidden prompt selection, answer secrecy, cancellation, and synchronization failure without network or real credentials.
4. A scripted `run.start` from the outside consumer returns `bot.run.result@1`; its run, request bytes, correlation, id file, record start/end, output, and exit agree. A second case supplies a leading-hyphen request through the wrapper. A scripted `run.resume` returns the same kind and names its donor and carried work. Direct CLI fixtures prove the same facts; run-owned names and timestamps are checked against each call's own record rather than normalized into a false byte-identity claim.
5. The child seam pins `process.execPath`, `cli.ts`, exact argument order, no shell, caller `cwd`, copied environment, piped stdin, zero-byte stdin closure, and separate byte-preserving stdout and stderr. A request argument prevents stdin consumption by the command. The imported function returns the child command's bytes without re-rendering them.
6. Child tests cover natural success, numeric nonzero exit, handled SIGTERM, termination by signal before a run starts, already-aborted input, spawn error, stdin error, each output-pipe error, exit/close disagreement, missing stream settlement, and listener cleanup. Test-owned children are removed. The direct child never becomes a detached group and the wrapper never signals a descendant group.
7. The in-process collector proves the supplied environment object and `process.env` are unchanged, relative paths use supplied `cwd`, Pi loads only for the three auth functions, login answers never enter returned bytes, and every private name above is absent from every package door.
8. Run the focused mutation, library-contract, importable-reader, lazy-runtime, signal, and child-boundary suites; `npm -C bot run typecheck`; `npm -C bot run lint`; `git diff --check`; the production-size check; `make check`; and the hosted Linux, macOS, and manually dispatched WSL platform legs.

## Failure and compatibility limits

This ticket adds functions to a new path in a private pre-1.0 package. It promises the existing command bytes and side effects, not in-process run execution, parsed objects, replay, idempotency, or a stable TypeScript declaration surface. `--id-file` remains the only early run-identity channel. A caller that aborts before spawn receives no run identity. A forced operating-system kill can still leave the existing crashed-run evidence and lock behavior. Same-account file replacement, Pi's ambient environment reads, provider network behavior, and trusted local configuration retain their recorded limits.

The implementer may revise the new path name, parameter grouping, and transport-rejection spelling before this ticket lands if design review finds a smaller complete surface. Ian can overturn the child-process split; doing so changes his 2026-09-14 ruling and reopens signal ownership. Plan item 24 may later add declarations and a compatibility promise without changing these bytes.

## Size decision

- Starting production size: 19,682 nonblank lines.
- Production ceiling: at most 19,902 nonblank lines. Set the ratchet to the lower measured total after searching the touched owners for deletions.
- Simpler approach tried: run all nine through a child, or run all nine handlers directly.
- Why rejected: nine child commands contradict Ian's seven-in-process ruling and make ordinary assembly and credential mutation depend on process transport. Two direct run calls share signal handlers, process lifetime, and model-runtime state with the importer, which Ian explicitly declined to promise. Separate public functions that copy private handler rules would drift from structured refusals.
- Accepted cost: one new export path, one shared in-process boundary, and one direct-child boundary. Run calls collect their bounded command streams in memory. The child abort promise has no new deadline.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 8
- Minimum level floor: level 3 for child-process signals, stream settlement, credential mutation, and partial failure.
- Final level: 3.
- Reasons: the ticket adds a public function family and fixes its arguments, environment, prompts, stream, cancellation, and transport behavior. Correctness spans durable home and credential changes plus a child that must preserve run cleanup. Exact command bytes, outside-package imports, failure injection, and three platforms prove it. A wrong wrapper is user-visible and can repeat a mutation, but existing handlers retain their overwrite, lock, owner, and credential protections.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. Independent `gpt-5.6-sol` agents with medium reasoning review the design and code.

Re-score if implementation needs a new public failure envelope, a process-group owner outside the run, or any relaxation of existing credential or filesystem protections.

## Review

- Origin: plan item 23, requirement L1 through L4, and proposed ticket 3 in `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`; the current handoff names this as the next ticket (`sdlc/planning/notes/2026-09-14-handoff-admin-surface.md:9-11`).
- Design review: pending.
- Code review: pending.
