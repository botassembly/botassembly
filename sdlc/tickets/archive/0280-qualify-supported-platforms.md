---
flow: build
priority: 2
deps: []
---
# Qualify supported platforms

## Outcome

Bot permanently checks its supported command-line behavior on Linux and macOS. The check covers scratch installation, local Git clone cleanup, run and subflow cleanup, signals, locking, shipped examples, piped standard input, and an early-closing standard-output reader. Native Windows refuses before command work begins and tells the operator to run Bot inside WSL.

## Current facts

- The complete hosted gate runs only on `ubuntu-latest`. The repository calls Linux supported, macOS unverified, and Windows unsupported even though the specification already describes Linux, macOS, and WSL command-line behavior.
- `make installcheck` installs from a scratch checkout whose path contains a space, runs the installed launcher, and uninstalls it. The complete gate and hosted workflow do not run it.
- The full offline suite already owns Linux proofs for real child-process cleanup, root run locks, manually held nested child locks, signals, piped input, ordinary and raw output, and example resolution. The subflow-local-signal and flow-cleanup tests inject their lock and process-group owners, so they prove runtime ordering and scratch cleanup rather than an operating-system child-lock lifecycle. No permanent job selects and runs the real operating-system boundaries on macOS.
- Two old intermittent observations reported `ENOTEMPTY` while cleaning a rejected local Git clone and a signalled subflow test. Neither observation established a product defect or a safe repair. The accepted plan requires repeated Linux and macOS proof before code changes.
- The CLI has no platform admission boundary. Native Windows can enter code that depends on Unix ownership, file modes, executable files, process groups, and signals before it fails with whatever lower-level error happens first. WSL reports itself to Node as Linux and can use the Linux path.
- Two early-reader-close tests start Bash with `pipefail`. Bash is not part of Bot's supported runtime contract and is unnecessary for observing the Bot child's own exit and streams.
- The reported `pi | head` failure belongs to Pi's command-line program. Bot consumes Pi as a library. This repository can prove and repair Bot's own pipe behavior without editing Pi or claiming control over Pi's CLI.

## Scope

The named Vitest platform set runs each file in a fresh process. This bounds cumulative test memory use on hosted macOS without changing its owners or repeating the main set.

