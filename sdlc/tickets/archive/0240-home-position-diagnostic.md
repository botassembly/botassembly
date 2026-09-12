---
flow: build
priority: 1
---
# A misplaced home option gets a useful diagnostic

## Outcome

`bot --home DIR COMMAND` tells the operator that `--home` follows a complete command name that accepts it and shows one retained example.

## Current facts

`--home` belongs to individual commands. The top-level parser currently reports only the generic unknown-command list. Current main reproduces that result for both `bot --home /tmp/example status` and `bot --home`.

Some commands do not accept a home. `bot auth`, `bot models`, and `bot capabilities` use machine-level state. Multiword commands require the complete command path before their local options. `bot run --home DIR list` does not mean `bot run list --home DIR`.

## Scope

When the first argument is exactly `--home`, return this exact diagnostic:

```text
request-invalid  --home
  Put --home DIR after a command that accepts it. Example: bot run list --home ./bot-home.
```

Do not inspect, validate, echo, or reorder the remaining arguments. Apply the same result to `bot --home`, `bot --home DIR COMMAND`, `bot --home --json COMMAND`, and `bot --home --help`. Keep `--home=DIR`, ordinary unknown commands, valid command-local options, and every successful parse on their current paths.

`--home` follows the complete command name. Each existing command parser still decides where the option may appear. Do not make `--home` global, force it to the final position, or standardize option order across legacy and noun commands.

Update the existing home-option paragraph in `docs/src/content/docs/guides/install-and-use.md`. Name the three commands that reject `--home` and explain why. Do not change the runtime specification, capabilities, help grammar, or successful parsing.

## Acceptance

Add byte-exact cases to `bot/tests/cli-request-invalid.test.ts`, the existing owner of the fallback diagnostic. Assert exit `2`, empty stdout, and the exact stderr above for a present value, a missing value, a flag-valued suffix, and `--help`. Assert that `frobnicate` retains the generic command-list diagnostic. Retain one existing valid noun form such as `bot run list --home DIR` and one existing valid management form through the complete check.

The focused tests and the complete repository check pass.

## Dependencies

None.

## Risk facts

This changes one error path and no successful request.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 0
- Cost of error score: 0
- Total: 2
- Minimum level floor: none
- Final level: 1
- Reasons: One public error case and one maintained guide paragraph need direct deterministic proof. No successful behavior, state, timing, filesystem, or recovery path changes.
- Selected model: `gpt-5.6-luna` with high reasoning

Re-score if implementation exposes a new contract, state, timing, reach, proof, or cost-of-error fact.

## Size decision

- Starting production size: 16581 nonblank lines
- Ending production size: 16582 nonblank lines
- Simpler approach tried: Reuse the existing unknown-command fallback for a top-level `--home`.
- Why insufficient alternatives were rejected: The existing fallback lists commands but does not tell the operator that `--home` belongs after a complete command name or show a valid example.
- Production code deleted: None.
- Accepted cost: 1 nonblank production line for the exact top-level diagnostic.

## Review

- Design review: accepted after the trigger, exact diagnostic, supported syntax, test owner, documentation scope, and complexity score became exact
- Primary review: corrected the guide's existing two-command exception list because `bot capabilities` also rejects `--home`
- Code review: accepted with no blocking findings after the primary guide correction; the complete local and hosted checks passed
