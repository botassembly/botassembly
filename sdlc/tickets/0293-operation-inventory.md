---
flow: build
priority: 2
deps: []
---
# Pin the specification's operation inventory to CLI_CONTRACTS

## Outcome

`specification/elements/inspection.md` names all 25 operations the executable implements, including `auth.import`. A new test reads that sentence and compares it with `CLI_CONTRACTS` in both directions. An operation added to the contract without a chapter edit fails the gate, and an operation the chapter names that the contract does not hold fails the gate too.

## Current facts

Observed at `3a1c82f`, `bot/src` 18882 nonblank lines. Each count below was read by command.

- `bot/src/cli-contract.ts:9` declares `NEW_OPERATIONS` with 25 entries. `bot/src/cli-contract.ts:445` builds `CLI_CONTRACTS` from 25 descriptors in the same order. `bot/src/cli-contract.ts:454` already refuses a descriptor list whose length or membership disagrees with `NEW_OPERATIONS`, so the two code lists cannot drift from each other.
- `specification/elements/inspection.md:131` reads "The inventory contains `assembly.check`, ... and `run.start`." Extracting every backticked token from that sentence returns 24 operations. The set difference against `NEW_OPERATIONS` is exactly one name in one direction: `auth.import` is in the code and not in the chapter. No name in the chapter is absent from the code.
- The sentence sits in the `### \`bot capabilities\`` subsection of the `## The commands` section, which starts at `specification/elements/inspection.md:47`. The subsection starts at `:125` and the next subsection, `### \`bot home show\``, starts at `:133`.
- `specification/elements/inspection.md:129` states "Commands sort by operation." The chapter's 24 names are in that order today, so `auth.import` belongs between `assembly.update` and `auth.list`.
- The operation exists everywhere else. `specification/elements/auth.md:33` lists `bot auth import <file>` in the command table, `:63-67` states its contract and its `bot.auth.import` document, and `:163` excludes it from the retired-store advisory. `specification/elements/invariants-witnesses.md:15` names it. Only the capabilities inventory omits it.
- `docs/src/content/docs/reference/commands.md:16` lists `bot auth import <source>`, and the page lists all 25 commands. The page is hand-written, not generated. `docs/scripts/build-site.mjs:44-46` runs three generators, and `generate-specification.mjs` writes `docs/src/content/docs/specification/`, which `docs/.gitignore:6` ignores as build output. `docs/src/content/docs/reference/commands.md` is tracked by Git and is edited by hand. `docs/scripts/published-runtime-contracts.test.mjs:215` reads the page as an authored file. The docs page therefore needs no edit in this ticket and does not move with the specification.

## Scope

- Add `` `auth.import`, `` to the inventory sentence at `specification/elements/inspection.md:131`, between `assembly.update` and `auth.list`, so the sentence keeps its stated operation order. Change nothing else in the sentence and nothing else in the chapter.
- Add `bot/tests/spec-operation-inventory.test.ts`. It copies the extraction style of `bot/tests/spec-error-vocabulary.test.ts`: it reads the chapter through a `new URL("../../specification/elements/inspection.md", import.meta.url).pathname` constant, splits on `^## ` to select "The commands", takes the span that begins "The inventory contains" and ends at the first backtick followed by a period, so it stops at "and `run.start`." and never at the dot inside a name, and collects the backticked tokens inside that span with a regular expression. It compares that list with `CLI_CONTRACTS` imported from `../src/cli-contract.ts`. Nothing scans other source text.
- The test asserts four things. The chapter names every operation in `CLI_CONTRACTS`. The chapter names no operation `CLI_CONTRACTS` does not hold. The extracted list holds 25 names with no duplicate. The extracted list is sorted with `bytewise` from `../src/model.ts`, which is what `specification/elements/inspection.md:129` promises and what `bot/tests/spec-credential-names.test.ts:46` asserts about its own list.
- Guard against a vacuous pass the way `bot/tests/spec-error-vocabulary.test.ts:50` does. Assert the extracted list is longer than 20 before comparing, so a failed extraction reads as a failure rather than as two empty sets agreeing.
- Add one `specification/CHANGELOG.md` paragraph under the existing `## 2026-09-14` heading, above the ticket 0291 paragraph, beginning "Ticket 0293" like the paragraphs around it, recording that the capabilities inventory now names `auth.import` and that a test pins the chapter's list to `CLI_CONTRACTS` in both directions.
- Change no file under `bot/src`.

## Acceptance

Start with the failing test. Write `bot/tests/spec-operation-inventory.test.ts` against the unedited chapter and watch the first assertion fail, naming `auth.import` as the operation the chapter omits. Then edit the sentence and watch all four assertions pass. Then delete a name from the sentence and confirm the first assertion fails again, and add an invented name and confirm the second assertion fails, so both directions are proved live. Restore the sentence. Run the new test file, then `make check` at the root.

## Dependencies

None. Ticket 0291 touched the export door and no chapter sentence this ticket reads.

## Risk facts

The test reads prose, so a later editor who rewrites the sentence's opening words breaks the extraction and gets a failure that names the chapter rather than the operation. `bot/tests/spec-error-vocabulary.test.ts:22` and `bot/tests/spec-credential-names.test.ts:21` carry the same risk today and answer it with a message naming the missing section. The new test uses the same message shape. A future operation added to `CLI_CONTRACTS` now costs one chapter edit, which is the point of the ticket.

## Size decision

- Starting production size: 18882 nonblank lines
- Ending production size: 18882 nonblank lines
- Simpler approach tried: edit the sentence and add no test.
- Why insufficient alternatives were rejected: the sentence was already wrong once, and the code that made it wrong did not fail. A prose edit alone leaves the same silence behind. Deriving the sentence from `CLI_CONTRACTS` at documentation build time was rejected because the chapter is the contract and a generated contract sentence proves nothing about the runtime; the chapter would agree with the code by construction. Asserting the count alone was rejected because a swapped name keeps the count. Pinning the docs reference page instead of the specification was rejected because that page is already correct and `docs/scripts/published-runtime-contracts.test.mjs` already reads it.
- Production code added: None.
- Production code deleted: None.
- Accepted cost: one more prose-reading test in the gate, and one more chapter edit whenever an operation joins the command surface.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 0
- Total: 3
- Minimum level floor: none. The ticket adds no durable state, no concurrency, and no cache.
- Final level: 2
- Reasons: the change corrects one public inventory sentence and pins it to an exported list, which is several explicit public cases rather than one exact rule. The proof is one deterministic comparison over one chapter and one module, run in both directions. A wrong result misleads a reader of the specification and is corrected by one edit.
- Selected model: `claude-sonnet-5` high implements; `claude-opus-5` medium reviews

## Review

- Origin: requirement A3 and proposed ticket 5 in the 2026-09-14 admin surface and library requirements note.
- Design review: accepted with three text fixes: the extraction span terminator, one line number, and the changelog opener.
