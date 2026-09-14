---
flow: build
priority: 1
deps: []
---
# Report the assembly hash in check and list

## Outcome

`bot assembly check --json` reports the content hash of the resolved assembly as `data.hash`. `bot assembly list` reports the installed hash through `--fields hash`. Both strings are the same string `run_start` records in `assembly_hash` for the same target. A test proves that agreement against a live run record rather than recomputing a hash. Every Markdown reading this repository pins byte for byte stays byte-identical. This ticket closes `sdlc/issues/2026-09-14-no-reading-reports-an-assembly-hash.md`.

## Current facts

Observed at `3a1c82f`, `bot/src` 18882 nonblank lines, on the Linux box.

- `bot/src/record.ts:264` is the hash dialect. `hashAssemblyEntries` sorts entries bytewise by path and hashes `path:sha256` per line, with `:x` appended for an executable file. `bot/src/record.ts:274` is `prehashAssembly(root)`, which walks a tree through `rootedPolicy`, hashes eight files at once, and returns `{ sha256, files }`. It throws on a symlink entry.
- `bot/src/run.ts:217` hashes the capture at `join(created.runDirectory, CAPTURE)`. `bot/src/run.ts:294` writes that `sha256` into `run_start` as `assemblyHash`, and `bot/src/record-events.ts:69` spells it `assembly_hash` in the record. That is the only spelling this runtime has ever written for the number.
- `bot/src/resume.ts:42` calls `resolveInvocationTokens([target, "--home", home, ...controls], cwd, env)`, `:43` returns on `status === "refused"`, and `:49` calls `prehashAssembly(resolved.assemblyRoot)` with a rejection handler. `:50` refuses the resume when that string differs from the donor's recorded `assemblyHash`. A resume of an unchanged assembly succeeding is the existing witness that hashing the live root and hashing the run's capture produce the same string.
- `bot/src/reader.ts:114` is `resolveInvocationTokens`, returning `{ status: "refused"; result }` or `{ status: "resolved"; invocation; home; assemblyRoot; flow? }`. `bot/src/reader.ts:110` is `readInvocationTokens`, whose accepted shape (`:25-32`) carries `invocation`, `home`, `assembly`, and `flow` and carries no `assemblyRoot`. `bot/src/model.ts:171-184` confirms `Invocation` has no root path.
- `bot/src/assembly-check-command.ts:190` is `assemblyCheckCommand(args, boundary): number`. It is synchronous. `:131` builds the document as `{ schemaVersion: 1, kind: "bot.assembly.check", data: { target, stages }, page, summary, warnings }`. `:180-182` writes either the JSON document or the stage lines alone. Markdown has no header line and no footer line. The continuation hint goes to stderr at `:186`.
- `bot/src/new-command-dispatch.ts:51` types a handler as `(args, boundary) => number | Promise<number>` and `:75` registers `assemblyCheckCommand`. `bot/src/assembly-list-command.ts:194` already returns `number | Promise<number>`, so an asynchronous check handler needs no dispatcher change.
- `bot/src/cli-contract.ts:86` is `ASSEMBLY_LIST_FIELDS = ["name", "kind", "source", "updated", "target", "broken"]`. `bot/src/cli-contract.ts:124-125` uses that one array as both the `values` list and the `default` string of `--fields`, so the vocabulary and the default projection are the same array today.
- `bot/src/assembly-list-command.ts:17` is `AssemblyRow`. `:107` is `row(one: Held)`, already asynchronous. `:167` computes every row with `Promise.all(held.map(row))` before `:171` slices the requested page. `:133` projects a row through the requested fields. `:138-146` renders Markdown: when the requested fields are exactly `ASSEMBLY_LIST_FIELDS` in order it writes the friendly installed and linked lines, otherwise it writes a pipe table whose cells render `null` as `-`.
- `bot/src/assembly-list-command.ts:158` `countOutput` answers `--count` without building any row.

### The Markdown surfaces this repository pins byte for byte

- `scripts/example-transcripts.test.mjs:59-71` reads the `console` fence that pastes `bot assembly check TARGET` out of an example README, takes every line before the exit-status prompt as expected stdout, and compares it to a live run. The pinned fences are `examples/triage/README.md:34`, `examples/brief/README.md:46`, `examples/outline/README.md:49`, `examples/hello/README.md:29`, and `docs/src/content/docs/start/run-the-example.md:32`.
- `bot/tests/cli-assembly-management.test.ts:51-56` asserts the four friendly `bot assembly list` lines by array equality, `:81` and `:116` assert further listings the same way, and `bot/tests/cli-assembly-update-swap.test.ts:194` does so again.
- `bot/tests/cli-dot-target.test.ts:50`, `:62`, `:75`, and `:86` assert that four `bot assembly check` path spellings produce identical Markdown stdout for one tree.
- `bot/tests/cli-lazy-model-runtime.test.ts:111` runs `assembly check TARGET --home HOME --json` and `:145` requires exit 0 with no Pi module loaded.

