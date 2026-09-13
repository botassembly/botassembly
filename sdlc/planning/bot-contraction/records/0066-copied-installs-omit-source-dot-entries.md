---
flow: build
priority: 5
completed: 2026-09-08
---
# Copied installs omit source dot-entries

## Result

Copy-based install and update now admit the selected assembly root and omit every descendant whose basename starts with `.`. Local sources, Git sources, and update share the existing `fs.cp` call and the existing lexical visibility rule. Bot writes one root `.bot-source` after the copy. Visible bytes and executable bits remain unchanged. Links and existing installed copies remain unchanged.

## Review and checks

Commit `95341858` preserves the red proof. All three focused tests failed because the prior copy carried `.root-hidden`. The cases cover local and Git parity, root and nested dot-entries, source `.bot-source` entries, a dot-prefixed selected root, executable bits, and update.

Commit `95ff27a9` supplied the green implementation. The focused and required regression run passed 45 tests across eight files. The documentation generator tests passed all three cases. Full lint, typecheck, the source ratchet, dependency checks, cycle checks, and `git diff --check` passed.

Independent review rejected the first publication account because the generated Structure page was absent from Git. Commit `db9ec293` force-added that generated page. The repository convention tracks no files under the ignored generated specification directory, so that correction was wrong. Commit `0bbe2e2e` reverted it. The tracked assembly specification remains the source of truth, the tracked management reference carries the same rule, and the generator produces the ignored Structure page with the new rule. Independent review accepted that final state. The full root check passed 19 project tests, 211 test files with 1,454 tests, and all 143 conformance cases. Line coverage remained 97.07%.

No live-provider test ran.

## Size decision

- Starting commit: `0685a647`, the current main baseline after manual ticket 0065
- Starting production size: 16056 nonblank lines
- Ending production size: 16056 nonblank lines
- Net increase: 0 nonblank lines
- Simpler approach rejected: exclude only the root `.bot-source`. That keeps nested dot-entries and local working data in copied installs.
- Accepted cost: one changed import and one changed copy filter. The production line count remains unchanged.

## Source

This manual ticket consumes draft 0204. Draft 0205 is next under Sol Medium.
