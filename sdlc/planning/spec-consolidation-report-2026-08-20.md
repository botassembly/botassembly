# Specification consolidation and consistency report — 2026-08-20

The 28 element files were consolidated into 12 chapters on the docs site (`docs/src/content/docs/specification/` plus two CLI pages under `reference/`), prose carried essentially verbatim, and every concrete claim in the chapters was then verified against `bot/src`, the test suite, the conformance corpus, the smoke ladder, and the witness ledger by three independent readers. **No mismatch was found between the specification and the runtime.** The refusal-code table and the cause-word table on the site are byte-identical to the element files that `spec-vocabulary.test.ts` parses.

## The one unwitnessed rule

`FLOW.md` — "the body stays empty" (structure chapter). `parseFlow` (`bot/src/graph.ts:358`) never inspects the body; there is no fault code, no test, and no corpus case, so a `FLOW.md` carrying prose parses silently. `CHOOSE.md`'s `body-missing` and `PARALLEL.md`'s `body-unexpected` are both enforced; this rule alone is not. Either add a `body-unexpected` refusal for `FLOW.md` with a corpus case, or soften the spec sentence to say the body is ignored.

## Wording tensions found during consolidation (spec-side, not runtime bugs)

- `gates.md` says schema decisions are made "by a program rather than by a model," while `schema.md` concedes only the frontmatter is validated — the schema body is not. The sentences should agree on what is actually checked.
- `stage.md`'s "What a stage folder holds" says "the four scripts" over a table listing three hooks plus a gate; a reader may not catch that the gate is the fourth.
- The `--id-file` flag is headed "Run identity file" in `runtime.md` and "Run id file" in `invocation.md`.
- `checklist.md` says "one of two resting states" above a three-row state table (consistent once `todo` is read as the start state, but easy to misread).
- `home.md`'s inheritance chain names the task file, which no structural element defines — it is defined under invocation; a cross-reference would help.

## Cosmetic nits (implementation-side)

- `bot/src/cli.ts:377` — the fallback usage sentence omits `request`, though the command exists and is documented.
- `bot worktree` exists (`cli.ts:364`) but appears in neither reference page's command table; if that is deliberate scoping, nothing to do.
- `invariants-witnesses.md` row 48 quotes the record's first-line prefix as `{"record":1,"ts":` but the witness now asserts `{"record":1,"runtime":"<version>","ts":` — the witness still pins the invariant; the quote is stale.

## Format-normative material currently living in the CLI reference

The `bot check --json` output contract (object shape, the eight `from` rung words, container emission rules) is asserted on by the conformance corpus, so it is specification, not implementation detail. It currently lives on the inspection reference page; a future pass should promote it into the spec proper (likely the Running or Conformance chapter).

## The single-source question (needs a ruling)

`specification/elements/` cannot be retired yet: `spec-vocabulary.test.ts` and `inspection-conformance.test.ts` parse those files, and `bot/src/spine.ts` cites them. Until rewired, the element files remain the machine-read source and the site chapters are the published rendering — two copies of the same normative text. Options: (a) point the parsing tests at the site chapters and retire `elements/`; (b) keep `elements/` as the source and add a drift check asserting the site chapters contain the elements' normative tables; (c) accept manual sync. The two parsed tables are byte-identical today; (b) is the smallest safe step.
