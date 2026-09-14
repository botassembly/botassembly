# Nothing bounds what one run may spend

Observed 2026-09-14 at commit `44d8dbf` on the Linux box.

`README.md` states the limit plainly: a stage carries a timeout and concurrency has a width, and nothing bounds a run as a whole — no deadline, no cost budget, no disk cap. The command surface agrees. `bot capabilities --json` offers `--timeout` and `--retries` at the command rung, both per stage (`specification/elements/invocation.md:105-131`). The only run-wide ceilings are structural: descent depth 1 through 11 and ten mixed-flow subflow calls (`specification/elements/invariants.md:93`).

Accounting exists after the fact. `bot run list` reports `tokens` and `tokensStatus`, summing valid `turn.total` counts over the root and every authorized descendant (`specification/elements/inspection.md:211`). So a caller can say what a finished run cost in tokens. Nothing stops a running one.

The consequence is that depth and width limits get used as a budget, and they are not one. A procedure inside the ten-call ceiling can spend without limit, because the ceiling counts calls and not turns, tokens, or time.

Two callers need the mechanical form. A scheduler that runs attempts with nobody watching has no way to cap an attempt, so unattended running stays off. A search that runs many candidates to compare them has the same problem multiplied by its budget, and delegating work to a child run stays a hand-run experiment for the same reason.

Smallest outcome that closes it: one authored and command-rung ceiling for a whole run, counted over the root and its authorized descendants in a unit Bot already records, that ends the run with an honest terminal cause and a record when it is reached. A currency price table is not part of it. Bot does not wrap the providers and does not know what a token costs.

Review trigger: 2026-12-14, or the first unattended caller.
