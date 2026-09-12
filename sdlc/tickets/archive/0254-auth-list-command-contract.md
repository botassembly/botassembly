---
flow: build
priority: 1
deps: [0245]
---
# Auth list uses the current command contract

## Outcome

`bot auth list` reports safe provider identity through the current dispatcher, help, capabilities, and a finite versioned result.

## Current facts

Authentication listing still routes through the legacy dispatcher. Ticket 0245 supplies the shared Pi authentication owner.

## Scope

Add one explicit `auth.list` descriptor for `bot auth list` with no aliases. Accept only `--json`/`-j`, `--offset N`, and `--limit N`. The offset is an integer from 0 through 2,147,483,647. The limit is 1 through 200 and defaults to 50. Reject repeated or unknown input before credential access. Keep bare `bot auth` as a separately dispatched legacy listing until tickets 0247 and 0217 migrate and retire it.

Read public Pi `CredentialInfo` metadata once. Never call `getProviderAuthStatus`, `getAuth`, or `checkAuth`; read a credential value; publish Pi's free-text `label`; or inspect an arbitrary credential property. Sort providers bytewise by provider ID before paging. Each row is `{provider, method, state, credentialType}`. `method` is `login` when OAuth exists, otherwise `key` when API-key login exists, otherwise `ambient-only`. `state` is `stored` when `listCredentials()` names the provider and `unobserved` otherwise. `unobserved` does not mean unavailable. `credentialType` is the stored metadata value `api_key` or `oauth`, otherwise `null`.

JSON is one newline-terminated `{schemaVersion: 1, kind: "bot.auth.list", data, page, summary}` document. `page` is `{offset, limit, nextOffset, complete}`; `nextOffset` is the next integer or `null`. `summary` is `{total, returned}`, where total precedes paging and returned counts this page. A valid empty provider catalog exits 0 with empty `data`, a complete page, and zero counts. Human output retains the provider, method, and state columns and ends with `Showing <returned> of <total> providers.`

Provider identities are at most 1,024 UTF-8 bytes, one encoded row is less than 4,096 bytes, one escaped human cell is at most 480 bytes, one human row is at most 4,096 bytes, and either complete output document is less than 1,048,576 bytes. Invalid runtime metadata returns one bounded structured integrity error and no partial rows. Request errors exit 2. Unsafe, corrupt, or invalid runtime state exits 5. Errors use the shared version-1 `error` document on standard error and the existing 2,048-byte human error bound.

The command never resolves ambient secrets, probes provider files, runs provider commands, mutates or refreshes credentials, or uses the network. Preserve ticket 0245's retired-store check and its exactly-once warning timing at the top-level `bot auth list` boundary: validate the whole request first, warn, then construct the credential-bearing runtime and make its first store read. Shared runtime work must not duplicate the warning. Help and invalid requests do not warn.

## Contract decisions

Use the same offset and page limits as model list. A credential catalog has no public revision for a durable cursor. The accepted cost is that separate invocations can shift when another process changes providers or credentials. Omit Pi's free-text label in exchange for a closed secret-safe vocabulary.

Choose the enforceable stored-or-unobserved projection. Pi 0.85.1 cannot safely distinguish any unstored state. `getProviderAuthStatus` can read environment values referenced by `models.json`; `checkAuth` can also read secret values, probe provider files, or run provider commands. Either call breaks the command's no-secret-read and no-probe guarantee. Waiting for a future Pi API would block delivery. The selected projection loses configured detail for every unstored provider and reports that limit honestly as `unobserved`. A future Pi API with an explicit no-secret-read and no-probe guarantee is the reversal lever.

## Acceptance

Tests cover the exact options and schema, empty and populated stores, both states and every method mapping, stored-state precedence, corrupt-store refusal, human and JSON output, bytewise sorting before paging, continuation without repetition in one unchanged snapshot, bounds and summaries, hostile credential values and hostile Pi labels, legacy separation, and the capability row. A fresh runtime with `OPENAI_API_KEY` remains `unobserved`. A `models.json` environment reference detects and forbids any provider-status call and proves that changing the environment value cannot change output. The table-driven ticket 0245 warning proof includes the current `bot auth list` route and proves one warning before its first Pi-store read when the retired path exists, none when it does not, and no duplicate during shared runtime work. No output contains a stored credential value or free-text auth label.

## Dependencies

0245 supplies Pi authentication ownership and strict preflight. Pi 0.85.1 supplies only provider ID and credential type as public safe stored metadata; this ticket owns the exact safe projection used by later auth commands.

## Size decision

- Starting production size: 18293 nonblank lines
- Ending production size: 18488 nonblank lines
- Simpler approach tried: Extend the legacy authentication listing and renderer in `auth.ts`.
- Why insufficient alternatives were rejected: Changing the shared legacy path would change bare `bot auth` before its maintained callers migrate. The current command also needs strict option parsing, finite paging, versioned output, closed status projection, and fail-closed runtime validation that the legacy output does not provide.
- Production code deleted: 12 lines. Shared auth preflight replaced duplicated validation and the current handler stopped reading credentials itself. The accepted compatibility window still requires the legacy bare command until tickets 0247 and 0217 remove it.
- Accepted cost: One 142-nonblank-line command owner keeps parsing, safe projection, validation, paging, and rendering local. The remaining 53 nonblank lines dispatch and publish the command and add the dedicated strict-preflight runtime result. This ticket leaves the shared integration ratchet unchanged; final integration owns the already acknowledged combined ceiling decision.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 8
- Minimum level floor: level 4 for credible credential exposure
- Final level: 4
- Reasons: The command defines a new paged safe-status vocabulary. Its public outputs need hostile proof against credential disclosure and corrupt shared state. A wrong field or diagnostic can disclose a credential.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if the command mutates or refreshes credentials.

## Review

- Design review: accepted 2026-09-11 after one rejection made the safe projection, public result, paging, warning order, and legacy boundary exact. A later ruling first chose passive cached status, then final re-review disproved its safety for `models.json` environment references. The enforceable design reports only `stored` or `unobserved`. Ian can overturn this choice when Pi exposes an API with an explicit no-secret-read and no-probe guarantee.
- Implementation: the focused owner passes 10 tests covering projection, exact output, paging, bounds, failures, warning order, legacy separation, help, capabilities, one public metadata read with no credential-value read or refresh, ambient status, and environment-invariant model configuration; 33 focused owner, runtime, and authentication-transition tests pass
- Code review: rejected two findings on 2026-09-11. The high finding showed that the general runtime refreshed providers and could read credential values. The medium finding showed that the advertised command lacked a settling capability fixture. Remediation adds a separately cached strict-preflight listing runtime and the real fixture. Independent re-review remains pending.
- Final re-review: rejected one high finding on 2026-09-11. Pi's provider-status getter can resolve environment references from `models.json`, so the purported passive configured state was not secret-free. Remediation removes every provider-status call and every configured-state promise. Verification remains pending.
- Publication re-review: rejected one medium finding on 2026-09-11. The command matrix retained the superseded composed-status promise. Remediation states the final one-read `stored`/`unobserved` contract. Verification remains pending.
- Code review status: accepted 2026-09-11 at `9b227c2` after independent re-review verified all three remediations.
