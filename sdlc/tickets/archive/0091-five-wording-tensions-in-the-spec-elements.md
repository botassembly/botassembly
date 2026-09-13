---
flow: build
priority: 3
---
# Five wording tensions in the spec elements, found by consolidation

The 2026-08-20 consolidation read every element against every other
and against the runtime
(`sdlc/planning/spec-consolidation-report-2026-08-20.md`). No
normative contradiction was found; five sentences mislead. The rule
for every fix: say what the least surprised reader would find true.

1. `gates.md` says schema decisions are made "by a program rather
   than by a model." True for `schema.json`; for `schema.md` only
   the frontmatter is machine-validated and the body is a template
   the agent follows unchecked. Make `gates.md` say exactly that.
2. `stage.md`'s "What a stage folder holds" says "the four scripts"
   over a table listing three hooks plus a gate; count them the same
   way the table does.
3. The `--id-file` flag is headed "Run identity file" in
   `runtime.md` and "Run id file" in `invocation.md`; pick one.
4. `checklist.md` says "one of two resting states" above a
   three-row state table; say plainly that `todo` is the start
   state, not a resting one.
5. `home.md`'s inheritance chain names the task file, which no
   structural element defines; add the cross-reference to
   invocation.

Any table byte-parsed by `spec-vocabulary.test.ts` stays
byte-identical.

Budget: 0 net src lines — prose only.

## Why this is a build, not a quickfix

Filed as a quickfix and refused twice at `01-repair` — most recently
2026-08-22, with lint green and 863 tests passing. Misleading prose
has no failing assertion to reproduce, so the quickfix flow cannot
start. Reflowed to `build` on 2026-08-22.
