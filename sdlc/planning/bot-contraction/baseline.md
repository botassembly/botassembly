# Baseline

## Source

The manual worktree started from `4df50b37949f400fa4d9fbddd0ca78b43cf5c200`. Local `main` and `origin/main` matched that commit. The source checkout was clean.

Tag `attempt/0196-20260903-2` and its registered worktree both resolved to `4d0a7bcd494ae00c92195189f4a2e769ec1f2307` before work began.

## Complete check

`cd bot && make install && make check` passed on the unchanged worktree. The test run passed 163 files and 986 tests. The conformance runner passed 142 of 142 cases. Lint, the catch budget, type checking, unused-code inspection, cycle inspection, the source ratchet, and exact dependency pins passed. The test command printed warnings from disposable empty Git repositories and Node's experimental SQLite API. `npm ci` reported one high-severity advisory; the existing pinned-dependency check still passed.

The baseline advisory was `fast-uri` 3.1.5 through direct dependency `ajv` 8.20.0. Four advisories concerned URI host normalization and SSRF. Manual ticket 0002 moved the lockfile to fixed release 3.1.7. A clean install and audit reported zero vulnerabilities.

## Confirmed gaps

`removeOwnedTree` can retry the same recursive removal without proving progress after it restores one blocked directory. A read-only parent with a nested directory can therefore repeat forever.

`runProcess` settles on the child `close` event to retain output written by ordinary descendants. A descendant that starts a new session and retains a pipe can keep `close` from arriving after Bot has terminated the owned process group.

The current subflow lock-compromise path calls the shared run signal's `cancel()` operation. The signal object does not retain a reason for internal cancellation, so the parent can report a child machinery fault as an outside signal.

The current CLI exposes the old flat reading commands. Supported callers in the current platform still invoke those spellings. The CLI design records the exact map before implementation.

## Legacy caller inventory

The current Factory invokes `run`, `resume`, `runs --json`, `show --json`, and `run --help`. Its lifecycle copy also invokes `busy` and `show --check`. The canonical SDLC invokes `busy` and `show --check`. The current Deck invokes `runs --json`, `status --json`, `prune --json`, `find --json`, `show`, `request`, `output`, `session`, and `capture`. Source locations were verified in Factory's `src/dispatch.ts`, `src/loop/readiness.ts`, and `src/loop/doctor.ts`; SDLC's `project/before`, `project/failure`, and `project/success`; and Deck's `src/dashboard.ts`, `src/status.ts`, `src/search.ts`, `src/run.ts`, and `scripts/smoke`.

Factory and Deck parse exact legacy JSON roots. Factory expects top-level `runs`. Deck checks exact roots for run lists, find results, and status. The temporary CLI layer must therefore route old invocations to retained legacy renderers. A direct argument rewrite into the new JSON envelope would break those callers.
