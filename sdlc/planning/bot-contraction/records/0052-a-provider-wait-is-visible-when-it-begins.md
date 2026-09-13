---
flow: build
priority: 7
completed: 2026-09-06
---
# A logical provider operation is visible when it begins

## Result

Bot now records `provider_start` before Pi begins each logical provider operation. The fact carries the provider, model, and copied stage-attempt identity. A completed operation later records its matching turn. A silent, interrupted, or timed-out operation retains an honest unmatched start.

Pi's typed provider hook owns this boundary. Bot attaches it beside the ordinary event subscription, waits for its record append, and removes both handlers during detach. Internal transport retries do not create additional logical starts. Existing records without the additive event remain readable under record shape 1.

Production source grew from 15,104 to 15,120 nonblank lines. The sixteen lines cover the hook, constructor, structural reader placement, human reading, and one small diagnostic-event module split.

## Size decision

- Starting production size: 15104 nonblank lines
- Ending production size: 15120 nonblank lines
- Simpler approach tried: Use Pi's typed provider hook and the existing tap lifecycle.
- Why insufficient alternatives were rejected: Existing turn and transport facts occur only after a provider response, so they cannot prove that a silent provider operation began.
- Production code deleted: No obsolete provider-start code existed, so this ticket deleted none.
- Accepted cost: Sixteen nonblank production lines record and read the logical provider-operation start.

## Evidence and review

The retained-home snapshot taken before implementation contained 140,916 turns from `openai-codex` and 121,406 requested WebSocket transport facts. Those facts could not identify a provider operation that began but never answered.

The red controlled-provider test held Pi before its response and found no durable start. The green test observes `provider_start` before releasing the provider and observes the completed turn afterward. A timeout proof retains one start and no fabricated turn. The writer oracle accepts an unmatched interrupted start and requires every completed turn from the current writer to have one earlier matching start.

Design review corrected three claims before implementation. The accepted ticket names Pi's separate typed hook, one logical operation, and an exact measured snapshot. Code review found that the production story reader initially missed identity and open-attempt checks. It also found unrelated formatting compression. The remediation added both structural checks and moved two diagnostic constructors into one dependency-free module. The final review accepted the change.

The first complete check found one stale end-to-end rendered-event expectation. The test now requires one `provider_start` immediately before each of its two real turns. Independent review confirmed that the fix preserves the full event and ordering proof.

## Checks

The complete root `make check` passed with 19 project tests, 205 Bot test files, 1,359 Bot tests, 143 of 143 conformance cases, all 101 production modules in the coverage summary, and the exact 15,120-line production ratchet. Coverage reported 91.45 percent statements, 85.23 percent branches, 93.12 percent functions, and 96.35 percent lines.
