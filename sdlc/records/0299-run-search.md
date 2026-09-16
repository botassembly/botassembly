---
base: b209155
head: 0c6572a
---

# Search retained runs by literal text

`bot run search QUERY` now returns bounded, paged literal matches from retained root and child `record.jsonl` files and stage `session.jsonl` files. It prefers ripgrep, falls back to grep, loads no Pi runtime, reaches no network, and changes no file. `runSearchReading` exposes the same command result through `bot/run-readings`.

The result has a versioned `bot.run.search` document, a home-and-query-bound cursor, deterministic bytewise file and line order, bounded excerpts, and explicit continuation. Bot enumerates the admitted files once, sends the sorted explicit operands to one external tool, validates that tool's protocol and order, and keeps the operation within the published candidate, argument, stream, line, document, and time limits.

## Verification

Design review rejected three revisions. The accepted design added single-threaded ripgrep to preserve explicit operand order, portable GNU and BSD grep NUL framing, honest live-filesystem race language, a bounded process-group lifecycle, home-and-query cursor binding, Bot's end-of-options grammar, and one exact failure table.

Implementation followed red-green development. The initial inventory-only change failed the required counterpart, operation prose, exhaustive help, and lazy-runtime checks. Focused behavior then reached 71/71 tests. The complete local gate passed on commit `0c6572a`: 160 repository and documentation checks, 223 runtime test files with 1,845 passing and one explicit real-ripgrep skip where the executable was absent, and conformance 143/143. Typecheck, lint, diff checks, and the no-ripgrep platform check passed. The production ratchet ended at 19,682 nonblank lines, below the accepted 19,708 maximum.

Code review rejected four rounds before the first acceptance. Remediation bounded probe and descendant cleanup, tightened protocol validation and real-tool proof, stopped admitting output after page completion, and removed signal-zero process-group probes. Hosted macOS then exposed two more Darwin-specific failures. Branch diagnostics established that BSD grep and both pipes had fully settled while group `SIGTERM` returned `EPERM`. The final repair treats only that fully observed case as a departed group, never signals the identifier again, preserves the original stop reason, and still refuses incomplete settlement at the cleanup deadline. The same reviewer accepted the exact final commit.

## Honest limitations

The cursor describes a live traversal position rather than a filesystem snapshot. Appends after the position may appear, while insertions before it do not. A file or ancestor can change after enumeration and before the selected tool opens it. The executable comes from the caller's `PATH` and runs with the operator's authority. Bot does not authenticate or contain it. A descendant that escapes its process group may continue, though disposed pipes cannot keep Bot waiting.

## Hosted runs

Branch runtime run `35054607159` exercised exact commit `0c6572a` on Ubuntu, macOS, and WSL and passed the complete check and coverage. Main runtime run `35055116914` passed the native platform legs, complete check, and coverage. Manual documentation run `35055578806` exercised the same exact main commit and passed the site build, complete check, coverage, Ubuntu, macOS, and WSL; deployment skipped because publication was disabled.

Coverage on main was 88.15% statements, 81.86% branches, 90.80% functions, and 92.93% lines.

- Origin: `sdlc/tickets/0299-run-search.md`, plan item 29, requirement A4 and Search S1 through S5 in the 2026-09-14 admin surface requirements note, and the retired-find search issue.
