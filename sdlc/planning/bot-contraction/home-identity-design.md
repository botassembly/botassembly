# Home installation identity design

## Outcome

Ticket 0055 gives one explicitly selected Bot home one stored installation identity. `bot home init --home DIR [-j|--json]` creates or returns it. `bot home show --home DIR [-j|--json]` reads it. Neither command uses `BOT_HOME` or the platform default.

Every new run requires a valid installation record. Its `run_start` event carries the stored identity. Structured start and resume results carry the value from the same event object after the initial record write succeeds. The current initial writer does not synchronize that write, and this ticket does not add an initial-record synchronization. Moving the home preserves the identity because the stored record is its only source. A copy preserves the identity only when it preserves the record bytes and the home and record ownership and modes.

## Stored record

The home root owns `installation.json`. Its complete bytes are one newline-terminated JSON object:

```json
{"schemaVersion":1,"kind":"bot.installation","data":{"id":"018f2f4a-52f8-4c81-9b35-6ad2acdb70d8"}}
```

The example shows the textual form only. New identities use `crypto.randomUUID()` and therefore use canonical lowercase UUID version 4 syntax. The reader accepts only canonical lowercase UUID version 4 values. It accepts exactly the three top-level fields in the example: `schemaVersion`, `kind`, and `data`, with `id` as the only data field. The file may occupy at most 1,024 bytes. It must end in exactly one newline and contain no bytes after the JSON value. Unknown fields, duplicate keys, invalid UTF-8, a byte-order mark, another version or kind, and a noncanonical identity are invalid.

The record stays at schema version 1 under ADR 0024. Adding `installation_id` to the current `run_start` event is additive. Existing shape-1 run records that omit it remain readable. The current writer always supplies it.

## Home and file trust

Both commands resolve the value supplied after `--home` against the caller's working directory before use. A missing, empty, repeated, or flag-valued option fails with exit 2 before filesystem work. The parser removes no value from `BOT_HOME` and never asks for the platform default.

Initialization may create a missing final home directory with mode `0700`. Its parent must already exist. Bot does not create a chain of parent directories for this command. Bot resolves the real parent once and opens that canonical path as a directory. Later operations use canonical parent and home pathnames. Before and after a read or mutation, Bot compares the held parent and home descriptors with the objects at those pathnames. It opens each final home or record object with `O_NOFOLLOW` and compares the descriptor with the preceding `lstat`. After Bot creates the final home entry, it opens and validates the new directory as `0700` and owned by the effective user.

Another initializer may create the missing home after Bot observes absence but before its `mkdir`. An `EEXIST` loser reopens the final path and applies the ordinary existing-home validation. It proceeds only when the winner created a real `0700` directory owned by the effective user. Any link, non-directory, wrong owner, broad mode, replacement, or unstable path fails without mutation. Two processes may therefore start with no home and converge through both the directory-creation race and the later record-publication race.

An existing home must be a real directory owned by the effective user with no group or other permission bits. A symbolic link, another file type, another owner, or broader permissions is an insecure state. Bot reports it and changes nothing.

Bot uses the repository's local same-Unix-account trust model. The operator, machine, and filesystem namespace are trusted. Bot detects replacement that its before-and-after checks observe. It does not defend against a same-account actor that replaces an intermediate ancestor during a remaining pathname-operation window. A caller that needs that guarantee needs a sandbox or a native transaction boundary. This ticket adds neither.

After initialization validates a home and finds no `installation.json`, it synchronizes the safely held parent directory and awaits success before it creates or publishes an installation record. This prerequisite applies when the invocation created the home, lost the directory-creation race, or found the home already present. A parent-sync failure returns an integrity failure and publishes no record from that attempt. A later initialization repeats the parent synchronization while the valid home still lacks a record. This rule makes retry after an earlier parent-sync failure confirm the home entry's durability before record publication. `home show` never synchronizes the parent and remains read-only.

