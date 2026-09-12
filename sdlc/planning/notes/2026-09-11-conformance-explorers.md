---
project: botassembly
date: 2026-09-11
status: built
---

# The two corpus explorers

Components A and B of [the information architecture study](2026-09-11-site-information-architecture-study.md) are built. The extractor is `docs/scripts/extract-corpus.mjs`, the pages are `/format/explore/` and `/format/refusals-explorer/`, and the components are `docs/src/components/AssemblyExplorer.astro` and `RefusalExplorer.astro`. No UI framework, no client fetch: the JSON is imported at build time and inlined in the page, so the first case renders with scripting off.

## The data shape

One file, `docs/src/data/corpus.json`, generated into `.gitignore`d ground beside the generated specification pages. It is written by `npm run build` and `npm run dev`, both of which now run the extractor after `generate-specification.mjs`.

```json
{
  "counts": { "cases": 143, "accept": 35, "refuse": 108, "files": 782, "bytes": 37266, "codes": 40 },
  "codes": { "gate-conflict": "a gate file beside a gate/ folder", "...": "..." },
  "cases": [
    {
      "id": "shape-minimal",
      "kind": "accept",
      "invocation": "./assembly/change",
      "files": [{ "path": "assembly/ASSEMBLY.md", "size": 61, "executable": false, "text": "..." }],
      "expected": ["{\"stage\":\"01-read\",...}"],
      "stages": [{ "stage": "01-read", "type": "STAGE", "options": {} }]
    }
  ]
}
```

A refuse case carries `faults` (the `{code, path}` objects) and `codes` (the distinct codes, sorted) where an accept case carries `stages`. `invocation` and `expected.jsonl` are lifted out of the file list; everything else in the case directory ships.

## The size

231,705 bytes of JSON, well under the 400 KB budget the extractor enforces. Nothing was dropped for size: the 4 KB per-file content limit never fired, because the largest file in the corpus is a 6 KB `expected.jsonl`, which is surfaced as parsed lines rather than as a tree entry. The 782 shipped files total 37,266 bytes; the rest of the corpus's 91 KB is the 143 `invocation` and `expected.jsonl` files.

Eight files ship without contents, each saying why: five symbolic links, some deliberately dangling, carry their target instead of bytes; three files are deliberately not UTF-8 (the BOM and UTF-8 refusal cases) and carry their first 64 bytes as hex. The explorers render both cases as a sentence rather than as an empty pane.

Per page, the payload is smaller still: the assembly explorer inlines only the accept cases and the refusal explorer only the refuse cases plus the code table. The built pages are 108 KB and 156 KB before compression.

## The refusal sentence comes from the specification

The corpus never asserts a sentence — deliberately, so two runtimes can be checked against each other without coupling to one runtime's prose. The explorer still needs to tell a reader what to fix, so the extractor parses the code tables in `specification/elements/refusals.md` into a code-to-repair map, and fails the build if the corpus asserts a code that has no row there. That check already earns its place: it is the only thing keeping the corpus vocabulary and the specification's tables in step.

## Where the pages live

The study puts these under a **Format** group. That nav change is not merged, so the pages are in `docs/src/content/docs/format/` with their own sidebar group, and the specification group is untouched. They cannot live under `specification/` at all: `generate-specification.mjs` deletes and rewrites that directory on every build, and `docs/.gitignore` ignores it. When the nav restructure lands, the group folds into Format and nothing else moves.

## What the runtime team could add

Filed as [an issue](../../issues/2026-09-11-corpus-expectations-are-thin-for-a-reader.md). In short: a refuse expectation carries a code and a path but no span, so the explorer can highlight the file at fault but not the bytes at fault; an accept expectation names the rung a value came from but not the file that supplied it, so "from assembly" cannot be a link; and no case carries a one-line title, so the picker shows slugs.
