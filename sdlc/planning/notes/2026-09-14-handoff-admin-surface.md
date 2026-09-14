# Hand-off, 2026-09-14: admin surface and library sequence

Ian stopped the session for budget. This note says where the sequence from the [admin surface and library requirements note](2026-09-14-admin-surface-and-library-requirements.md) stands, so the next session can resume without rediscovery. Delete this note when every item below is resolved.

## Landed on main

Tickets 0287 through 0297 are complete, recorded, and archived. The last three: 0295 exported the remaining read-only readings, 0296 made `bot run resume` inherit the donor's command-rung intelligence, and 0297 added `bot intelligence list`. The operation inventory is 26. The library door compares fifteen read-only operations live; `auth.list` and `model.list` stay pending export because they need the Pi runtime; nine mutating operations stay pending under the child-process ruling.

## Ticket 0298, home paths in `bot home show`

The draft below passed two design reviews with one remaining defect and cite drift. The reviewer's last findings, all to apply before acceptance:

- Set the byte bound to 65,536, not 32,768. A 4,095-byte home of backslashes escapes to about 8,190 JSON bytes, and five entries carry the home string, so 32,768 is too small. Build the computed proof home with the escaping characters `deepHome` already uses in `bot/tests/home-installation.test.ts:93-95`.
- Cites after 0297: `bot/src/cli-contract.ts:248` for `documentBytes`, `bot/src/public-admin-readings.ts:24` for `homeShowReading`, `bot/src/new-command-dispatch.ts:75` and `:84`, `bot/src/command-reading.ts:9`, `bot/tests/library-contract.test.ts:298-302`.
- `piAgentDirectory` has one caller today at `bot/src/cli.ts:85`; the ticket adds the second.

Rulings already in the draft and to keep: Pi's authentication path stays with a drift test that scans Pi's dist source; the retired credential file is not reported; `assemblies` and `installation.json` are reported and declared as beyond requirement A2; no schema bump.

## Ticket 0299, `bot run search`

Not drafted. The brief: literal fixed-string search over session and event files under the runs directory, spawning `rg --fixed-strings --json` when present, else `grep -rnF`, refusing with an admitted cause when neither exists; rows of run, stage, relative file, line number, truncated line; JSON document `bot.run.search` schema 1; a limit with a default and maximum; oversize refusal as 0297. Closes `sdlc/issues/2026-09-14-retired-find-left-no-text-search.md`. Copy 0297's pin list from its archived ticket: every new operation touches `capabilities.test.ts`, `cli-lazy-model-runtime.test.ts`, `help.ts`, the inventory sentence, the library contract counts, and the docs commands page.

## Then

Plan items 23 and 24: the nine mutating operations through the door with `run.start` and `run.resume` spawning a child process, and `types` plus a compatibility statement in `bot/package.json`. After those, the typed layer over the byte readings.

## Housekeeping

Every worktree under `worktrees/botassembly-*` is registered and stays. The record branches `record/0293` through `record/0297` were merged and deleted on origin. Gate tools in a fresh worktree need `sh sdlc/scripts/install` before lint.