An existing `installation.json` must be a regular non-symbolic-link file owned by the effective user with mode `0600`. The reader opens it without following a final symbolic link, fixes the extent from the held descriptor, reads within the 1,024-byte bound, validates the descriptor and pathname again, and then parses the exact bytes. A changed, replaced, linked, unreadable, oversized, malformed, or non-private file is invalid. `init` and `show` report that state through the common command failure. Neither command changes its bytes or permissions.

The effective-owner checks apply on POSIX platforms. A platform that cannot establish the owner and permission facts fails closed. This ticket does not add a weaker portability mode.

## Atomic initialization

Initialization validates the home and completes the absent-record parent synchronization before it creates any candidate record. It creates one unique private temporary file inside that home with exclusive create and mode `0600`. It writes the complete canonical record, synchronizes the file, closes it, and atomically links that completed file to `installation.json`. The link operation provides create-if-absent behavior without exposing partial destination bytes.

The initializer records whether the link published its candidate, reported an existing destination, or failed before publication. A resolved link means publication occurred. An `EEXIST` rejection means another initializer already published the destination. Any other link rejection means that link call did not publish the candidate. After every settled link attempt, Bot attempts to remove its temporary name and always attempts to synchronize the safely held home directory afterward. A cleanup failure cannot skip the directory-sync attempt. If cleanup, synchronization, or descriptor closing fails, initialization returns one integrity failure after all required finalization attempts settle. A known non-`EEXIST` link rejection keeps `published: false`. It remains a retryable dependency failure at exit 4 when finalization succeeds. If the link wins and finalization succeeds, Bot rereads `installation.json` through the ordinary strict reader and returns that identity. If the link reports `EEXIST` and finalization succeeds, Bot reads the winner through the same strict reader and returns the winner's identity. It never returns its discarded candidate. Concurrent initializers therefore converge on the exact stored value.

The interruption contract follows the publication boundary:

1. An interruption before the link leaves no destination from that attempt. Bot attempts to remove its exact temporary name and synchronize the home directory. The temporary name may remain when cleanup itself is interrupted or fails.
2. An interruption immediately after a successful link leaves the published destination authoritative.
3. An interruption before temporary-name removal also may leave the private temporary name. The published destination remains authoritative.
4. An interruption before directory synchronization leaves the published destination authoritative, although Bot has not confirmed its directory durability. The temporary name is absent when removal succeeded.
5. A cleanup, directory-sync, or held-directory close failure returns an integrity failure and never repairs or replaces a destination. The diagnostic says that publication may have completed only when the link succeeded. A known link rejection cannot acquire that warning from a later finalization failure. A later close failure cannot replace or erase a successful publication fact.

Later `home init` and `home show` preserve and validate any published winner. They ignore runtime-owned temporary names and never replace the winner because an earlier caller returned failure.

Temporary names use a fixed runtime-owned prefix plus random bytes. Readers ignore those names. Initialization attempts to remove only the exact temporary name that it created. This ticket adds no scan or stale-file cleanup.

## Command results

Human `home init` output is bounded Markdown. It names the resolved home, says `Initialized: yes`, and names the installation ID. Human `home show` uses the same fields. An absent state says `Initialized: no` and omits the identity.

JSON output uses one versioned finite-result envelope. Initialization returns kind `bot.home.init`. The reading returns kind `bot.home.show`.

```json
{"schemaVersion":1,"kind":"bot.home.show","data":{"home":"/absolute/home","initialized":true,"installationId":"018f2f4a-52f8-4c81-9b35-6ad2acdb70d8"}}
```

An absent reading omits `installationId` and sets `initialized` to false. `home init` always returns true on success. Both complete JSON and Markdown results occupy at most 4,096 UTF-8 bytes. JSON uses the established version-1 error envelope on standard error. Human errors use one inert line. Exit 0 covers initialized and absent valid readings. Malformed invocation exits 2. Existing-state conflict exits 3. Temporary dependency failure exits 4. Integrity or insecure-state failure exits 5.

