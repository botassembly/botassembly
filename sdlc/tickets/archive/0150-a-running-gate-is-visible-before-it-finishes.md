---
flow: build
priority: 5
---
# A running gate is visible before it finishes

Bot records a gate only after the child process exits. During final verification on 2026-08-26, Factory 0133 spent 134 seconds in `02-green` and Botassembly 0132 spent 95 seconds there. In both runs the last durable event named the preceding `01-landed` gate, so an operator examining the record could not distinguish a healthy full-suite gate from an idle Bot process. The open provider websocket then looked causal even though both sealed records prove it was not: each run recorded `02-green` and ended immediately when that suite finished.

The runtime already knows which executable it is about to start. That fact should reach the record before the wait begins.

## Done, observably

- Immediately before each gate child process starts, the run record appends an event naming the stage, retry, gate file, and pinned hash.
- The existing completed `check` event remains the authoritative verdict and keeps its capture, exit code, file, and hash unchanged.
- A live record therefore identifies a gate currently in progress; a sealed record makes every start followed by its outcome auditable, except when interruption itself is the evidence.
- Bot's human-readable record/show reader renders the start plainly, without calling it passed or failed.
- A test holds a gate open, reads the record before releasing it, and proves the start is already durable while no completed check exists. Success, failure, timeout, and signal tests preserve their existing terminal meaning.

## Boundary

This is observation only. Do not add a shorter gate timeout, an idle watchdog, provider-transport cleanup, polling, or Factory knowledge of Bot internals. Do not promote draft 0136 from this evidence: tonight's two apparent websocket delays were healthy `02-green` executions, not transport hangs.
