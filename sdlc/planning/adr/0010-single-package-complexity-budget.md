# ADR 0010 — Single package, enforced complexity budget

**Status:** accepted with one clause superseded by ADR 0030 · **Date:** 2026-07-31 · **Supersession:** Ticket 0243 replaces the blanket ban on Pi wrapper types with one reviewed Bot-owned compatibility boundary.

## Decision

The runtime is one npm package — no monorepo, no workspaces. `src/` modules
mirror the specification's element names (`reader`, `graph`, `stage`,
`gating`, `record`, `tools`, `cli`), so drift between code and spec is visible
by filename. One `make check` gates everything.

Complexity is controlled mechanically, because most of this code will be
written by agents and agents have known failure patterns — God files,
defensive try/catch sprawl, speculative abstraction. The controls:

- **Ratchet:** a checked-in total-LOC ceiling (initial budget 5,000 for
  `src/`) that CI compares against; it can be lowered freely and raised only
  by an explicit commit editing the number. (Predecessor's `ratchet` gate,
  kept.)
- **Per-file ceiling:** eslint `max-lines` at 400 per file — the God-file
  breaker. A file that wants more is a module boundary being missed.
- **Dead code:** knip; unexported and unused means deleted, not kept "just in
  case."
- **Cycles:** no circular imports (predecessor's `cycles` gate).
- **Type strictness:** predecessor's eslint `strictTypeChecked` config —
  `no-explicit-any`, `no-floating-promises`, `no-non-null-assertion`,
  `switch-exhaustiveness-check` (causes, stop reasons, and sentinels are
  unions; a new member must break the build).
- **Anti-defensive rules:** no `try/catch` that rethrows or logs-and-continues
  (the spec's posture is refuse-or-crash-honestly; a swallowed error is a
  record that lies); no speculative wrapper types over dependencies; no abstraction with one
  implementation. Enforced in review and by the adversarial pass, with lint
  approximations where they exist (`no-useless-catch`, complexity caps).
- **Dependency freeze:** every new dependency is an ADR-worthy event.
  `check:pinned-deps` (Pi's script pattern) enforces exact pins on all of
  them. The admitted set, decided here so it is never a drive-by: Pi's two
  packages (ADR 0003), **ajv** (JSON Schema 2020-12 validation — bespoke
  would be thousands of lines for a solved problem), **a YAML parser**
  (frontmatter, `config.yaml`; prefer the `yaml` package Pi itself already
  depends on, one shared pin), and a test runner. **No markdown parser**:
  checklist and CHOOSE extraction are deliberately line-shaped grammars
  ("top-level list items under a heading", "a code span starting an item")
  and get a bespoke ~100-line extractor whose fixtures come from the
  conformance corpus. Anything beyond this list reopens this ADR.
  **Admitted 2026-08-01 (Ian's approval of ticket 0012):**
  `proper-lockfile@4.1.2` (+ its types package) — cross-process file
  locking for the conforming credential store, pinned to the exact
  version pi-coding-agent ships so our lock protocol on the auth file
  is identical to the interactive agent's.

## Context

The predecessor's tooling was good; its 62k lines were architecture, not
hygiene. The budget number is the architecture estimate (~3.9k runtime +
~550 extensions) with headroom — and review flagged, correctly, that the
deterministic side is the least-evidenced part of it: the reader with its
report-every-fault refusal pass, seven inspection commands including session
rendering, and prompt construction were under-itemized. P5 put the real
number on the reader: 820 prototype lines (refusals + resolution + check
output), projecting ~1.5k production — survivable inside 5,000, but budget it
as the biggest single item, not ~300 lines. If the ratchet ever
needs a big raise, that is the design failing, and the response is a design
session, not a bigger number.
