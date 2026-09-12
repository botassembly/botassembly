---
flow: build
priority: 1
deps: [0244, 0245]
---
# Model list uses the current command contract

## Outcome

`bot model list` reports Pi ModelRuntime availability through the current dispatcher, help, capabilities, and a finite versioned result.

## Current facts

The plural `models` command still routes through the legacy dispatcher. Ticket 0244 supplies the shared availability owner.

## Scope

Add one explicit `model.list` descriptor for `bot model list [provider]` with no aliases. Accept only one optional exact provider plus `--live`, `--json`/`-j`, `--offset N`, and `--limit N`. The offset is an integer from 0 through 2,147,483,647. The limit is 1 through 200 and defaults to 50. Reject repeated, unknown, or conflicting input before credential access.

Keep `bot models` as a separately dispatched legacy command. It is not an alias in the descriptor or capability inventory. Ticket 0247 migrates maintained callers and ticket 0217 owns deletion.

Without `--live`, capture one selected local set and give every row `status: null`. With `--live`, capture the selected pre-refresh set before calling refresh and the selected post-refresh set after it settles. Form the union by exact provider and model identity. Use the pre-refresh model for a pre-only identity and the post-refresh model for a post-only or shared identity. Set `status` to `local-only` for pre-only, `live-only` for post-only, and `null` for shared identities. Only after forming that union, sort it bytewise by provider ID and then model ID, then apply offset and limit. A row is `{provider, model, contextWindow, maxOutput, reasoning, cost: {input, output}, status}`.

JSON is one newline-terminated `{schemaVersion: 1, kind: "bot.model.list", data, page, summary}` document. `page` is `{offset, limit, nextOffset, complete}`; `nextOffset` is the next integer or `null`. `summary` is `{total, returned}`, where total precedes paging and returned counts this page. A valid empty result exits 0 with empty `data`, a complete page, and zero counts. Human output keeps the existing model columns, adds the live status only when present, and ends with `Showing <returned> of <total> models.`

Provider and model identities are at most 1,024 UTF-8 bytes, one encoded row is less than 4,096 bytes, one escaped human cell is at most 480 bytes, one human row is at most 4,096 bytes, and either complete output document is less than 1,048,576 bytes. An invalid runtime row returns one bounded structured integrity error and no partial rows. Request and unknown-provider errors exit 2. Refresh dependency failures exit 4. Aborted refresh exits 1. Invalid runtime data exits 5. Errors use the shared version-1 `error` document on standard error and the existing 2,048-byte human error bound.

The default requests no model-catalog network refresh. It still constructs `configuredModelRuntime`, whose ordinary `refresh({allowNetwork: false})` restores local catalog and availability state. Availability resolution can make Pi's own expired-OAuth refresh network request, as ADR 0030 records. `PI_OFFLINE` does not make OAuth refresh, login, or a model request network-free. `--live` additionally requests a forced model-catalog refresh. `PI_OFFLINE` changes that catalog refresh to `allowNetwork: false`; it never permits catalog network. A failed or aborted catalog refresh returns a structured failure and no stale rows. Preserve 0244's named-provider and availability rules.

After all request and provider-name validation, invoke ticket 0245's exactly-once warning hook before constructing the credential-bearing runtime or reading Pi's store. Add `bot model list` to the table proof. Invalid requests and help do not warn. Keep the legacy `bot models` proof until its deletion ticket lands.

## Contract decisions

Offset paging is smaller than a durable cursor because the catalog already lives in memory and has no revision identity. The accepted cost is that separate live invocations can repeat or omit rows when a provider changes its catalog; the page and summary describe each invocation's sorted snapshot. The 200-row ceiling keeps the worst valid page below the one-mebibyte document bound. The accepted cost is another invocation for larger catalogs. Keeping the legacy spelling duplicates one route temporarily, as the planning decision already accepts.

## Acceptance

Tests cover the exact options and schema, human and JSON output, zero and several results, configured model identity, ordinary listing with no requested model-catalog network, permitted Pi-owned expired-OAuth refresh, requested catalog refresh, `PI_OFFLINE`, failures without stale rows, explicit pre-only/post-only/shared union status, bytewise sorting of the union before paging, page continuation without repetition in one unchanged snapshot, bounds, summaries, legacy separation, warning order, and the capability row. The capability document remains below 65,536 bytes.

## Dependencies

0244 supplies ModelRuntime availability. 0245 supplies the credential preflight and retired-store warning used when availability reads authentication state.

## Size decision

- Starting production size: 18264 nonblank lines at the rebased accepted command boundary.
- Ending production size: 18545 nonblank lines.
- Production change: 285 added nonblank lines and 4 deleted, net +281.
- Duplication and bloat search: The implementation checked the legacy catalog renderer, the shared command failure renderer, the capability descriptor helpers, and the existing list parsers. It reused the shared failure, inert-text, bytewise-sort, JSON, runtime, and descriptor owners. The legacy catalog renderer cannot own the new nullable status, one-document result, offset page, typed refresh exits, and fail-closed row validation without changing `bot models`.
- Accepted cost: One 254-line command owner keeps the temporary legacy route byte-compatible while enforcing the new parser, Pi snapshot comparison, finite row validation, paging, both output forms, pre-warning provider validation, and secret-safe dependency failures. The remaining 27 net lines publish and dispatch the contract. This decision does not raise the shared integration ratchet; final integration owns its already acknowledged combined ceiling decision.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: One public read command adopts an existing owner, but it defines a new paged compatibility contract and must prove hostile bounds, warning order, and separate offline and requested-network modes.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if the command gains credential mutation or provider fallback.

## Review

- Design review: accepted 2026-09-11 after two rejections made the public result, paging, legacy boundary, 0245 warning, OAuth network limit, and live-set construction exact
- Code review: rejected 2026-09-11 because unknown-provider validation followed the retired-store warning and credential-bearing runtime construction, and thrown Pi errors could disclose their raw messages
- Code remediation: provider identity now comes from Pi's credential-free provider catalog before the warning and credential-bearing runtime. Runtime construction, availability, authentication status, refresh, and row projection failures now use fixed Bot-owned messages and never render dependency exception text. Pending re-review.
- Code re-review: rejected 2026-09-11 because runtime construction still copied an arbitrary dependency error code into the public cause, and the committed proof covered rejected promises but not synchronous throws or a throwing row getter. Remediation pending re-review.
- Code re-review remediation: runtime construction now emits only the fixed Bot-owned `runtime-unavailable` or `runtime-invalid` causes. Focused proofs cover rejected promises, synchronous runtime, availability, authentication, and refresh throws, a throwing row getter, secret exclusion, and the shared error bound. Pending re-review.
- Code review: accepted 2026-09-11 at `aa36ead` after both rejection histories and their remediations were independently verified
