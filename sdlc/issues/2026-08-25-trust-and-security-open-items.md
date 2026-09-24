# Trust and security — the standing note

Moved from Ian's notes vault on 2026-09-24. Written 2026-08-25; nothing was rechecked on the move.

Opened 2026-08-25 because the cold review found the security material scattered: the three-agent review surfaced real findings and none had a home. This gathers the trust model and the open items in one place. Staging note — anything that must survive becomes a ticket.

## The trust model, stated plainly

Everything runs as one OS user on Ian's machine. There is deliberately no full sandboxing (a stated refusal in the playbook); the fences are procedural — gates, path policy, protected paths, the ratchet — not walls. The consequence, proven by the 2026-08-25 settlement incident recorded by the downstream work dispatcher on 2026-08-25: any stage can read anything the user can read, including push-capable credentials on disk. The containment being built (a dispatcher ticket: stages do not receive settlement push authority) stops *accidents*, not a deliberately hostile stage. That gap is accepted and should stay written down, not assumed away.

## Open findings with no ticket yet (from `reports/botassembly-three-agent-review.md`)

- The hand-maintained credential scrub list (~45 names) — a list someone must remember to extend is the opposite of mechanical enforcement.
- Unescaped terminal control characters in rendered output.
- The environment a stage ran with is not recorded, so a run cannot prove what secrets it could see.

## The levers

Accidental-misuse containment: a dispatcher ticket (filed). Hostile-stage isolation: future work, explicitly out of stabilization scope — a second OS user or real sandbox, decided by Ian when the dispatcher is boring. Each finding above graduates by becoming a botassembly ticket; strike it here when it does.
