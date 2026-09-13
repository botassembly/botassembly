---
flow: build
priority: 20
waits-on: ["botassembly/botassembly/0141"]
---
# An assembly declares its extra folders

Today the grammar refuses any top-level entry it does not recognize (`entry-unknown`), and the only escape hatch is the dot prefix. Ian's ruling (2026-08-25): keep strict as the default — a typo'd folder name must stay a loud refusal, the same medicine as the checklist heading rule — but give the assembly a declared way to carry folders that are not bot's business. The motivating case: an eval project wants to keep an `evals/` folder inside an assembly without the grammar rejecting the assembly.

The shape: the assembly's own configuration surface (`ASSEMBLY.md` frontmatter, where stage defaults already live) gains at least one field governing this.

- **`strict`** — default `true`, which is exactly today's behavior: unknown top-level entries refuse. Set `false`, unknown top-level entries are ignored rather than refused. The default requires no migration; every existing assembly behaves identically.
- **A declared folder list** (name it well — `folders` or similar): top-level folder names the assembly permits in addition to the grammar's own. A declared folder is ignored by bot — never read, never executed — and stays permitted even under `strict: true`. Declaring a name the grammar reserves (`flows`, `skills`, `subflows`, `gate`, …) is a refusal, not an override.

## Decisions the spec change must make explicitly

- **Identity:** whether a declared folder's contents count toward the assembly prehash. Recommendation: excluded, like dot-prefixed entries — the folder is declared *not part of the procedure*, so it must not change the assembly's recorded identity. Whichever way it goes, the spec says so and a test pins it.
- The declaration governs the top level only; it is not a recursive allow-list.

## What done looks like

- An assembly with an undeclared unknown folder refuses `entry-unknown` exactly as today (default unchanged, existing corpus untouched).
- An assembly declaring an extra folder in `ASSEMBLY.md` frontmatter passes `bot check` and runs, with the folder demonstrably unread; conformance accept case added.
- `strict: false` ignores unknown top-level entries; a refuse case pins that a reserved name cannot be declared.
- The spec (assembly.md, refusals.md) states the rule and the identity decision, with a CHANGELOG entry in the same change.

## Boundary

- No plugin mechanism — the idea that a plugin could define the folders it permits is recorded as an idea only, not built here.
- No change to dot-prefix behavior, nested-entry rules, or what the grammar itself recognizes.
