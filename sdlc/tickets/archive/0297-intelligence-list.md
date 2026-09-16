---
flow: build
priority: 3
deps: [0295]
---
# List the home's intelligence table

## Outcome

`bot intelligence list` prints the home's `intelligences` table in Markdown and JSON. It loads no Pi, reaches no network, and joins the export door as `intelligenceListReading` on `bot/admin-readings`. It closes the issue on the unread table.

## The name decision

Every listing here is a noun followed by `list`: `assembly list`, `auth list`, `model list`, `run list`. Each noun names the thing listed, not its container. `intelligence` is the word `--intelligence NAME` uses. `home.intelligences` puts a plural noun in the verb slot beside `home show`, so it is rejected. `intelligence.list` sorts between `home.show` and `model.list`.

## Current facts

Observed at `4291b3f` on main.
- `bot/src/home-config.ts:34` reads the table. `:13-38` fault a malformed row, and `:66` and `:71` fault the file with `frontmatter-invalid`. A row missing `model` or `reasoning` never enters the table.
- `bot/src/invocation.ts:394` is the only caller of `readYamlOptions`, and `:392` returns an empty table when `config.yaml` is absent. `bot/src/options.ts:86` looks the name up in the table, and `:85` resolves the unnamed case to `default`.
- `bot/src/home-command.ts` is the handler this one copies, and `bot/src/public-admin-readings.ts:23` drives it through `commandReading`. `bot home show` never opens `config.yaml`, so it sets no precedent here.
- `bot/src/assembly-check-command.ts:143` does set it. A home fault reaches `bot assembly check` as code `request-invalid`, exit 2, with the faults in `details.faults`. A fault code is a `REFUSAL_CODE` and `CliFailure.cause` is an `ErrorCause`, so a fault code cannot be a cause.
- `bot/tests/library-contract.test.ts:91` fails on an operation with no counterpart, and `bot/tests/spec-operation-inventory.test.ts` pins the chapter sentence to `CLI_CONTRACTS`.

## The document

`bot.intelligence.list`, schema version 1. `data` holds one row per entry: `name`, `provider`, `model`, `reasoning`. A row with no authored provider reports `provider: null`, as `bot assembly list` does. Rows sort bytewise by name.

No `default` marker field is added. The row named `default` is the one an unnamed resolution takes, because `bot/src/options.ts:85` hardcodes that name.

Markdown prints a heading and a pipe table of the four columns, with `-` for a null provider. An empty table prints the heading alone and returns `data: []`.

## Scope

1. Add `intelligence.list` to `NEW_OPERATIONS` and a descriptor to `CLI_CONTRACTS`: command `["intelligence", "list"]`, output `{ kind: "bot.intelligence.list", schemaVersion: 1 }`, both modes, home `reads`, `mutates: false`, `network: "never"`, the `assembly list` home and JSON options, limits `documentBytes` 65,536 and the common `humanErrorBytes`.

2. Add `bot/src/intelligence-list-command.ts`. It selects the home the way `bot/src/home-busy-command.ts` does, tests `config.yaml` for existence the way `bot/src/invocation.ts:393` does, calls `readYamlOptions` with its own faults array, and renders the table. A missing file lists zero rows and never reaches the reader, which faults an absent source.

3. Refuse a malformed table the way `bot assembly check` refuses one: code `request-invalid`, cause `home-invalid`, exit 2, and the `home-config.ts` faults in `details.faults`. `home-invalid` is an admitted cause (`bot/src/spine.ts:158`), so the error vocabulary is untouched. Standard output stays empty, and the new chapter section carries the sentence.

4. Register the handler in `piFreeHandlers`, importing no model runtime.

5. Add `intelligenceListReading(home: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>>` to `bot/src/public-admin-readings.ts`, building `[...flag("--json", json), "--home", home]` for `commandReading`.

6. Name it in `COUNTERPARTS` as `intelligenceListReading (bot/admin-readings)` and add it to the red loop there. Raise the prose counts at `:37` and `:96` by one. The live comparison runs `["intelligence", "list", "--json", "--home", home]` against `intelligenceListReading(home, true, cwd, env)` and searches `bot.intelligence.list` on stdout.

7. Add `intelligence.list` to the inventory sentence at `specification/elements/inspection.md:141`, and raise the count in `bot/tests/spec-operation-inventory.test.ts` to 26. Add a `### bot intelligence list` section after `bot home busy`, stating the columns, the null provider, the order, the implicit `default` name, the missing file, and both refusals with their codes, causes, and exits.

8. Add the `bot intelligence list` row to `docs/src/content/docs/reference/commands.md`, and change "twenty-five" to "twenty-six".

9. Add one `specification/CHANGELOG.md` paragraph under `## 2026-09-14` beginning "Ticket 0297", naming the operation, the document, and the export.

10. Raise `sdlc/ratchet.json` from 19079 to the measured total.

11. Delete `sdlc/issues/2026-09-14-home-intelligence-table-has-no-reader.md`.

12. Join the two suites that pin the whole inventory. `bot/tests/capabilities.test.ts` takes `intelligence.list` in its exit-zero set, because the command lists zero rows there. `bot/tests/cli-lazy-model-runtime.test.ts` takes it as a Pi-free case, because the handler loads no Earendil module.

Exclude writing the table. Exclude paging: the document is bounded and refuses past the bound, as `renderHomeResult` does. Exclude any fingerprint.


## Acceptance

1. Red first: add the operation to `CLI_CONTRACTS` alone. `library-contract.test.ts` fails naming the missing counterpart, and `spec-operation-inventory.test.ts` fails on the missing chapter name. The counterpart and the chapter entry turn both green.
2. A home with three rows, one without a provider, lists three sorted rows in both modes.
3. A home naming an intelligence without `model` exits 2 with cause `home-invalid` and a `key-missing` fault in `details`. A home with no `config.yaml` exits zero with no rows.
4. The live comparison agrees byte for byte.
5. `make check`.

## Size decision

- Starting production size: 19079 nonblank lines
- Ending production size: 19202 nonblank lines
- Simpler approach tried: add the table to `bot home show`.
- Why insufficient alternatives were rejected: `bot home show` returns installation identity inside 4,096 bytes, and the chapter scopes it there. A table inside that bound turns one reading into two contracts.
- Production code added: 123 nonblank lines. The ceiling rises from 19079 to 19202.
- Production code deleted: none.
- Accepted cost: the document is bounded rather than paged, so a very large table refuses with code `integrity-failed`, cause `result-oversized`, and exit 5.

## Complexity

- Contract 2, state and timing 0, reach 1, proof 2, cost of error 1. Total 6. Floor: none. Level 3.
- Reasons: a new command surface and a new document kind are a new compatibility decision. Proof spans two modes, two refusals, and an exact-byte comparison.
- Selected model: `claude-opus-5` medium implements; `claude-opus-5` medium reviews independently

## Review

- Origin: requirement A1 and proposed ticket 8 in the 2026-09-14 admin surface note, and the issue filed 2026-09-14.
- Design review: accepted after the draft corrected its refusal causes, made the missing-file case reachable, and grounded the exit code in the specification.
