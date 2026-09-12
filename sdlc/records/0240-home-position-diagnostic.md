---
base: 48f695cdfe9f4a487d9d3e8548b5119046cb5eab
head: 707cd89ccc327cd2a6a64095e9b087343b02fb82
---

# Explain misplaced home options

A top-level first argument of `--home` now returns one direct `request-invalid` diagnostic. The message tells the operator to put `--home DIR` after a complete command name that accepts it. It shows `bot run list --home ./bot-home` as the example. Bot does not inspect or echo the remaining arguments on this path. Valid command-local options and all successful requests remain unchanged.

The install guide now states the placement rule. It also names the three commands that reject `--home`: authentication, models, and capabilities. Credentials and models belong to the machine. Capabilities describe the installed Bot program.

Independent design review rejected the first draft because it left the message, trigger, option precedence, documentation scope, and complexity score vague. The accepted level-1 design uses one exact first-argument check and one static diagnostic. Luna High implemented the ticket with a one-line production increase. Independent Sol Medium code review accepted the code. Primary review found that the guide's surrounding paragraph named only two of the three commands that reject `--home`. The guide and ticket were corrected. Sol confirmed the final text and documented its earlier miss.

The primary local `make check` passed with 81 repository tests, 1,562 runtime tests across 218 files, 143 conformance cases, all static checks, and the exact source ratchet. GitHub Actions documentation run `34545548175` and runtime run `34545548154` passed on commit `707cd89`.

## Size decision

- Starting production size: 16581 nonblank lines
- Ending production size: 16582 nonblank lines
- Simpler approach tried: Reuse the existing unknown-command fallback for a top-level `--home`.
- Why insufficient alternatives were rejected: The existing fallback lists commands but does not tell the operator that `--home` belongs after a complete command name or show a valid example.
- Production code deleted: None.
- Accepted cost: 1 nonblank production line for the exact top-level diagnostic.