### The conformance corpus

`bot/tests/conformance.test.ts:20` imports `check` from `bot/src/reader.ts`, `:66` calls `check(invocation, dir, env)`, and `:81` compares `result.lines.join("\n") + "\n"` against `expected.jsonl`. The corpus asserts the reader's JSONL lines. The command wrapper, its `data` object, its `page`, its `summary`, and its Markdown are outside every case.

### The version policy

`specification/README.md:36` is the governing text: this publication is unreleased, it targets `0.1.0`, and a later pre-1.0 release may change assembly and record contracts without migration. `specification/elements/inspection.md:209` applies that policy to one document by name, calling it the pre-release change-in-place policy.

### Sizes

`sdlc/ratchet.json` holds the ceiling at 18882 and `sdlc/scripts/ratchet.mjs:56` requires the ceiling to equal the measured total.

## The output-mode decision

The hash goes into the JSON document only. Check Markdown stays exactly the stage rows it prints today, and the default `bot assembly list` Markdown stays exactly the friendly lines it prints today.

A Markdown header line on `bot assembly check` would red all five pinned transcripts and would force a literal 64-character hexadecimal string into four example READMEs and one published documentation page. That string changes on any byte edit to any file in the example, so every later example correction would also be a documentation correction, and a stale paste would publish a wrong identity. The commands' consumers are programs, and the issue names both of them as programs: a measurement harness and a candidate search. Neither reads Markdown. A human who wants the number asks for `--json`.

Keeping `hash` out of the default `--fields` set follows from the same rule. The friendly listing lines stay as they are, so `bot/tests/cli-assembly-management.test.ts:51-56`, `:81`, `:116`, and `bot/tests/cli-assembly-update-swap.test.ts:194` are untouched witnesses rather than files to rewrite, and `bot assembly list` stays cheap unless a caller asks for the hash.

## Scope

1. In `bot/src/cli-contract.ts:86`, keep `ASSEMBLY_LIST_FIELDS` as it stands and add `ASSEMBLY_LIST_SELECTABLE_FIELDS = [...ASSEMBLY_LIST_FIELDS, "hash"] as const` beside it. Derive `AssemblyListField` from the selectable array. At `:124-125`, the `--fields` `values` list becomes the selectable array and the `default` string stays `ASSEMBLY_LIST_FIELDS.join(",")`. `bot capabilities` then reports one more accepted value and the same default.

2. Make `assemblyCheckCommand` asynchronous. Change its return type to `Promise<number>` and change `successfulCheck` to match. The change is contained: `bot/src/new-command-dispatch.ts:51` types the handler as `number | Promise<number>` and `:75` is the only registration, and `bot/tests/cli-lazy-model-runtime.test.ts:111` with `:145` already drives the operation through that dispatcher end to end and requires exit 0.

3. In `bot/src/assembly-check-command.ts`, after `readInvocationTokens` accepts, compute the hash the way resume computes it. Call `resolveInvocationTokens([target, "--home", parsed.home, ...parsed.args.slice(1)], boundary.cwd, boundary.env)`. A resolve that returns `status: "refused"` reports `null` for the hash and changes nothing else; the reading already succeeded through `readInvocationTokens`, so a refused resolve must not fail the command and must not throw. On a resolve, `await prehashAssembly(resolved.assemblyRoot).then((held) => held.sha256, () => null)`. Write no hashing code. Import `prehashAssembly` from `./record.ts`, which the file already imports `hashBytes` from.

4. Place the hash in the check JSON document as `data.hash`, a sibling of `data.target`, holding the 64-character lowercase hexadecimal string or `null`. Emit it on every page, including a continuation page, so a page is self-describing. Change `resultDocument` at `bot/src/assembly-check-command.ts:131` to take the hash and place it there. Change nothing in `data.stages`.

5. Write no Markdown for the hash in `bot assembly check`. Do not add a header line, a footer line, or a stderr line. The five pinned transcripts stay byte-identical.

6. In `bot/src/assembly-list-command.ts:17`, add `hash: string | null` to `AssemblyRow`. Do not compute it in `row`. Compute it after the page is selected, in `emitRows`, and only when `hash` is one of the requested fields. Hash the assembly directory at `one.path` for an installed row, and the resolved link target for a linked row. A row with `broken: true` reports `null`. A tree `prehashAssembly` cannot hash reports `null` and never fails the listing. `--count` computes no hash, because `countOutput` builds no row.

