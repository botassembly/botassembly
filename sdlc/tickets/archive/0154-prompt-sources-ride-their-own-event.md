---
flow: build
priority: 5
deps: ["0152"]
---
# Prompt sources ride their own event

Ticket 0132 made prompt construction observable, and the provenance itself is truthful by construction — one sorted list feeds both the rendered first turn and the recorded descriptors (`bot/src/gating.ts:190-201` at 3cb718b). But the carrier is tangled. The sources ride two different event types depending on whether a before hook exists, so a consumer must know the hook rule to find them. To attach provenance to the hook event, `bot/src/executables.ts` — the process-running module — now imports `PromptSource` and threads a `prepare` callback through `prepareHookEvent` (`bot/src/executables.ts:59-64`, typed against `Parameters<typeof hookEvent>[0]`). That coupling has already cost two patches: the hook event now appends only after prompt-prep I/O, so a crash during prep loses the hook record, which pre-0132 code did not — against ticket 0150's own principle from the same day — and in 2837825's `finally`, an append rejection replaces the original preparation error, so the fault names the wrong failure.

## Done, observably

- Prompt sources ride one dedicated record event, appended by the gating layer after hook success; consumers find them in one place regardless of whether a hook ran.
- The hook event appends immediately after the hook completes again, before any prompt-prep I/O, closing the crash window.
- `executables.ts` returns to pure process execution: no `PromptSource` import, no prepare callback, `prepareHookEvent` unwound.
- A preparation failure's fault names the preparation error, never a later append error; a test proves it.
- The provenance guarantees 0132's tests pin — post-hook truth, no fabricated pre-hook sources — are restated onto the new carrier, not weakened.

## Boundary

This changes the record contract, so the spec and CHANGELOG gain the new event; the dependency on ticket 0152 orders this after the spec-parity gate exists, which will enforce exactly that. What the sources contain does not change. Existing sealed records are history — readers may keep understanding the old carriers, and the ticket does not rewrite any recorded run.
