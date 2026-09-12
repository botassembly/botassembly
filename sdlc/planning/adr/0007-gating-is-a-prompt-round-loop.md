# ADR 0007 — Gating is a prompt() round loop

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

"Held, not restarted" (spec invariants 21, 30) is implemented as sequential
`prompt()` calls on one idle `AgentHarness`. `prompt()` resolving is the agent
going quiet; the gating driver then checks — `$OUTPUT` present, checklist,
schema, gate, in order — and on failure calls `prompt(captureBytes)` on the
same harness, up to `retries`. No interception machinery, no hook whose return
value blocks a stop: the model was never told the stage was over, so there is
nothing to intercept.

Control tools ride the same design: `refuse` (and a *valid* `select` or
`continue`) return Pi's terminate hint so the loop stops at that batch;
`mark` mutates driver-held checklist state. Which tools a stage gets is
computed from the folder, per the spec. The retry count and the stage clock
live in the driver's closure and appear nowhere the model can see.

**One driver, three modes.** The round loop is not one shape — the spec has
three gated agents, and the driver is parameterized by which checks gate the
stop (adversarial review finding; the first draft modeled only the first):

- **STAGE:** `$OUTPUT` present → checklist → schema → gate. On all-pass:
  `success` hook, then the schema applied *again* (schema.md's post-`success`
  re-validation; a failure there is exit 2 naming `success`, never a
  send-back), then seal.
- **CHOOSE agent:** no `$OUTPUT` — the gate on the stop is "a valid `select`
  happened." Stopping without selecting, or naming a non-alternative, is a
  failing round: held and asked again, spending a retry. A *valid* select
  terminates. (An invalid select must not terminate — the terminate hint
  attaches to validated calls only.)
- **LOOP tail:** the STAGE checks clear first; then one more round asks the
  question with `continue` attached (loop.md: between the checks and the
  hooks). Stopping without answering is a failing round like any other and
  spends a retry; `refuse` here fails a stage whose checks had passed.
  Checks passing does not decide success in this mode — the answer does.

**Sequential tool execution: verified, P6 (2026-07-31).** agent-core 0.83.0
has it as public surface: `executionMode: "sequential"` per tool
(`ToolExecutionMode` exported from the root), and one sequential tool in a
batch serializes the whole batch in arrival order — observed:
`select(bogus)+select(patch)` in one message executed strictly serially,
invalid validated first, valid applied second. The driver-side fallback is
unnecessary. Two caveats the driver must carry: `toolExecution` is not on
`AgentHarnessOptions` (per-tool only — a harness-level knob is an upstream
ask candidate, ADR 0011), and batch termination requires *every* result to
set `terminate: true`, so a mixed invalid+valid batch costs one extra
provider round before the loop sees the stop; the valid select is still
there at `prompt()` resolution. One more driver duty P6's queries caught:
a question-round retry moves the attempt counter past the attempt whose
checks passed, so the driver must remember which attempt's output was the
passed one — sealing the wrong attempt's file is the bug waiting there.

## Context

This is the payoff of building on agent-core (ADR 0002): the coding-agent
layer would need an `agent_settled`-handler continuation pattern that rests on
observed sequencing, while `AgentHarness.prompt()` resolution is plain public
API.

**The clock accumulates agent time only** (invariant 22, whole): paused not
just inside the `subflow` tool but during every check the driver runs —
checklist evaluation, schema validation, gate processes — and during hooks.
A slow gate with two send-backs must cost the agent nothing (gate.md: a gate
"does not take what is left of the agent's clock"). The pause primitive is
the one P2 proved, and **P6 proved the extension** (2026-07-31): a gate
sleeping 2s against a 1200ms agent budget cost the agent ~1ms — a ticking
clock would have expired the stage and flipped the cause, so the assertion
is counterfactual, not cosmetic. The first draft paused only for subflows, which review
correctly called a conformance violation waiting for a heavy gate. Expiry
fires `harness.abort()`; cause `timeout`, exit 1. A CHOOSE agent or LOOP
question that spends its last retry unanswered ends `exhausted`, exit 1 —
the spec's widened `exhausted` row.

## Validation

**P1 (2026-07-31): proven, 23/23 checks, live + scripted** on pinned 0.83.0
(`prototypes/p1-held-agent/findings.md`). The open bullets resolved:

- **Held is real, economically and structurally.** One growing session.jsonl
  (5→9→13 lines) across three rounds on one harness; live cacheRead=3584 held
  across `prompt()` boundaries, round 2 paying only 166 fresh input tokens;
  scripted round-2 context contained round 1's full history.
- **Provisional semantics behaved as documented**: no events after `prompt()`
  resolution. (`busy` was never hit, but P1 awaited every `prompt()`
  sequentially, so `busy` was unreachable by construction — that line proves
  nothing about the idle contract.) Upstream ask #1 (stabilize the contract)
  stands — behavior observed is not behavior promised.
- **Still unproven:** `length`-stopped-turn continuation (never triggered) —
  stays open; upstream ask #4 is the clean fix, neutral continuation prompt
  the interim.

Findings the gating driver must honor:

- `abort()` **resolves** `prompt()` with `stopReason: "aborted"` — never
  rejects. The driver branches on stopReason, always.
- Provider cache minimums are real (OpenAI: 1,024-token stable prefix
  before any cacheRead). Tiny stages won't see cache hits; "held" is still
  structurally true. Prompt construction should keep the stable prefix
  stable.
- A tool-call round is two provider requests and two Usage records —
  per-round costing aggregates, never assumes one.