7. Change nothing in the Markdown branch at `bot/src/assembly-list-command.ts:138-146`. A request naming `hash` never equals `ASSEMBLY_LIST_FIELDS` in length and order, so it falls to the pipe table, whose cell renderer already writes `-` for `null`. A default request still takes the friendly branch and still prints what it prints today.

8. Do not bump either schema version. Both documents stay at schema version 1. `specification/README.md:36` governs: the publication is unreleased and a pre-1.0 release may change contracts without migration. The change is additive in `bot.assembly.check` and is a widened field vocabulary with an unchanged default projection in `bot.assembly.list`.

9. Edit the `bot assembly check` paragraph at `specification/elements/inspection.md:112-116`. State that the JSON document carries `data.hash`, that it is the same string a `run_start` of that target would record in `assembly_hash`, that it appears on every page including a continuation page, that a tree the runtime cannot resolve or cannot hash reports `null`, that Markdown carries no hash, and that the result stays at schema version 1.

10. Edit the `bot assembly list` paragraph at `specification/elements/inspection.md:118-123`. That paragraph names no field vocabulary today, so introducing `hash` means naming the whole set. State the seven accepted `--fields` names, state that the default is the six without `hash`, state that Markdown keeps the installed and linked lines for the default set and renders a pipe table otherwise, state that `hash` holds the installed assembly's content hash with `null` for a broken link and an unhashable tree, and state that the result stays at schema version 1.

11. Add one `specification/CHANGELOG.md` entry under the existing `## 2026-09-14` heading, naming this ticket, the two commands, `data.hash`, the `hash` field, the null rule, the unchanged default projection, the unchanged Markdown, and the unchanged schema versions.

12. Raise `sdlc/ratchet.json` to the measured total in the same commit, with the justification sentence and the search-for-slack sentence the ratchet requires.

Exclude every other reading. `bot run show` keeps its current fields, and the full detail path stays `bot run events`. Exclude the export door: `assembly.check` and `assembly.list` stay in `PENDING_EXPORT` at `bot/tests/library-contract.test.ts:33-36` and a sibling ticket admits them. That test compares operations against allowlists and exports nothing for either, so a new field does not touch it. Exclude any caching of a computed hash. Exclude any second hash function. Exclude any human-readable spelling of the number; if a later ticket adds one, the name is `assembly_hash`, the spelling the record already uses.

## Implementer notes

- `bot/src/assembly-list-command.ts:36` (`isField`) tests against `ASSEMBLY_LIST_FIELDS` and refuses `--fields hash` until it tests the selectable array. Line 32 stays on the default array.
- The acceptance case for a refused resolve depends on `splitInvocation` and `splitRunInvocation` differing (`bot/src/invocation.ts:314,319`). If no command-line input reaches that branch, state that the branch is defensive and prove it by a unit test on the function, never by an invented fixture.

## Acceptance

Start red. Add the agreement test to `bot/tests/run-start.test.ts`, which already starts a scripted run of `review/main` in a home fixture (`bot/tests/run-start.test.ts:44`).

The test does this and nothing more:

1. Start a scripted run of `review/main` in the fixture home.
2. Read the run's record, find the `run_start` event, and take the string at `assembly_hash`.
3. Run `bot assembly check review/main --json --home HOME` and assert `data.hash` equals that exact string.

The test computes no hash of its own and names no expected hexadecimal literal. The record is the only source of the expected string, so the two hash sites agree by comparison rather than by a rule written twice.

Then add to `bot/tests/cli-assembly-read-contract.test.ts`:

- `bot assembly check review/main --json --after CURSOR --home HOME` carries the same `data.hash` as the first page.
- A target the reading accepts but the resolve refuses reports `data.hash: null` and still exits 0.
- `bot assembly list --fields name,hash --home HOME` returns two keys per row in that order, renders the pipe table, and the installed row's `hash` equals that assembly's `bot assembly check` `data.hash`.
- A linked assembly whose target is removed reports `hash: null` under `--fields name,broken,hash`.
- `bot assembly list --json --home HOME` with no `--fields` carries no `hash` key on any row.
- `bot assembly list --count --home HOME` still answers with the count line.
- `bot capabilities --json` reports `hash` among the `assembly.list` `--fields` values and reports the six-name default unchanged.

Then add one `--json` case to `bot/tests/cli-dot-target.test.ts` beside the existing spelling tests at `:50`, `:62`, `:75`, and `:86`: two spellings of one tree report the same `data.hash`. The four existing Markdown comparisons stay untouched and pass unchanged.

