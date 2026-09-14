---
flow: build
priority: 1
deps: []
---
# Stop the credential advisory line from breaking successful commands

## Outcome

After the change, `bot auth list`, `bot auth login`, and `bot auth logout` still print the credential advisory line to stderr once per process when the retired store exists. `bot run start`, `bot run resume`, and `bot model list` print nothing about the retired store, on success or otherwise.

## Current facts

Observed at `a82cbbf`, reproduced with a fresh empty `BOT_HOME`, no credentials in the environment, and a retired `credentials.json` present at `XDG_CONFIG_HOME/bot/credentials.json`.

- `bot/src/cli.ts:150` writes "The retired Bot credential store is inactive; this command uses Pi's auth.json.\n" to stderr. The write happens inside `admittedMain`'s `beforeCredentialAccess` wrapper (`bot/src/cli.ts:145-154`), guarded only by whether `base.retiredCredentialPath` exists on disk (`lstatSync` at line 149) and a `warned` flag that limits it to once per process.
- That wrapper runs only when a command calls `boundary.beforeCredentialAccess()`. Run commands do it at `bot/src/run-command.ts:94` and `:100`, model listing at `bot/src/model-list-command.ts:267`, and the three auth commands at `bot/src/auth-login-command.ts:188`, `bot/src/auth-list-command.ts:144`, and `bot/src/auth-logout-command.ts:93`.
- `bot model list` and `bot auth list` both reproduce the bug: run against a fresh `BOT_HOME` with the retired file present and no env credentials, each exits `0` and prints the advisory line to stderr with no other stderr content.
  ```
  $ bot model list
  exit=0
  stderr: The retired Bot credential store is inactive; this command uses Pi's auth.json.
  stdout: Showing 0 of 0 models.

  $ bot auth list
  exit=0
  stderr: The retired Bot credential store is inactive; this command uses Pi's auth.json.
  stdout: amazon-bedrock  key  unobserved
          ...
  ```
- `bot assembly check` does not call `beforeCredentialAccess` and stayed silent about the retired store in the same reproduction, matching `specification/elements/auth.md:159-160` ("Help, capabilities, assembly commands, checks, and record inspection do not warn").
- `specification/elements/auth.md:156-160` currently names six commands that warn: `bot run start`, `bot run resume`, `bot model list`, `bot auth list`, `bot auth login`, `bot auth logout`. `sdlc/planning/notes/2026-09-14-review-docs-site.md` item 3 records that `guides/first-assembly.md:154` and `guides/install-and-use.md:137` promise "A successful run writes nothing to stderr" for `bot run start`, and that `bot run start` breaks that promise today because of this same line. No specification chapter makes the same silence promise for `bot auth list`, `bot auth login`, or `bot auth logout`; those commands exist to report or change credential state, so an advisory about the credential store fits what the caller asked for.
- `docs/src/content/docs/operate/providers-and-credentials.md:89` makes the same live promise from the published docs site, in the current wording: "the first command in each process that needs authentication writes one line to standard error." That sentence, and the example block that follows it, need the same three-command correction; the earlier draft of this ticket cited `guides/first-assembly.md` and `guides/install-and-use.md`, paths that do not exist under `docs/src` and are covered by `docs/.gitignore:2` where they do exist as build output, so that citation is dropped.
- `sdlc/issues/2026-09-14-a-credential-advisory-line-writes-to-stderr-on-every-command.md` filed this as a code problem, not only a docs problem.
- Two existing tests are byte-exact and currently green against the six-command rule, and both contradict the outcome above until they are rewritten:
  - `bot/tests/cli-model-list-contract.test.ts:317` asserts `bot model list` writes exactly "The retired Bot credential store is inactive; this command uses Pi's auth.json.\n" to stderr and that the warning event precedes runtime construction.
  - `bot/tests/auth-transition.test.ts:65` and `:82` assert all six surfaces, including `run start`, `run resume`, and `model list`, emit the warning exactly once each.
  - `bot/tests/auth-transition.test.ts:125` pins a whitespace-normalized copy of the exact sentence at `specification/elements/auth.md:156-160`. That pin changes wherever the sentence changes; the test's expected string moves to the new three-command sentence in the same edit that changes the specification.

## Scope

- In `bot/src/run-command.ts`, delete the two calls to `boundary.beforeCredentialAccess()` at lines `94` and `100`. In `bot/src/model-list-command.ts`, delete the call at line `267`. This is the one mechanism for the change: after the deletion, `bot/src/cli.ts`'s `beforeCredentialAccess` wrapper (`cli.ts:141-155`) is reachable only from the three auth commands, which keep their existing calls unchanged. No argv-based guard is added inside `cli.ts`; nothing there needs to inspect the command name, so the wrapper's body at lines `145-154` stays exactly as written today, just uncalled for run and model-list commands.
  - The ordering hook those three deleted call sites exercised (`beforeCredentialAccess` firing before the runtime is constructed) still exists for `bot auth list`, `bot auth login`, and `bot auth logout`, which keep their calls. `bot run start`, `bot run resume`, and `bot model list` no longer call `beforeCredentialAccess` at all, so there is no ordering left to prove for them; the rewritten tests for those three commands assert on the absence of the advisory and drop any assertion about a "warning" event or its order.
