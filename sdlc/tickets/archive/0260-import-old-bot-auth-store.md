---
flow: build
priority: 1
deps: [0245, 0254]
---
# Import the old Bot authentication store safely

## Outcome

`bot auth import SOURCE` copies one complete compatible retired Bot credential map into a missing or empty Pi authentication file. It never merges, overwrites, selects credentials, changes the source, or prints credential content.

## Current facts

Ticket 0245 made Pi's `auth.json` the only live credential store. The retired Bot file remains readable only for rollback and this migration. Pi 0.85.1 exposes no public whole-map import. ADR 0030 therefore permits one Bot-owned migration which must share Pi's destination lock identity. Pi's file backend locks the authentication pathname with `proper-lockfile`, `realpath: false`, `retries: 0`, a 30-second stale threshold, and an `onCompromised` check. It retries `ELOCKED` with bounded exponential jitter until that same 30-second deadline. The retired Bot writer locks its own pathname with `realpath: false` and at most 51 attempts separated by 20 milliseconds.

## Command contract

Add the current operation `auth.import`, command words `bot auth import`, with no alias. Its grammar is exactly:

`bot auth import SOURCE [--json|-j]`

`SOURCE` is one required positional value. Resolve a relative value against the injected process working directory; normalize `.` and `..`; leave an absolute value absolute. Do not expand `~`, environment variables, URLs, or file URLs. The fixed destination is `auth.json` under Pi's already resolved agent directory. The command accepts no `--home`, `--` terminator, or other option. A source beginning with `-` is therefore invalid. Either JSON spelling may appear once, in either position. Both spellings together or either spelling repeated is `option-repeated`; a missing source is `value-missing`; an extra positional value is `argument-extra`; every other flag is `option-unknown`. Request validation and result-size preflight happen before filesystem access.

The descriptor reports modes `markdown` and `json`, home behavior `never`, mutation `true`, and network `never`. It publishes a 4,096-byte source-argument limit, a 1,048,576-byte inclusive limit for each credential file, a 2,048-byte human/error limit, an 8,192-byte success-result limit, the 30-second destination-lock deadline, and the one-second retired-source lock budget. The complete capability document remains below 65,536 bytes.

Version-1 JSON success is one newline-terminated object:

`{"schemaVersion":1,"kind":"bot.auth.import","data":{"imported":true,"providerCount":N}}`

An empty source map produces the same result with `imported: false` and `providerCount: 0`, exits `1`, and leaves a missing or empty destination byte-for-byte unchanged. A nonempty import exits `0`. Human output says `Imported N provider credentials into Pi authentication.` or `No provider credentials were present to import.` A second import after a successful nonempty import refuses the nonempty destination even when source and destination represent identical credentials; it never reports idempotent success.

Failures use the common version-1 `error` object with exactly `code`, `operation`, `cause`, `message`, `retryable`, and `details`; `operation` is `auth.import`. This table is exhaustive:

| Cause | Code / exit / retryable | Exact message |
| --- | --- | --- |
| `value-missing` | `request-invalid` / `2` / false | `Credential import requires one source file.` |
| `value-oversized` | `request-invalid` / `2` / false | `The credential import source path exceeds 4096 bytes.` |
| `argument-extra` | `request-invalid` / `2` / false | `Credential import accepts one source file.` |
| `option-repeated` | `request-invalid` / `2` / false | `Credential import accepts one JSON mode flag.` |
| `option-unknown` | `request-invalid` / `2` / false | `Credential import does not accept that option.` |
| `source-missing` | `request-invalid` / `2` / false | `The credential import source does not exist.` |
| `source-is-destination` | `request-invalid` / `2` / false | `The credential import source and destination are the same file.` |
| `destination-not-empty` | `request-invalid` / `2` / false | `Pi authentication already contains credentials; nothing was imported.` |
| `source-invalid` | `integrity-failed` / `5` / false | `The credential import source is not a safe compatible credential file.` |
| `destination-invalid` | `integrity-failed` / `5` / false | `The Pi authentication destination is not safe and empty.` |
| `source-changed` | `dependency-failed` / `4` / true | `The credential import source changed during import.` |
| `destination-changed` | `dependency-failed` / `4` / true | `The Pi authentication destination changed during import.` |
| `temporary-changed` | `dependency-failed` / `4` / true | `The credential import temporary file changed during import.` |
| `import-busy` | `dependency-failed` / `4` / true | `Credential import could not acquire its file locks.` |
| `source-read-failed` | `dependency-failed` / `4` / true | `The credential import source could not be read safely.` |
| `destination-read-failed` | `dependency-failed` / `4` / true | `The Pi authentication destination could not be read safely.` |
| `import-write-failed` | `dependency-failed` / `4` / true | `Credential import could not publish Pi authentication.` |
| `import-cleanup-failed` | `dependency-failed` / `4` / true | `Credential import stopped before publication and could not remove its temporary file.` |

