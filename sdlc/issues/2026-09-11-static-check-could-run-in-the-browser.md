# The static checker could run in the browser

Observed 2026-09-11 while designing the site's interactive pages. `bot/src/reader.ts` exports `check(source, dir, env)` as a pure, synchronous function: no child processes, no network, no `pi-agent-core`, 22 modules, about 3,800 lines. The conformance test at `bot/tests/conformance.test.ts` already drives it by directory plus environment and compares bytes, so the 143 cases would serve as an equivalence oracle for a browser build.

Four things stand between it and a browser bundle:

- About 17 direct `fs` calls with no filesystem port; `Dirent` travels as a value, so an in-memory tree must fake it.
- The executable-bit test at `documents.ts:301`.
- `invocation.ts:8` imports `record.ts` for a function check never calls, dragging in three Node builtins.
- One `homedir()` fallback.

Estimated bundle without `ajv` is 130 to 150 KB minified. The site already ships the corpus and two explorers built from it; a live checker on the same page would let a reader paste a tree and see the refusal before installing anything. Details in `sdlc/planning/notes/2026-09-11-site-information-architecture-study.md`, section 3.

## Disposition (2026-09-12)

Status: retained later opportunity. No browser checker is required for the
source alpha. Review when the site interactive checker gets an owner and an
equivalence plan, or on 2026-12-12.