- Add one permanent root command, `make platformcheck`, backed by a POSIX `sh` script under `sdlc/scripts/`. It accepts only `uname -s` values `Linux` and `Darwin`, names any other system plainly, and performs no installation into the operator's home. Add the command to root Make help and the development guide.
- Make `platformcheck` run exactly three owners: the existing scratch-only `make installcheck`, the existing isolated `sdlc/scripts/examples`, and a named Vitest platform set. Keep `make check` unchanged as the complete Linux gate. Do not make the platform command call `make check`, the secret scanner, the documentation build, the live smoke ladder, or any provider.
- Run these test files once in the named platform set: `cli-assembly-install-atomic.test.ts`, `cli-assembly-install-process.test.ts`, `install-refuses-a-non-assembly.test.ts`, `owned-removal.test.ts`, `flow-cleanup.test.ts`, `process.test.ts`, `cli-signal-boundary.test.ts`, `subflow-local-signal.test.ts`, `cli-worktree-lock.test.ts`, `run-birth-reservation.test.ts`, `request-limit.test.ts`, `process-stdin.test.ts`, `cli-exit.test.ts`, `ordinary-cli-output.test.ts`, `ordinary-output.test.ts`, and `raw-record-races.test.ts`. `process.test.ts` owns the real Unix child and process-group cleanup proof. `cli-signal-boundary.test.ts` owns real root-lock release after a signal. `cli-worktree-lock.test.ts` exercises real `proper-lockfile` locks for root and nested child records, but it does not prove that a running subflow releases its own lock. The tests use repository fixtures, local `file://` Git repositories, and scratch directories only.
- After that single pass, use a plain POSIX shell loop to run `install-refuses-a-non-assembly.test.ts` and `subflow-local-signal.test.ts` ten times in fresh Vitest processes. Add no stress framework, configuration layer, or new timing harness. The first file repeats the original local-clone cleanup shape. The second repeats the original test-scratch `ENOTEMPTY` shape; its injected lock owner does not become real operating-system lock evidence. Keep each test file's existing cleanup active after every case. A recurrence must name the failing operation and retained path. Diagnose and repair a reproduced Bot or test-harness defect inside this ticket. Do not add blind cleanup retries, sleeps, skips, platform exceptions, or a product timeout when the repetitions pass.
- Replace the Bash and `pipefail` early-close harnesses in `cli-exit.test.ts` and `raw-record-races.test.ts` with direct Node child-process pipes. Close the reader end deliberately, observe Bot's exit separately, and retain the exact quiet-`EPIPE`, stdout, stderr, bounded-settlement, and raw fixed-extent assertions. Do not rewrite the settled production output paths unless a red macOS or Linux proof demonstrates a defect.
- Expand `.github/workflows/runtime.yml` with a separate `platform` job. Its strategy is exactly `fail-fast: false` with `os: [ubuntu-latest, macos-latest]`, and `runs-on` is the selected matrix value. The existing Ubuntu `check` job remains byte-for-byte equivalent in purpose and continues to own full history, Gitleaks installation, the ancestry guard, and `make check`.
- Give each platform matrix leg the pinned checkout action with credentials disabled, the pinned setup-node action at Node `22.22.0` with the `bot/package-lock.json` npm cache, `make -C bot install`, the existing non-root assertion, and `make platformcheck`, in that order. Checkout does not need full history. The job does not run `sdlc/scripts/install` because the platform slice does not use Gitleaks. After checkout and exact npm dependency installation, the platform command stays offline.
- Keep the documentation workflow's one local reusable-workflow dependency. GitHub treats the called runtime workflow as successful only when both its complete-check job and every platform matrix leg succeed. Do not duplicate either job in the documentation workflow or add bypass conditions.
- Add one small platform admission function and make the CLI boundary's platform value injectable. Admit only `linux` and `darwin`. WSL follows the admitted Linux path. For `win32`, every invocation, including help and commands that normally need no home, exits `2`, writes no stdout, and writes exactly `Bot does not support native Windows. Install WSL and run Bot inside its Linux shell.\n` to stderr. Other platform values return the same unsupported exit with a generic Linux-or-macOS sentence.
- Apply the platform decision immediately after the ordinary process boundary exists and before Bot selects or accesses an operation home, renders help, reads standard input, loads a model, installs run signals, creates a lock, executes Git, or dispatches a command. Process-boundary construction may snapshot the environment, create the output adapter, and compute the retired credential path through the operating system's home-directory lookup. Those steps do not select or access the Bot operation home. Tests inject `win32`, `linux`, `darwin`, and one other platform without changing global process state. They observe that no supplied boundary operation runs after `main` begins on a refusal; they do not claim that the caller never constructed that supplied boundary. Keep normal process output settlement for the real invoked CLI.
- Update the root README, first-assembly guide, install-and-use guide, development guide, specification runtime and conformance text, help where platform requirements appear, and the specification changelog. State that native Linux and macOS are checked, Windows runs through WSL, and the final release candidate still needs an actual clean-clone WSL qualification. State the Unix requirements that explain native Windows refusal: POSIX shell launchers, executable bits, owner and mode checks, Unix signals, and process groups.
- Do not edit, wrap, invoke, or test Pi's CLI. Do not add sandboxing, executable allowlists, a Windows compatibility layer, PowerShell installers, native Windows process emulation, provider calls, generic shell certification, or a claim of formal POSIX compliance. Do not broaden the platform slice into a second full gate.

## Acceptance

