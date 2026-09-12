# ADR 0015 — Per-ticket line budgets, kept light

**Status:** accepted (Ian, 2026-08-01; loosened same day per his
ruling: budgets are deliberateness, not enforcement) · **Date:**
2026-08-01

## Decision

1. **Every ticket states a net src-line budget at cut time** — a
   deliberate, slightly loose number with real headroom ("I've got 50
   lines to spend on this"). It makes the size of a change a conscious
   choice, nothing more.
2. **The ceiling is raised ahead of the work.** When a ticket is cut,
   `MAX` in `scripts/ratchet.mjs` is set high enough (budget plus
   slack) that the builder never fights the ratchet mid-ticket. The
   agent running the ticket list adjusts it as part of cutting the
   ticket — no separate approval ceremony. The ratchet's job is to be
   the backstop against runaway generation, not a per-line negotiation.
3. **Over budget is information, not failure.** The builder tries to
   stay inside; if it lands over, one honest shrink pass, and if it is
   still over: "the budget was 100, I looked for shrink opportunities,
   it's 150, that's the answer, we're done." Report the actual, no
   debate, no STOP ceremony, no redesign ritual.
4. The audit reports actual vs. budget as one sentence. Occasional
   trims of the ceiling toward reality (a retro-time hygiene pass,
   lowering is free per ADR 0010) are fine; no automatic
   snap-to-actual after every ticket.

What this is for: agents being deliberate about size and not
generating huge piles of code because nothing pushed back. What it is
not: a thing anyone argues about or spends time gaming.

## Duplication audit (2026-08-01) — baseline

Both passes ran against 4,988 ratchet-counted lines (27 files).

- **Mechanical (jscpd, min 35 tokens): 4 clones**, dominated by the
  3-line `mapping()` type guard in five files.
- **Semantic (full read of all 27 files): nine safe items, net ~25–32
  lines**, five of them multi-file vocabulary duplications (sentinels,
  control tools, option names, reasoning levels, hook kinds) — drift
  hazards, not line hoards. Executed as ticket 0013: actual −25,
  zero output-byte change (4,988 → 4,963).
- **Deliberately left alone** (recorded so nobody churns them later):
  the gating retry loop's three variants (core semantics, record
  contract), frontmatter parsing on both sides of the
  authored-vs-agent boundary, the two JSONL parsers with opposite
  error postures, check-phase vs run-phase model validation, the twin
  tree-walkers, pi-tap's throwing validators, `scalar` vs `field`.

Conclusion: after eleven tickets the reclaimable total was ~0.6% —
the codebase is not fat; ceiling pressure is real growth, which
budgets now make deliberate.

## Ledger (informal — a history, not a contract)

- 2026-07-31: ADR 0010 initial ceiling 5,000.
- 2026-08-01: ticket 0013 dedup, budget −25, actual −25 → src 4,963.
- 2026-08-01: ceiling set to **5,150** — working headroom (~190) so
  small fixes and the next ticket's start never hit the wall.
- 2026-08-01: ticket 0012 luna store, budget +120, actual +108 →
  src 5,071 (ceiling 5,150 had the slack; untouched).
- 2026-08-01: ticket 0014 live smoke, budget +30, actual +10 (two
  runtime bug fixes) → src 5,081.
- 2026-08-01: ticket 0015 slot expansion, budget +25, actual +30 —
  one shrink pass found only readability left to spend; 30 is the
  honest number → src 5,111.
- 2026-08-01: ceiling raised to **5,250** ahead of ticket 0016
  (headroom was 39; budgets are loose so builders never fight the
  wall).
- 2026-08-01: ticket 0016 materialize $SKILLS, budget +40, actual
  +43 (one shrink pass; honest number) → src 5,126.
- 2026-08-01: ticket 0017 run-loop hardening, budget +60, actual
  +35 (D1 prompt race, D2 isError skip, F4 exitFlushed) → src 5,161.
- 2026-08-01: ticket 0018 subflow batch truth, budget +45, actual
  +15 → src 5,176.
- 2026-08-01: ticket 0020 spec-session rulings (runtime side), budget
  +40, actual +28 incl. the record.ts split (129 + 280) → src 5,204.
- 2026-08-01: ceiling raised to **5,350** ahead of ticket 0021 (help
  text is src lines; headroom was 46 against a +80 budget).
- 2026-08-01: ticket 0021 CLI help + inspection conformance, budget
  +80, actual +125 (nine help screens are irreducible words; one
  shrink pass; honest number) → src 5,330. Headroom is 20 — raise
  ahead of the next src-touching ticket.

- 2026-08-02: ceiling raised to **5,850** ahead of ticket 0031
  (assembly management, loose +330).
- 2026-08-03: ceiling raised to **6,000** ahead of the 2026-08-03
  queue — 0054 (+25), 0057 (+40), 0059 (+10), 0055 (+60) and 0063
  item 1 (+10) sum to ~145 against 55 headroom at src 5,795.

`record.ts` was split by ticket 0020: constructors in
`record-events.ts` (280), writer/hashing in `record.ts` (129) — the
file-cap constraint is retired.