An initially missing source uses `source-missing`. An initially unsafe source or source parent uses `source-invalid`; an initially unsafe destination or Pi agent directory uses `destination-invalid`. After a metadata state has been accepted, any disappearance, replacement, new symlink or hard link, device/inode change, size change, permission/owner/group change, or parent-directory identity change uses `source-changed`, `destination-changed`, or `temporary-changed` according to the pathname. Initial lexical or device/inode equality between source and destination always uses `source-is-destination`. A destination first observed as a valid nonempty map under its lock uses `destination-not-empty`; one that becomes nonempty after its accepted empty snapshot uses `destination-changed`.

JSON `message` is exactly the table sentence. `details` contains `{"path":P}` for `source-missing`, `source-is-destination`, `source-invalid`, `source-changed`, and `source-read-failed`, using the resolved source path; for `destination-not-empty`, `destination-invalid`, `destination-changed`, and `destination-read-failed`, using the destination path; and for `temporary-changed` and `import-cleanup-failed`, using the temporary path. Every other cause uses `{}`. `P` is `plainly` applied to that path and then UTF-8 clipped to 512 bytes. Human stderr is exactly `inertText(details.path === undefined ? message : message + " Path: " + details.path + ".", 2047).text + "\n"`. This existing renderer escapes controls and markup and clips on a UTF-8 boundary. These rules make every byte deterministic. No output includes an operating-system message, parsed value, byte sample, provider id, credential field, or credential count.

The import-specific result or failure supersedes ticket 0245's retired-store warning on every path. The command emits neither that generic warning nor a duplicate import warning.

## Trust and schema

On POSIX, the source parent and Pi agent directory must each be real directories owned by the effective user with exact mode `0700`. The importer may create a missing Pi agent directory at mode `0700`, matching Pi; a later pre-commit failure may leave that empty directory. The source parent must already exist. The source and any existing destination must each be a real regular file owned by that user with exact mode `0600`, one hard link, and no symlink at the named leaf. Refuse import when these ownership facts cannot be checked; do not claim a weaker cross-platform import boundary. Keep ADR 0030's admitted same-account, ancestor-symlink, owner-controlled-group, and path-race limits. The source file's inode, bytes, owner, group, mode, and link count remain unchanged on every outcome.

A compatible source is JSON, after an optional UTF-8 BOM, whose effective top level is an object. Every effective provider value must match the retired reader and Pi credential union: `api_key` has an absent or string `key` and an absent or object-valued `env` whose values are strings; `oauth` has string `refresh` and `access` fields and a finite numeric `expires`. Preserve provider-specific extra JSON members. JSON's ordinary last-member rule defines duplicate object names, and `providerCount` counts effective top-level names after parsing.

Validation parses only to establish compatibility and count providers. The atomic replacement copies the original bounded source bytes exactly, including ordering, whitespace, optional BOM, duplicate members, and extra fields. It does not resolve command-backed keys, decode tokens, refresh OAuth, normalize credentials, or re-encode JSON.

## Locking and commit

Reject a lexically identical source and destination before locking. Inspect metadata without reading content, then acquire the destination pathname lock before reading either store. Use Pi's exact 0.85.1 async lock identity and options: the destination path, `realpath: false`, `retries: 0`, `stale: 30_000`, and `onCompromised`. Retry only `ELOCKED` until the 30-second deadline. The retry base is `min(10 * 2^retry, 1_000)` milliseconds; multiply it by `1 + Math.random()`, round it, and cap it at the remaining deadline. This pinned compatibility code is reviewed again with every Pi upgrade.