Result feasibility is part of accepting an initialized home. The command parser resolves the supplied value lexically against the caller's working directory. That absolute string remains the published `home` field. The command computes the exact serialized UTF-8 bytes for initialized `home init` and `home show` results in Markdown and JSON with that same string. The check uses the same pure renderers as final output. It includes each operation kind, the complete reported path after JSON or Markdown handling, one canonical 36-byte UUID version 4 identity, every fixed field and delimiter, and the final newline. `-j` and `--json` share the same JSON candidate. UUID values have one fixed serialized size, so an uninitialized home may use the generated candidate identity or a fixed canonical placeholder before any mutation.

Initialization requires all four candidates to fit before it creates the final home, synchronizes a parent or home directory, creates a temporary candidate, or links `installation.json`. Any oversized candidate returns the existing `result-oversized` integrity failure and changes nothing. An existing record must pass the same four-candidate check before either command reports it as initialized. This rule prevents one mode from creating an identity that another mode cannot read. An absent `show` remains read-only and checks only its requested absent result. A move or copy preserves the stored identity bytes but becomes an unaccepted home when its new reported lexical path cannot support all four initialized results.

Storage canonicalizes the parent and home for safe filesystem operations. It must not substitute either canonical spelling into result feasibility or final rendering. A long lexical path may traverse stable symbolic-link ancestors and resolve to a short canonical home. The lexical string still controls result size because the public result returns that string. The command passes the lexical string unchanged to both the feasibility callback and renderer. This is the smallest compatible choice. Returning a canonical `data.home` value would change the published command result.

`show` establishes the canonical parent before it checks the final home entry. `ENOENT` or `ENOTDIR` while resolving a parent that has not been observed means the home is absent. A missing final home under an established parent means absence only after parent revalidation succeeds. A missing record in an established secure home means absence only after home and parent revalidation succeed. `ENOENT` after Bot observed the same final object means changed state. A failed revalidation is always an integrity error. Neither absent path creates a directory, file, lock, or temporary name.

## Capabilities and routing

Add `home.init` and `home.show` to the compiled operation inventory and handler map. Add optional `required?: true` to the version-1 capability option descriptor under ADR 0024's pre-release change-in-place policy. Optional options omit the property; `required: false` is invalid. Both home descriptors name `--home` as a required, nonrepeating path option with no ambient default and publish `required: true`. Both accept one nonrepeating JSON option with alias `-j`. They report a 4,096-byte document limit and the shared 2,048-byte human-error limit. Both report network `never`. `home.init` reports home `writes` and mutation true. `home.show` reports home `reads` and mutation false.

`bot capabilities` retains home `never`, mutation false, and network `never`. Its parser still rejects `--home`. Its result grows only because the compiled inventory gains the two executable operations.

New-command dispatch recognizes both paths before legacy dispatch. `home` without an action remains outside this ticket. Descriptor validation accepts only an omitted `required` property or the literal value true. Generated help takes command words, modes, options, required status, result kinds, and limits from the descriptors. Parser, generated help, and capability tests must agree that missing `--home` fails and that the descriptor marks it required. Explanatory prose states that moving the record or copying it with ownership and modes preserved retains identity and that Bot has no reset command.

## Run boundary

Read and validate the installation record once after invocation and assembly validation have resolved the home but before `birth` reserves a run name or creates the run directory. The failure is a pre-start result and leaves no run. Resume applies the same check after donor selection has established the home and before the new run begins. Existing run readers do not require the current home identity to equal a historical record.

Add `installationId` to the prepared root-run input. Build `run_start.installation_id` from it. Pass the same value through child-run input so every subflow `run_start` records the installation that owns its parent run. Do not read `installation.json` once per child.

`RunStartInput` owns the required current-writer value. Synthetic and historical fixtures may omit it only through the existing fixture boundary. The current event-shape oracle requires a canonical value when the field exists and requires it on writer-created root and child records.

`startedResult` projects `installationId` from the exact `RunStartEvent` object. `renderRunStart` includes it in `bot.run.result`. The projection happens only after the awaited initial write succeeds. The result claims successful writer acceptance. It makes no durable-storage claim. Start and resume never derive the value from a path, runtime version, checkout digest, provider adapter, donor record, or a second installation-file read.

## Source ownership