Start with failing workflow, platform-admission, and platform-command tests. The workflow contract pins exactly two independent jobs. The complete job retains its current Ubuntu runner and every existing full-gate protection. The platform job has exactly the two accepted runner labels, exact Node version and lockfile cache, no write permission, no full-history fetch, no Gitleaks preparation, no provider secret, no `make check`, no `make smoke`, and no error suppression. Hostile workflow mutations fail when they remove either operating system, add Windows, change a pinned action or Node version, run only one leg, serialize the platform job behind the complete job, weaken permissions, continue after error, replace exact dependency installation, or substitute a partial ad hoc command for `make platformcheck`.

The local platform-command contract proves that Linux and Darwin select the same ordered work, an unsupported `uname` refuses before any test or installation command, and a failed owner stops the command. The real command does not read or change the ordinary Bot home or Pi files. It leaves `~/.local/bin` and the checkout unchanged except for normal ignored test output. `make installcheck` still proves install, launcher use, PATH advice, uninstall, and full cleanup from the space-bearing scratch path. The isolated example owner resolves every shipped example without a model call.

The named Vitest set passes on both hosted systems. The local Git refusal fixture repeats ten times per system and leaves the home unchanged, the Bot scratch directory empty, and no clone or install staging name behind after every iteration. The subflow signal fixture repeats ten times per system. Each fresh Vitest process exits without `ENOTEMPTY`, retained harness scratch, or an incomplete asserted record. A discovered defect receives a focused red test before repair.

The repeated subflow fixture asserts only the filesystem cleanup and deterministic state that its injected owners can establish. It does not claim real child-lock release or process-group cleanup. `process.test.ts` proves real child creation, group isolation, termination, evidence removal, and no surviving owned process on both systems. The real signal boundary proves root run-lock release. The worktree-lock test proves that readers honor an actually held nested child lock. No existing test supports a stronger claim about a running child's lock lifecycle, so this ticket makes none.

Direct process tests pipe delayed hostile bytes into Bot's standard-input reader and observe exact bytes through clean end-of-file with no early settlement. An overflow proof keeps the existing bounded refusal behavior. Ordinary help, a structured completed run, a failed run, a signalled run, and raw record output each settle when the reader closes early. Bot produces no stack or pipe diagnostic. Successful commands keep exit `0`; failed and signalled commands keep their existing nonzero or signal status. The raw path keeps its fixed-extent and bounded-memory behavior. No test shells out to Bash or `head` to establish these facts.

`request-limit.test.ts` proves exact-limit input and maximum-plus-one refusal. Its standard-input case crosses the limit and settles before end-of-file while retaining no more than the maximum plus one byte and removing its listeners. These portable input proofs run on both systems.

The `/dev/full` cases retain Linux evidence for non-`EPIPE` delivery failure and may skip when that device is absent. Portable injected-writer tests and direct early-reader-close tests run on both Linux and macOS. The macOS leg does not claim a `/dev/full` result it cannot observe.

Injected `win32` refuses before every Bot operation boundary named in scope and produces the exact exit and bytes above for empty argv, `--help`, `capabilities`, and `run start`. The test supplies an already constructed boundary and makes no claim about work its caller performed to construct it. Injected `linux` and `darwin` continue into ordinary help and command dispatch. An injected unsupported non-Windows platform gets the generic refusal. Documentation never calls native Windows supported and never presents WSL as already clean-clone qualified.

Run the workflow, install, examples, platform-admission, pipe, cleanup, signal, and lock tests continuously. Run `make platformcheck` locally, then the complete local gate. Independent code review must inspect job aggregation, exact dependency and network behavior, scratch isolation, stress cleanup, signal and process-group portability, early-refusal order, pipe exit precedence, test skips, and support claims. The implementation commit must pass the ordinary hosted complete job and both platform matrix legs. Its documentation workflow must wait for the same reusable workflow result.

## Dependencies

Ticket 0275 established the documentation workflow's same-commit dependency on the reusable runtime workflow. Ticket 0276 owns Bot's request bounds and output settlement. Ticket 0277 owns the Unix file-ownership and permission checks that native Windows cannot satisfy honestly. This ticket qualifies those existing contracts on Linux and macOS and adds only the missing platform refusal and permanent proof.