## Draft of ticket 0298 as last revised

    ---
    flow: build
    priority: 3
    deps: [0295, 0297]
    ---
    # Report where the home's files live in `bot home show`
    
    ## Outcome
    
    `bot home show` reports every path the runtime resolves for the selected home, each with whether it exists, in both modes. It loads no Pi and reaches no network.
    
    ## Current facts
    
    Observed on main; `sdlc/ratchet.json` max 19202 after 0297.
    
    - `bot/src/home-command.ts:41` builds `data` as `home`, `initialized`, and `installationId` alone; `:44` writes three Markdown lines; `:43` stamps version 1.
    - Paths resolved today: `config.yaml` (`bot/src/invocation.ts:392`); `runs` (`inspection.ts:92`, `busy.ts:103`); `assemblies` (`invocation.ts:351`); `installation.json` (`home-installation.ts:244`, `:363`); the cache `scratchHome(scratchRoot(env), home)` (`management.ts:132`, `invocation.ts:64,86`).
    - Pi's authentication file is `join(agentDir, "auth.json")` (`bot/src/model-runtime.ts:130`); `agentDir` is Pi's `getAgentDir()` through `:148`, which reads `process.env` while a reading carries a caller `env`. Pi's rule (`~/foss/pi/packages/coding-agent/src/config.ts:516-522`): `PI_CODING_AGENT_DIR`, tilde-expanded, else `join(homedir(), ".pi", "agent")`.
    - **Pi's session directory is resolved nowhere in `bot/src`.** Pi has `getSessionsDir()`; Bot never calls it, so it is unreported.
    - `HOME_RESULT_BYTES` is 4,096 (`bot/src/cli-contract.ts:43`), published as `limits.documentBytes` at `:247`. `bot/tests/home-installation.test.ts:88-109` searches for the longest home that fits; `:107` pins it.
    - No `bot home show` transcript is pinned: ticket 0285's `scripts/example-transcripts.test.mjs` pins only `bot assembly check` fences. `docs/src/content/docs/specification/structure.md:543` is republished from `specification/`, pinned by `bot/tests/spec-publication.test.ts`.
    
    ## The document
    
    No schema bump: ticket 0294 added `data.hash` at version 1 under `specification/README.md:36`, which lets pre-1.0 contracts change without migration.
    
    `data.paths` is added: six entries, each `{ path, exists }`, `path` absolute as resolved, named `config`, `runs`, `assemblies`, `installation`, `cache`, `piAuth`. A2 names five; `assemblies` and `installation` are the two other files the home resolves. The retired credential file is excluded: no requirement names it and `bot/src/cli.ts:151` calls that store inactive. The three existing fields stand. Markdown gains one line per entry after `Initialized`, spelled `- Configuration file: PATH — present`.
    
    ## Scope
    
    1. Widen `Boundary` at `bot/src/home-command.ts:8` with `env`, which `new-command-dispatch.ts:83` and `command-reading.ts:10` already supply, and thread it to `renderHomeResult`.
    2. Add one `homePaths(home, env)` helper to `bot/src/invocation.ts` returning the six paths. Existence is `lstatSync` with `throwIfNoEntry: false`; an unreadable parent reports false.
    3. Resolve Pi's agent directory in Bot, beside `credentialPath`: `home.show` is in `piFreeHandlers` (`new-command-dispatch.ts:81`), and asking Pi reds `bot/tests/cli-lazy-model-runtime.test.ts:119`. Give `piAgentDirectory` (`bot/src/model-runtime.ts:148`) an `env` parameter and pass it from both callers, so one path resolves from one environment. A drift test scans Pi's `dist` for `PI_CODING_AGENT_DIR` and the `.pi/agent` fallback and pins both against Bot's copy, the way `bot/tests/pi-credential-names.test.ts` pins credential names against `pi-ai`'s `dist`.
    4. Place `paths` in the JSON `data` and the six lines in Markdown; `requireInitializedResults` (`:52`) stays the feasibility pre-check.
    5. Raise `HOME_RESULT_BYTES` from 4,096 to 32,768 (`bot/src/cli-contract.ts:43`, published as `limits.documentBytes` at `:247`). Five entries carry the home string plus JSON escaping, so a 4,000-character home needs over 20,000 bytes; 16,384 would still shrink the admitted home. At 32,768 a home at the Linux path maximum fits with margin.
    6. Add `env` to `homeShowReading` (`bot/src/public-admin-readings.ts:23`), which passes `{}` today; without it import and command disagree on every environment-derived path.
    7. Edit `specification/elements/inspection.md:145` and `home.md:26`, which state 4,096 today: the six entries, the existence flag, the schema version, the new bound, and the absent Pi session directory. Republish `docs/src/content/docs/specification/structure.md`.
    8. Add one `specification/CHANGELOG.md` paragraph under `## 2026-09-14` beginning "Ticket 0298". Raise `sdlc/ratchet.json` to the measured total.
    
    Exclude any new operation and any mutation.
    
    ## Acceptance
    
    Red first: add `paths` to the byte-exact absent document at `bot/tests/home-installation.test.ts:50-51`, built from the test's temp `root` and `HOME`, never a literal, because `scripts/check-public-tree.mjs:54` forbids that prefix in a committed file.
    
    Also changing:
    - `bot/tests/home-installation.test.ts:88-109`, the longest-admitted-path search. `deepHome` creates a real directory, so the search cannot reach the new bound under `PATH_MAX`. Replace it with a computed proof: build the document for a home name at the path maximum and assert its byte length is under the bound. The `4_096` at `:107` becomes the new bound; `:92` and `:105` follow the renderer's signature.
    - `bot/tests/library-contract.test.ts:299-302`, the live `homeShowReading` comparison, for the new `env` argument.
    - `bot/tests/spec-publication.test.ts`, red until `structure.md` is republished.
    
    Then: a home holding `config.yaml`, `runs`, and `assemblies` reports `exists: true` for those and `false` for an absent `installation.json`; `XDG_CACHE_HOME` and `PI_CODING_AGENT_DIR` move `cache` and `piAuth`; `bot capabilities --json` reports `documentBytes` 32,768; the drift test passes; `cli-lazy-model-runtime.test.ts:119` loads no Earendil module; `make check`.
    
    ## Risk facts
    
    Bot copies Pi's agent-directory rule, caught only by the drift test. Existence is stale the moment it is printed. Six `lstat` calls land on a command that made none, and the eightfold bound admits a result a consumer may have sized.
    
    ## Size decision
    
    - Starting production size: 19202 nonblank lines
    - Ending production size: 19257 nonblank lines
    - Simpler approach tried: bare path strings, no existence flag, unchanged bound.
    - Why insufficient alternatives were rejected: a bare path answers where a file would be, not whether it is there, and A2 asks both. A bound of 4,096, or of 16,384, still refuses homes that work today. Asking Pi for its directory reds `cli-lazy-model-runtime.test.ts:119`, and JSON-only paths leave a paths command silent to a human.
    - Production code added: 55 nonblank lines in `home-command.ts`, `invocation.ts`, `model-runtime.ts`, `public-admin-readings.ts`, and `cli-contract.ts`.
    - Production code deleted: none.
    - Accepted cost: a copy of Pi's directory rule held by a test, and six stat calls.
    
    ## Complexity
    
    - Contract: 2
    - State and timing: 0
    - Reach: 1
    - Proof: 3
    - Cost of error: 2
    - Total: 8
    - Minimum level floor: none.
    - Final level: 3
    - Reasons: a nested field and an eightfold move of a published byte bound are a compatibility decision. Proof is wide: a byte-exact document, a replaced bound proof, a live import comparison, a republished page, and a drift test. A wrong path misdirects an operator, correctable in place.
    - Selected model: `claude-opus-5` medium implements; `claude-opus-5` medium reviews independently
    
    ## Review
    
    - Origin: requirement A2 and proposed ticket 7 in the 2026-09-14 admin surface note; plan item 27.
    - Design review: rejected once for an insufficient bound, an unreachable bound proof, an unrequired credential path, a misstated Pi rule, and a stale baseline. Revised.
