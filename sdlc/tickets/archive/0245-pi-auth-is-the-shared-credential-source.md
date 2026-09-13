---
flow: build
priority: 1
deps: [0244]
---
# Pi auth is the shared credential source

## Outcome

Bot and Pi use Pi's supported local authentication store, refresh ownership, and safe provider identity facts.

## Current facts

Bot currently supplies a separate credential file. That file can diverge from the account and provider state visible to Pi. Pi's public ModelRuntime API supports normal authentication use and mutation.

This cutover deliberately precedes ticket 0260. Between the two tickets, credentials held only in `$XDG_CONFIG_HOME/bot/credentials.json` or `~/.config/bot/credentials.json` cannot authenticate Bot, and Bot cannot import them. Operators can use Pi's supported environment credentials, sign in again through `bot auth login`, wait for 0260, or roll back to a Bot version that still reads the preserved file.

## Scope

Use Pi's public authentication APIs after a POSIX ownership and mode check. Permit a missing agent directory or auth file so Pi can create it. Require an existing agent directory to be a real directory owned by the current user with mode `0700`. Require an existing auth file to be a regular non-symlink owned by the current user with mode `0600`. Fail before run, listing, or mutation when the store is unreadable or corrupt.

Keep supported environment credentials. Report safe provider identity only. Never print or return secret values.

Remove the retired Bot store as a live credential source. Pi owns every live write and refresh. Ticket 0245 may use `lstat` only to detect an entry at the retired path. It must never open that entry for content, lock it, change its ownership or mode, rename it, write it, truncate it, or delete it. Do not import credentials in this ticket. Ticket 0260 owns the migration exception. Do not use a private Pi import or deep package path.

After command-line validation and before the first Pi-store read, write, refresh, login, logout, or provider request, check the retired path. When any filesystem entry exists there, emit exactly one bounded secret-free warning to standard error for each top-level invocation of `bot run`, `bot run start`, `bot resume`, `bot run resume`, `bot models`, `bot auth`, `bot auth list`, `bot auth login`, or `bot auth logout`. Shared runtime construction and repeated authentication resolution must not repeat it. Help, capabilities, assembly commands, checks, and record inspection do not warn. The temporarily refused `bot auth import` emits only its refusal. The warning states that the retired store is inactive and does not direct the operator to a migration command that does not exist yet.

Make every legacy `bot auth import` invocation return a bounded secret-free refusal before opening its named source or either credential store. Keep the refusal until ticket 0260 replaces it with the current import contract. Remove the old success path from production, help, the specification, and user documentation so no command can report that it wrote credentials into the retired store.

## Transition decision

The options are to leave the old import successful, remove the spelling, or keep it as an explicit temporary refusal. A successful old import is unsafe because the next run no longer reads its destination. Removing the spelling gives an existing operator only a generic unknown-command answer. Use the explicit refusal. It names the deliberate gap without exposing a secret or promising an unavailable migration. The accepted cost is one release interval in which old-store-only operators must use an environment credential, sign in again, wait for 0260, or roll back. The preserved retired file keeps rollback possible.

## Acceptance

Tests cover missing and corrupt Pi stores, wrong ownership and modes, symlinks, environment auth, safe identity output, concurrent refresh, run, and resume. Focused owner tests prove that the existing login path writes Pi's store and the existing logout path removes only the selected Pi credential. Tickets 0256 and 0259 later move those commands and their output contracts. Tests also prove that the retired store no longer authenticates a request. Failure output contains no secret material.

A table-driven warning test covers every named warning surface, including `bot auth list`, every excluded surface, any filesystem-entry type at the retired path, the no-entry case, and repeated authentication resolution within one invocation. It proves one warning at the stated boundary and no duplicate. An import test gives the old spelling a valid secret-bearing source and proves the command refuses before reading either store, prints no secret, and changes neither store.

Rollback proof records the retired store's inode, bytes, ownership, and mode, exercises every 0245 surface, and then has the pre-0245 credential reader read that same file successfully. The facts must remain identical. No fixture copy may stand in for the file that 0245 observed. The specification, help, and user documentation name Pi's auth path, its ownership requirements, the warning surfaces and timing, the temporary import refusal, the deliberate gap before 0260, the preserved retired store, and retained environment behavior.

## Dependencies

0244 supplies the shared ModelRuntime construction path.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for credentials and shared durable state
- Final level: 4
- Reasons: The change moves credential ownership across every invocation and coordinates concurrent refresh. A mistake can expose or overwrite authentication state. The temporary import refusal and rollback proof protect the gap before ticket 0260 isolates the exceptional file migration.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation widens the credential migration or adds another store writer.

## Full ticket size decision

- Starting production size: 17142 nonblank lines
- Ending production size: 17200 nonblank lines
- Simpler approach tried: Reusing Bot's credential adapter would avoid the new preflight and warning boundary.
- Why insufficient alternatives were rejected: Reuse would keep the retired file live and would bypass Pi's supported store, locking, and refresh behavior.
- Production code added: 160 nonblank lines implement the Pi store boundary, validation, and transition surface.
- Production code deleted: 102 nonblank lines removed the import implementation and retired-store wiring.
- Accepted cost: 58 net nonblank production lines enforce Pi's authentication ownership, strict file trust, pre-store login validation, and the bounded transition warning.

## Size decision

This incremental block exists for the current mechanical checker, which compares only the immediately preceding committed ceiling. The full ticket decision above remains the durable product account.

- Starting production size: 17156 nonblank lines
- Ending production size: 17200 nonblank lines
- Simpler approach tried: Opening the shared authenticated runtime to validate a login would avoid a separate provider-only catalog.
- Why insufficient alternatives were rejected: The shared runtime opens Pi's auth store before it can refuse an unknown provider or nonterminal login.
- Production code added: 70 nonblank lines add the provider-only catalog and published refusal contract since 2770759.
- Production code deleted: 26 nonblank lines simplify validation and correct transition help since 2770759.
- Accepted cost: 44 net nonblank production lines add the provider-only public Pi catalog boundary and exact pre-store refusal ordering while preserving the single Pi import boundary.

## Review

- Design review: rejected 2026-09-11 because the transition gap, old import behavior, warning boundary, retired-store preservation, and rollback proof were underspecified
- Design remediation: accepted 2026-09-11 after the ticket named the exact warning surfaces, pre-store boundary, import refusal, rollback proof, and ticket 0260 migration exception
- Code review: accepted 2026-09-11 after exact registration-refresh waiting, real run and resume contention, typed lock evidence, the single Pi import boundary, and the lower source ceiling were proved
- Integration review: accepted 2026-09-11 after the website rebase preserved full contracts in their owning sources and exact links in the short reference pages
- Hosted repair review: accepted 2026-09-11 after three direct Pi authentication fixtures set their required `0600` mode explicitly