While holding the destination lock, compare source and destination device/inode identity. Refuse the same inode as `source-is-destination`, including hard-link aliases, before attempting the source lock. Then acquire the retired source pathname lock with `lockSync(source, { realpath: false })` and its existing 51-attempt, 20-millisecond protocol. Release in reverse order.

After both locks settle, open held descriptors without following leaf symlinks and revalidate both parent identities plus each file's device/inode, ownership, mode, link count, and bounded size. Validate the destination first: it must still be missing or a valid effective empty object. Validate the source next and read it through its held descriptor. Immediately before publication, compare the held descriptors and both named leaves with the accepted parent and file identities; a missing destination must still be missing and an empty destination must still be the same empty inode. Apply the finite changed-path causes above rather than reclassifying a race as an initial trust refusal.

Precompute the exact success bytes before mutation. Write the exact source bytes to one unpredictable, exclusive, mode-`0600` temporary file in the Pi agent directory, sync and revalidate its held descriptor, then close the temporary descriptor before publication. A temporary close failure is pre-commit `import-write-failed`; identity-safe cleanup follows, and `import-cleanup-failed` supersedes it only when cleanup also fails. Close any held empty-destination descriptor before publication; its close failure is pre-commit `destination-read-failed`. Revalidate the destination pathname once more, then rename the closed temporary over `auth.json`. That rename is the only commit point. Keep the source file and both parent-directory descriptors open through rename. Sync the Pi agent directory afterward, then close source and directory descriptors, release the source lock, and release the destination lock.

Before rename, every open, read, validation, write, file-sync, temporary close, destination close, or cleanup failure is pre-commit and uses the table. It leaves the destination missing or byte-for-byte empty and removes only the identity-matched temporary file. A failed cleanup may leave that owner-only temporary file for manual removal; a later import never adopts or deletes an unverified temporary. An empty-source or refusal path closes every descriptor before emitting its settled output; source close failure is `source-read-failed`, destination close failure is `destination-read-failed`, and parent-directory close failure uses the corresponding read-failed cause.

After rename, the import is committed. Directory-sync, source-descriptor close, either directory-descriptor close, reverse lock-release, or already-renamed temporary cleanup failure cannot turn the committed result into a retryable failure or a nonempty-destination refusal. Preserve the precomputed success output and exit `0`; a failed proper-lockfile release may leave its ordinary lock until the stale boundary. For a settled empty-source result or refusal, a later lock-release failure likewise preserves that non-mutating result. The source remains locked and untouched until its descriptor-close attempt and source-lock release complete. No post-commit path rolls back or rewrites Pi's file.

## Scope

Implement the command, descriptor, parser, bounded result/error adapter, one migration owner, help, specification, and user documentation. Reuse public Pi path resolution only where already exported. Do not deep-import Pi, expose another credential reader, wire the retired store back into a runtime, merge maps, overwrite a nonempty destination, import selected providers, delete the source, add automatic startup migration, or change login, logout, listing, OAuth refresh, or provider behavior.

## Acceptance

Deterministic tests prove:

- every grammar case, relative and absolute source resolution, the fixed resolved-agent destination, generated help, the descriptor, capability size, human/JSON bytes, exact fields, bounds, exits, and no generic warning;
- missing and valid empty destinations, empty source exit `1`, nonempty refusal, repeated import refusal, exact source-byte publication, effective provider count, BOM, extra fields, duplicate-name semantics, and each incompatible credential shape;
- source and destination directory/file ownership, type, mode, symlink, hard-link, size, JSON, and same-path/same-inode refusals, including root-compatible injected metadata proofs;
- a snapshot of the source inode, bytes, owner, group, mode, and link count before any import surface, unchanged after every success and failure;
- a captured destination-lock barrier before either content read, then a captured source-lock barrier; real public `ModelRuntime` login and expired-OAuth refresh contend with import on the same Pi lock identity, while a retired-store writer contends on the source identity;
- source replacement after preflight and after source-lock acquisition, destination creation/replacement after preflight and immediately before rename, permission/link/size changes at both revalidation barriers, and no wrong-inode read, overwrite, or cleanup;
- lock timeout and compromise, bounded read, exclusive temporary creation, write, file-sync, revalidation, rename, directory-sync, reverse release, and identity-safe cleanup failures at deterministic injected barriers;
- source, destination, temporary, and parent-directory descriptor-close failures prove the exact pre/post-rename classification: temporary and empty-destination closes prevent rename, empty/refusal source closes replace that outcome with the table failure, and every close after rename preserves exact success;
- every pre-commit failure leaves destination state unchanged and emits one finite secret-free failure; every post-commit sync/release/cleanup failure retains the exact success result; concurrent login or OAuth refresh observes the complete old or complete new map, never a partial map.