A new small home-installation module owns the stored shape, UUID validation, canonical-path revalidation, secure held read, and atomic initialization. It imports the existing owner-only mode constant and held-file safety primitives where their contracts match. It does not put installation parsing into `home-config.ts`; configuration and installation identity have separate failure and mutation rules. It owns no procfs or `/dev/fd` path construction. The held-ancestor module and its generic seams are deleted.

A home-command module owns both command parsers and pure finite renderers. It owns the resolved lexical absolute string used by the feasibility check and final result. The initialization preflight calls those renderers through a narrow injected feasibility function. It does not duplicate their size arithmetic or replace the reported string with a canonical path in the storage module. `cli-contract.ts`, `new-command-dispatch.ts`, and `help.ts` own capability metadata, routing, and generated help. `run.ts` owns the one pre-birth root read. `record-events.ts` owns the additive record field. `run-result.ts` owns projection from the successfully written start event.

The upstream run-request integration and the home-command additions leave `help.ts` at 402 nonblank lines. Its existing gate permits 400. The implementation must not weaken that gate or pack unrelated statements together. Move only the three-line `namedLimit` formatter into the existing `cli-help-format.ts` formatting owner and import it into `help.ts`. This split leaves `help.ts` at 399 nonblank lines and changes no generated or legacy help bytes.

The runtime and record specification chapters should name the initialization prerequisite and `installation_id`. The inspection chapter should name both home commands and the two result kinds. The changelog and conformance ledger should state that stored records, result envelopes, and the run-record shape remain at version 1.

## Red tests