Then run `sh sdlc/scripts/test`, `node --test scripts/example-transcripts.test.mjs`, and `make check` at the root. The five pinned transcripts must pass with no edit to any README or documentation page.

## Corpus and transcript impact

No conformance case changes. All 35 accept cases and all 143 corpus cases stand, because the corpus asserts the reader's JSONL lines and the hash lives in the command's `data` object.

No pinned Markdown transcript changes. `examples/triage/README.md`, `examples/brief/README.md`, `examples/outline/README.md`, `examples/hello/README.md`, and `docs/src/content/docs/start/run-the-example.md` are untouched. `bot/tests/cli-assembly-management.test.ts`, `bot/tests/cli-assembly-update-swap.test.ts`, and the four Markdown assertions in `bot/tests/cli-dot-target.test.ts` are untouched witnesses.

## Dependencies

None. Ticket 6 in the planning note sits after tickets 1 through 4 in that note's sequence, but nothing here touches the export door, so it does not wait on them.

## Risk facts

`bot assembly check` reads the whole assembly tree twice on every invocation: once to validate it and once to hash it, in both output modes, because the document is built before the mode is chosen. A large assembly pays that on a command that was previously one walk. No cache is added, because a cached hash that goes stale would report an identity the tree no longer has, which is the exact failure the issue describes in a consumer's own copied rule.

`bot assembly list` walks and hashes up to 20 assembly trees per page when a caller names `hash`. The default listing pays nothing.

The hash the check command reports is computed from the live tree, and the hash a run records is computed from the run's own capture of that tree. The two agree because the capture is a copy, which is what `bot/src/resume.ts:49-50` already relies on. A tree that changes between the check and a later run start reports one string and records another. That is the truth about the tree, not a defect, and it is the same window the resume refusal already names.

A `null` hash on an accepted reading is a real outcome, not a placeholder. It reaches a consumer when the resolve refuses a target the reading accepted, and when the tree holds an entry `prehashAssembly` will not hash. A consumer that pins the hash must handle `null`, and the specification sentence says so.

Making `assemblyCheckCommand` asynchronous changes the handler's return type. `bot/src/new-command-dispatch.ts:75` is the only registration and `:51` already admits a promise.

## Size decision

- Starting production size: 18882 nonblank lines
- Estimated ending production size: about 18904 nonblank lines. The implementer measures and writes the exact number.
- Simpler approach tried: a Markdown header line on `bot assembly check` and `hash` inside the default `--fields` set, so both modes and the plain listing report the number without an option.
- Why insufficient alternatives were rejected: that shape reds five byte-exact transcripts pinned by `scripts/example-transcripts.test.mjs:59-71` and forces a literal 64-character hash into four example READMEs and one published page, where it would go stale on any byte edit to an example. It also reds four friendly-listing assertions. The number's named consumers are programs that read JSON. A second rejected approach put the hash on each row of `data.stages`, which would repeat one assembly-wide fact per row and, because the check reader builds those rows, would rewrite all 35 accept expectations. A third rejected approach computed the hash inside `row` in the list command, which would hash every assembly in the home even for one page or for `--count`. A fourth rejected approach added a `bot assembly hash` command, which the issue rules out by name.
- Production code added: about 22 nonblank lines across `bot/src/assembly-check-command.ts`, `bot/src/assembly-list-command.ts`, and one constant in `bot/src/cli-contract.ts`.
- Production code deleted: none.
- Accepted cost: `bot assembly check` becomes slower in proportion to the bytes of the tree it names, in both modes, and Markdown readers of either command still cannot see the hash.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none. The work holds no durable state, invalidates no cache, and adds no concurrent code.
- Final level: 3
- Reasons: the surface is several explicit public cases rather than an open compatibility question, because `specification/README.md:36` already settles that no version moves before 1.0 and the default projection does not change. The work is ordered asynchronous filesystem reading and turns a synchronous command handler into a promise. Proof is the wide part: two commands, a continuation page, a refused resolve, an opt-in field projection, a capability inventory, and an agreement against a live run record, all while five byte-exact Markdown transcripts and four listing assertions must stay untouched. A wrong string misidentifies an assembly to a consumer that pins it, which is user-visible and correctable in place.
- Selected model: `claude-opus-5` medium implements; `claude-opus-5` medium reviews

## Review

- Origin: the issue filed 2026-09-14 and proposed ticket 6 in the 2026-09-14 admin surface and library requirements note.
- Design review: rejected once for an unnamed byte-exact transcript surface, an unhandled refused resolve, and an invented hash spelling. Accepted after revision.
