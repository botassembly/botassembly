---
flow: quickfix
priority: 10
completed: 2026-09-06
---
# Bot models documents live network access

## Result

The specification and both maintained reference pages now match the shipped command. An ordinary `bot models` listing reads the pinned catalog without contacting a provider. `--live` requests current catalogs and may contact applicable configured providers. A named live request without a credential refuses before contacting that provider.

Runtime behavior did not change. The changelog records the contract correction.

## Review and red-green evidence

The publication test first failed on the blanket claim that `bot models` never reaches the network. Correcting the specification and dedicated models page left the test red on the maintained inspection reference page. The implementation corrected that page directly. The documentation generator explicitly excludes the inspection chapter, so this ticket did not expand the generator.

Independent code review compared the documents with the catalog implementation and existing live-model tests. Review confirmed all three active descriptions, rejected no behavior, and found no material issue.

## Checks

The focused publication and model tests passed with 19 tests. `git diff --check` passed. The complete root `make check` passed with 17 project tests, 202 Bot test files, 1,342 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet.
