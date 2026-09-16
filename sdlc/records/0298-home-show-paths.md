---
base: e3f14d3
head: 2352bc5
---

# Report resolved home paths

`bot home show` now reports the resolved configuration file, runs directory, assemblies directory, installation file, cache directory, and Pi authentication file. Each entry carries its absolute path and point-in-time existence. Markdown and JSON expose the same six entries. The reading uses its caller's environment, loads no Pi module, and reaches no network.

## Verification

Design review accepted the ticket on its third round after the byte bound moved to 65,536 and the source facts and proof were corrected.

Code review rejected the first implementation because the copied Pi directory rule did not normalize `file://` URLs. The revision added the missing normalization and pinned Bot's result against Pi for file URLs, encoded URLs, absolute and relative paths, tilde paths, empty values, and the default. The same reviewer accepted the revision.

The complete local gate passed on commit `2352bc5`: 160 repository checks, 220 Vitest files, 1,808 tests, and conformance 143/143. Coverage passed at 87.79% statements, 81.57% branches, 90.43% functions, and 92.66% lines. The production ratchet moved from 19,202 to 19,258 nonblank lines.

## Honest limitations

Path existence can change immediately after the command returns. Bot copies Pi's directory rule to keep this Pi-free operation lazy; the direct comparison test detects drift. The result byte bound rose eightfold before 1.0 because the accepted home length can repeat across escaped paths.

## Hosted runs

Hosted runtime run `35040114912` and hosted docs run `35040114999` exercised exact commit `2352bc5`. Linux and macOS platform checks passed, and the push-only WSL jobs skipped as designed. The complete checks and coverage passed before this record landed.

- Origin: `sdlc/tickets/0298-home-show-paths.md`, requirement A2 and proposed ticket 7 of the 2026-09-14 admin surface note, and plan item 27.