## Dependencies

0245 supplies Pi authentication ownership, strict destination preflight, warning timing, and the preserved retired reader. 0254 supplies the current authentication command family. ADR 0030 authorizes only this narrow whole-map exception. The accepted update/remove designs supply the identity-bound revalidation, one commit point, reverse release, and committed-result preservation rules.

## Accepted costs

Bot duplicates the two pinned lock protocols for one migration because Pi exports neither its file backend nor a whole-map import. Different imports serialize on Pi's destination path, and an old writer may delay import for one second. A Pi writer may delay it for 30 seconds. Strict trust checks make import unavailable where POSIX identity cannot be established and reject otherwise safe hard-linked files. Exact-byte copying preserves compatible extra and duplicate JSON members. A missing destination setup may leave an empty owner-only agent directory after failure. A pre-commit cleanup failure can leave one owner-only temporary credential copy for manual removal. A post-commit sync, descriptor-close, or release failure returns success because retrying would falsely report that the now-nonempty destination was never imported. Ian can overturn these choices before implementation; a Pi upgrade or public import API requires redesign rather than silent reuse.

## Size decision

- Starting production size: 17200 nonblank lines
- Ending production size: 19660 nonblank lines
- Simpler approach tried: The command batch reused shared descriptors, result renderers, Pi runtimes, locks, and dispatch. Independent reviews removed duplicate boundaries and narrowed each command to its accepted contract. No further deletion preserves both current commands and held legacy callers.
- Why insufficient alternatives were rejected: Deferral blocks accepted required commands. Immediate legacy deletion risks callers before ticket 0247 proves their migration and contradicts ticket 0217's explicit hold.
- Production code deleted: 0 nonblank lines. The accepted batch adds current routes while the legacy surface remains held for measured deletion.
- Accepted cost: The exact ceiling rises by 2460 nonblank lines with no slack. Ticket 0247 migrates retained callers. Ticket 0217 later deletes the legacy surface and must lower the ceiling by the measured deletion.

### Ticket-local implementation account

- Ticket-local starting count: 18769 nonblank lines at the accepted integration boundary.
- Ticket-local ending count: 19290 nonblank lines.
- Ticket-local production change: net +521 nonblank lines. The migration owner contains 495 lines; typed dispatch, descriptor, boundary hooks, and help add 26.
- Ticket-local duplication and bloat search: The implementation checked the retired credential reader and lock retry in `credentials.ts`, Pi authentication preflight in `model-runtime.ts`, mutation settlement in the assembly commands, and the shared structured failure and inert-text renderers. It reused the shared clock, error-code, mapping, plain-text, and command inventory owners. Existing preflight and storage helpers cannot establish two held path identities, preserve exact source bytes, classify both pre- and post-rename failures, or expose Pi's exact asynchronous destination lock without weakening their current contracts.
- Ticket-local accepted cost: One table-driven migration owner keeps secret-file trust, schema validation, dual locking, race revalidation, atomic publication, cleanup, and settled output in one place.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for credential migration and shared durable state
- Final level: 4
- Reasons: The command copies a complete secret store across owners under two cross-process locks. A wrong result can overwrite, disclose, or strand credentials.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if Pi adds a public whole-map credential import.

## Review

- Design review: accepted 2026-09-11 after two rejections made command grammar, paths, results, lock compatibility, identity revalidation, commit settlement, trust bounds, schema handling, repeat behavior, race failures, human error bytes, descriptor closes, and deterministic proofs exact
- Code review: accepted 2026-09-11 after an initial rejection found that parse failures ignored requested output mode, late destination-lock compromise did not supersede every pre-publication settlement, source locking lacked a real retired-writer proof, and result feasibility and exact bytes were established too late
- Remediation: red-green changes select parse output from the request, check asynchronous compromise before every pre-publication settlement, prove the exact source identity lock against the real retired store writer, and prepare bounded result bytes before filesystem access and publication