- Rewrite `bot/tests/cli-model-list-contract.test.ts:317` so it asserts `bot model list` writes nothing about the retired store to stderr and drops the "warning" event expectation, since `model-list-command.ts` no longer calls `beforeCredentialAccess`.
- Rewrite `bot/tests/auth-transition.test.ts:65` and `:82` so the surfaces list splits: `run start`, `run resume`, and `model list` assert zero occurrences of the warning; `auth list`, `auth login`, and `auth logout` keep asserting exactly one.
- Update the whitespace-normalized pin at `bot/tests/auth-transition.test.ts:125` to the new sentence in the same edit that changes `specification/elements/auth.md:156-160`.
- Update `specification/elements/auth.md:156-160` to name three commands instead of six and to state that `bot run start`, `bot run resume`, and `bot model list` never warn about the retired store.
- Update `docs/src/content/docs/operate/providers-and-credentials.md:89` and its following example block to the same three-command rule, replacing "the first command in each process that needs authentication writes one line to standard error."
- Add one `specification/CHANGELOG.md` entry recording the narrowed set of commands that warn.

## Acceptance

Start with failing tests. Write a test that runs `bot run start`, `bot run resume`, and `bot model list` against a fresh `BOT_HOME` with a retired `credentials.json` present and no env credentials, and requires stderr to equal exactly the empty string on each, byte for byte; `bot/tests/auth-transition.test.ts:72` already builds a donor run for `run resume`, so extending coverage to it is one line in the existing surfaces list. Write a test that runs `bot auth list` under the same setup and requires stderr to equal exactly "The retired Bot credential store is inactive; this command uses Pi's auth.json.\n", byte for byte. Then run the credential and cli test files, then `make check` at the root.

## Dependencies

None.

## Risk facts

`bot auth login` and `bot auth logout` keep their existing byte-exact coverage in `auth-transition.test.ts` and are not otherwise touched by this ticket; a reviewer should still eyeball their manual behavior since both need a terminal. A caller depending on the advisory line appearing during `bot run start`, `bot run resume`, or `bot model list` loses that signal; the specification records the advisory as informational only, so no caller should be treating it as a status source.

## Size decision

- Starting production size: 18882 nonblank lines
- Ending production size: 18879 nonblank lines
- Simpler approach tried: Drop the advisory only once per home until a credential exists, keeping it on all six commands.
- Why insufficient alternatives were rejected: keeping it on `bot run start` and `bot model list` still breaks the first successful run after the retired file appears, which is the exact case the issue reports. Printing it only from commands that resolve a model was also considered and rejected because that set is `bot run start`, `bot run resume`, and `bot model list`, the same three commands the silence promise covers; keeping the advisory there fails to fix anything. Moving it to `bot auth list` and `bot capabilities` was rejected because `bot capabilities` never touches credentials; the specification already states it does not warn, so adding the line there would print before any credential access and invent a touchpoint the command does not have. Retiring the whole check so it has nothing left to warn about was rejected as bigger than the fix needs; the warning still serves someone reading `bot auth list` after an old install. An argv-based guard inside `cli.ts`, checked alongside deleting the three call sites, was also tried and rejected as a second mechanism doing the same job as the deletion; the deletion alone makes the wrapper unreachable for the three commands, so no guard is needed.
- Production code added: None.
- Production code deleted: Three calls to `boundary.beforeCredentialAccess()`, one line each, in `run-command.ts` and `model-list-command.ts`.
- Accepted cost: the advisory no longer appears during a run or a model listing, so an operator with a stale retired credential file learns about it only when they run an auth command.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 5
- Minimum level floor: none
- Final level: 2
- Reasons: The change narrows an existing, explicitly documented public command list from six commands to three, touching one dispatch module, two rewritten byte-exact tests, one specification chapter, and one docs page. No concurrency, persistence, or security risk. Proof requires exact-byte stderr comparisons across several named commands and a whitespace-normalized specification pin, which is exact-byte proof.
- Selected model: `claude-sonnet-5` high implements; `claude-opus-5` medium reviews

## Review

- Origin: the issue filed 2026-09-14 by Ian.
- Design review: rejected once for two unnamed byte-exact pins, a stale docs citation, a missed live docs promise, a double mechanism, and wrong size arithmetic. Accepted after revision.