Actual clean-clone WSL qualification remains part of the final release-candidate ticket. A WSL failure creates a focused implementation ticket and blocks release. A hosted Linux pass does not replace that qualification.

## Risk facts

Runner labels can move to newer hosted images. The permanent matrix proves the current hosted Linux and macOS environments on every change. It does not prove every distribution, macOS version, processor, shell, filesystem, container, or WSL installation.

Repeated success cannot explain the two old `ENOTEMPTY` observations. It establishes a continuing regression alarm and avoids inventing a repair without a cause. Ten repeats increase hosted work for two focused files. The rest of the complete suite still runs once on Ubuntu.

The native Windows refusal intentionally prevents even read-only commands and help from running there. The message remains available from the attempted CLI invocation and points to WSL. This early refusal is safer and clearer than allowing commands until a Unix-only operation fails. Ian can overturn the all-command refusal before implementation if native help without runtime support matters more than one platform boundary.

The `pi | head` defect can remain in Pi. This ticket makes no promise about a separate command-line program and changes no Pi source. Bot's own early-reader-close paths remain the only owned behavior.

## Size decision

- Starting production size: 18469 nonblank lines
- Ending production size: 18483 nonblank lines
- Production code added: One small platform admission function and its first call at CLI entry.
- Production code deleted: None. The direct-pipe replacements remove Bash only from tests.
- Simpler approach tried: Change documentation to call macOS supported and rely on the existing Linux suite.
- Why insufficient alternatives were rejected: A claim without a macOS runner would drift, installation would remain outside hosted proof, old cleanup observations would have no permanent alarm, and native Windows would still fail late and inconsistently.
- Accepted cost: One focused two-system hosted matrix duplicates a narrow subset of the Linux suite and repeats two cleanup owners ten times.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: 3, because signal, process-group, locking, and cleanup claims require real operating-system and child-process proof.
- Final level: 3
- Reasons: Production behavior changes only at unsupported-platform admission. Reliable acceptance crosses two hosted operating systems, installation, Git cleanup, signals, locks, subprocess streams, workflow aggregation, and public claims.
- Selected model: `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: Ian accepted Linux and macOS as native targets, Windows through WSL, Pi as reference-only, and operating-system containment. The completion-plan reassessment combined platform qualification with the two retained cleanup observations and the already selected pipe behavior.
- Design review: accepted after one rejection. The correction separates injected subflow ordering tests from real operating-system process and lock witnesses, adds request-limit coverage, bounds the early-refusal claim after process-boundary construction, preserves Linux-only `/dev/full` evidence, and uses portable writer and early-close proofs on both systems.
- Code review: accepted after one rejection. The first review found a stale production-size gate, an incomplete platform-command contract, unmanaged children in two early-close tests, and no portable ordinary-output failure proof on macOS. The repair aligned the 18,483-line ratchet, pinned all 23 platform invocations and four failure phases, reused the guarded child helper, and added the portable ordinary-output suite. Independent review then accepted after 44 runtime tests, 12 workflow and platform-contract tests, the ratchet, and diff checks passed. Hosted macOS then exposed portable test-harness defects. Job `103827195444` showed that macOS canonicalizes its temporary path through `/private/var`; the install check now compares the complete physical checkout path and retains its space-path and cleanup proof. Run `34796038214`, job `103829210017`, showed macOS reports `EPERM` where Linux reports `EISDIR` for the same forbidden directory unlink and exhausted a 2 GiB worker heap while 16 heavy files ran concurrently. The exact assertion now admits only those two operating-system codes. Run `34796788190` still exhausted the 2 GiB heap. Fresh per-file processes in run `34797599362` isolated the failure to `cli-exit.test.ts`, where Vitest formatted an exact comparison of two 8 MiB buffers; the proof now checks the exact length and every byte through three bounded scalar assertions. No product behavior changed in these repairs.
- Completion: implementation head `60f1838bf1ea05252d852386f38faa9d0d385376`; hosted runtime run `34798219558` passed its complete Ubuntu job and focused Linux and macOS jobs.
