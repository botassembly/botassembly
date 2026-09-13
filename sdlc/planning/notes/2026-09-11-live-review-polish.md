# Live review polish, 2026-09-11

A punch list from reading botassembly.org as a visitor. Branch `polish`, cut from
`origin/main`. The branch touches `docs/`, `examples/vtriage/`, `sdlc/issues/`, and
this folder, and nothing under `bot/` or `specification/`.

## What changed

**The install call to action went to the wrong page.** "Install and run one" pointed
at `/guides/install-and-use/`, which is not the install recipe. It now points at
`/guides/first-assembly/`. "Build your own" had to move off that page to keep the two
buttons distinct, so it points at `/guides/authoring-assemblies/`.

**The hero quoted a run that was not published.** The real run is now in the
repository at `examples/vtriage/runs/2026-09-11T12-36-58-eb14/`, 94 lines of
`record.jsonl` with its stage outputs, check captures, prompts, and sessions. The
home page links it as "Browse the whole record, 94 lines".

**The excerpt did not show what the prose claimed.** The card said the run recorded
a checklist pass, a schema pass, and two gates by path with exit codes and SHA-256s,
while the excerpt showed one check line. The excerpt now carries the schema pass, the
chooser's reason, and both gate lines with their exit codes. The SHA-256 claim is
dropped, because the excerpt does not show one. The claim that `bot check` "exited 0
in half a second" is dropped too: three timed runs on the development machine took
1.54s, 1.56s, and 2.25s, and a timing measured on one machine is not a property of the
software. The card now says it exits 0 and contacts no provider, both of which hold.

**Two model names.** `examples/vtriage/README.md` pasted a `bot check` output
resolving to `openai-codex` / `gpt-5.6-sol`, while the shipped record used
`google` / `gemini-3.5-flash-lite`. The paste was retaken against a throwaway home
whose `default` is the record's intelligence, so the two agree, and the README now says
the resolved model is whatever the home's `default` names. Retaking it also corrected a
stale rung: `03-verify` resolves `retries=1@stage`, not `@assembly`.

**The install step over-promised.** It said `make install` creates the default home.
The recipe does not; it creates `BINDIR` and writes the launcher. That claim is gone.
The step now states the platforms once, taken from the README, and names `BINDIR=` as
the launcher override, both verified against the Makefile.

## Decisions

**The published run lives inside the assembly, declared as an opaque folder.** Adding
`examples/vtriage/runs/` made `bot check` refuse the assembly with `entry-unknown`,
which `sdlc/scripts/examples` runs in the gate. Two ways out: move the record outside
the assembly, or declare `runs` under `folders:` the way `requests` already is.
Declared it, because an opaque folder is the project's own answer to "lives inside the
assembly without becoming part of it", and it keeps the example and its proof in one
place. The cost is that installing the assembly brings 312K of record along. Overturn
by moving the folder to `examples/runs/vtriage/` and re-pointing two links.

**Paths in the published record were rewritten, so its hashes no longer recompute.**
Absolute paths became `$BOT_HOME`, `$BOT_CACHE`, `$ASSEMBLY`, and `$HOME`, and the
`installation_id` was removed from `run_start`. The hashes the runtime wrote are kept
unchanged rather than recomputed, so the record stays the artifact the run produced.
The run's own `README.md` says so. Overturn by publishing a run recorded in a home
that had no private paths in it to begin with.

**The hero command runs through Starlight's `Code` component.** That buys the copy
button and `wrap` with no code of ours, which is what fixed the 400px clipping. Its
shell highlighting painted the command in four hues and italicized the first word, so
the CSS holds it to one ink. Overturn by hand-rolling a copy button.

## Open for Ian

**The attribution cannot name the company.** The block added to
`docs/src/content/docs/project/development.md` and the new splash footer were asked to
name the employer as well as the person. `scripts/check-public-tree.mjs` lists that
company name among `DISTINCTIVE_TOKENS` and fails `sdlc/scripts/lint` on any public
prose carrying it, this note included. Both now read "built by Ian Maurer". Relaxing that token is a change to
a check that exists to keep private names out of a public repository, it sits outside
this branch's paths, and it is Ian's call. Until then the site names the person and not
the company.

## Left alone

No run-wide budget is a known product gap, already stated on the home page, and was
skipped deliberately.

`specification/conformance/refuse/value-invalid-profile-empty/assembly/flows/main/FLOW.md`
and `.../model-unresolved-profile/.../FLOW.md` both carry "a intelligence" in a
`description` line. They are conformance fixtures under `specification/`, not site
prose, and a fixture's bytes are part of what the corpus tests. Out of this branch's
paths.

## Filed

- `sdlc/issues/2026-09-11-conformance-runtime-tests-is-one-unbroken-paragraph.md`
- `sdlc/issues/2026-09-11-run-concurrency-and-locking-are-undocumented.md`

## Verification

`npm run build --prefix docs` builds 24 pages. `sh sdlc/scripts/lint` exits 0,
including `examples: examples/vtriage/triage resolves`. Screenshots of the home page at
1440 and 400 in both modes, and of `/guides/first-assembly/` at 400 in both modes, were
captured from the built `dist` and read. Two defects came out of looking that reading
the CSS had not: the highlighted command, and the command wrapping at 1440 once its
wrapper was capped too narrow.