1. `home show` against a missing final home, a path with a missing ancestor, and a secure home without `installation.json` returns `initialized: false`, exits 0, and leaves the complete parent tree byte-for-byte unchanged. The JSON aliases agree. A missing final home returns absence only after parent revalidation. A missing record returns absence only after parent and home revalidation. An `ENOENT` after a positive observation and every failed revalidation return an integrity failure rather than false absence.
2. `home init` creates a missing final directory at `0700`, synchronizes a safely held parent directory, and creates a complete `0600` record. The bytes match the closed version-1 shape. A deterministic seam makes the parent sync fail after `mkdir`; initialization returns an integrity failure, leaves one secure empty home, and publishes no record. A retry finds that home already present and records another parent-sync call. That call rejects. Initialization returns another integrity failure and still publishes no record. A later retry holds the parent sync pending. The command remains pending and creates no candidate or destination until the test resolves the sync. Initialization then succeeds. Later repeats return the same ID without changing record content, metadata, or modification time.
3. Two real processes synchronize before home creation and initialize the same absent path. Both exit 0 and return the one ID in `installation.json`. The `mkdir` loser reopens and validates the winner's `0700` owned directory. The later `EEXIST` link loser returns the published identity rather than its candidate. No visible partial record occurs during a concurrent show.
4. A move fixture and a copy fixture that preserves bytes, ownership, and modes retain the ID. Initialization and show on each destination return the retained value. Copy fixtures with broader modes or changed ownership fail as insecure. No path, runtime version, checkout, or digest change alters a valid retained identity.
5. Home links, broad home permissions, wrong ownership where the platform permits the fixture, file links, non-files, broad file permissions, unsupported versions, unknown or duplicate fields, invalid UTF-8, oversized bytes, noncanonical UUIDs, replacement, and in-place change all fail without byte or mode repair. Initialization never replaces these states.
6. Missing, repeated, empty, valueless, and ambient-only home selection fail before mutation. A populated `BOT_HOME` cannot satisfy either command. Capability discovery still succeeds with an inaccessible `BOT_HOME` and advertises the exact two new descriptors with `required: true` only on each `--home` option. Descriptor validation rejects `required: false`. Parser, generated help, and capability output agree about required options.
7. Real scripted root runs and resumed runs record `installation_id`. Their structured `installationId` matches the exact appended `run_start` value. A seam that changes the file after that append cannot change the result.
8. A subflow run records the same installation identity as its parent without another installation-file read. A missing or invalid record refuses start and resume before a run directory, id file, or child exists.
9. Historical shape-1 fixtures without `installation_id` remain readable. A current writer event without the field fails the writer-shape oracle. Record shape 1 and `bot.run.result` schema version 1 remain unchanged.
10. Existing correlation, runtime provenance, human run output, legacy command output, home resolution for unrelated commands, capability bounds, and descriptor agreement tests remain green.
11. Deterministic interruption seams stop before link, immediately after link, before temporary-name removal, and before home-directory sync. Before-link interruption publishes no destination. Every post-link interruption preserves the published winner. A cleanup failure still records a directory-sync attempt. Later init and show return the winner without replacement.
12. A non-`EEXIST` link rejection publishes no destination. Successful cleanup, home synchronization, and closing return retryable exit 4 without `publicationMayHaveCompleted`. A later cleanup, synchronization, or close failure returns exit 5 but still omits the publication warning. A successful link followed by interruption or finalization failure returns exit 5 with the warning.
13. A mechanical production-source check rejects `/proc/self/fd`, `/dev/fd`, the generic descriptor-entry seam, and any claim that a Linux descriptor namespace supplies portable child traversal. Observable parent, home, and final-file replacements retain focused behavioral tests. The test suite makes no claim that Bot defeats a same-account ancestor-replacement race.
14. The existing max-lines gate starts red because `help.ts` has 402 nonblank lines. Moving `namedLimit` to `cli-help-format.ts` makes that file 399 lines without changing any help snapshot. The gate remains at 400. The implementation also lowers `sdlc/ratchet.json` from the corrected 15591-line integrated baseline to its measured ending value at or below 15535.
15. A real CLI regression creates an already-valid owner-only home at a canonical path of exactly 4,025 UTF-8 bytes. Before remediation, `home init -j` publishes `installation.json` and then returns `result-oversized`. After remediation, `home init -j`, `--json`, and Markdown each return the bounded error before a temporary file, installation record, directory synchronization, or other mutation. JSON-escaping path characters prove that the check sizes serialized output rather than raw path bytes. A boundary fixture also proves that the longest admitted path produces all four initialized results at or below 4,096 bytes. Repeated init and both show modes then return the exact stored identity.
16. Invalid UTF-8 bytes and a leading byte-order mark each have their own direct stored-record test. Both commands reject each fixture without changing its bytes. A direct wrong-owner fixture runs where ownership changes are supported. Direct copied-home fixtures broaden the home mode and record mode separately and prove that both commands reject each insecure copy without repair.
17. Missing and malformed installation records each drive `bot run resume` through the real command. Each refusal occurs before a new run directory, id file, carried event, or provider contact. The existing start refusal remains separate.
18. The real-process concurrency test uses a test-only interprocess barrier at the existing create-home seam. Each child announces arrival before either may create the absent home. The parent releases both after both announcements. Both processes settle successfully with the exact ID stored in `installation.json`, and no temporary name remains. Same-process deterministic `mkdir` and link-loser tests remain focused unit coverage.
19. The identity fixture comment in `bot/tests/initialized-cli.ts` names ticket 0055. A repository search retains ticket 0032 only for its actual raw-output and older gating work. No identity comment or planning reference assigns this behavior to ticket 0032.
20. A real CLI regression supplies a stable lexical absolute home path of exactly 4,025 UTF-8 bytes through symbolic-link ancestors. Its canonical parent and home are short. Before remediation, `home init -j` preflights the short canonical spelling, publishes `installation.json`, and then rejects the long lexical JSON result as oversized. After remediation, all init modes size the exact lexical string that final rendering would publish and return `result-oversized` before record creation. The test observes zero temporary names, zero directory synchronization calls, unchanged home metadata and entries, and no other filesystem mutation. A short lexical alias to the same canonical home remains admissible and reports that short lexical alias in `data.home`.

## Cost and deferred work

The accepted cost is one small durable record and one secure initialization path. The path checks detect changes they observe. They do not close every same-account pathname race. A metadata-preserving copy of a home copies its identity. Bot therefore identifies an installation lineage rather than proving global uniqueness among filesystem copies.

This design adds no reset or rotation. It adds no repair command, machine registry, signing key, runtime digest, replay behavior, migration rewrite, or identity comparison on historical reads. A later contract can add one only after a caller proves the need.
