# Historical punchlist

Archived 2026-09-08. This is an unreconciled historical snapshot, not current direction or status. The [current plan](../plan.md) owns follow-up. Claims below may describe removed behavior or superseded decisions.

Ruled 2026-08-03: we are not ready to call v1. This list is the tracker.

**Swept 2026-08-05, and it carries only open work now.** It used to keep
every landed item with its full description, and a driver then reported
three finished things to Ian as outstanding by reading this file instead
of the repository. Landed work lives in `planning/tickets/` and in git.
The same rule applies here: **a document that restates a fact the tooling
already owns will eventually lie about it.**

Verify anything below against the repository before acting on it.

## Spec


## Runtime

Nothing open here that this file owns. **Ticket 0063 — the eighteen-item
B→A hardening batch — is CLOSED**, including items 2, 3, 4, 7 and the
three flakes 15-17, and `gating-support.ts` no longer exists. The two
things this section used to point at as live have landed too: assembly
capture (ADR 0016, tickets 0113–0119) and the resource ceilings (0120 —
32 parallel branches or subflow children, 16 MiB per gate or hook,
8-way copy/hash concurrency). The old fix list was empty when absorbed.

A run as a whole is still unbounded by design — no deadline, no cost
budget, no disk quota — and `runtime.md` says so (0131). A real
run-budget feature is deferred at Ian's direction until unattended use
matters; it is not a defect.

## Team

- [ ] **The guides need an outside reader — a person, not a build.**
      The two guides (now `docs/src/content/docs/guides/`, published at
      botassembly.org) exist and were swept against landed behavior by
      ticket 0135. Ian's
      ruling of 2026-08-05 stands for every future edit: guides are
      natural language, worked on only once the behavior is nailed
      down, never ahead of time. Nothing in the build checks a guide, so
      the only thing that can catch a stale one is a reader.
- [ ] **The "compelling why" the 2026-08-05 grading found missing** —
      PROMOTED 2026-08-07, ticket 0156 writes it into the
      install-and-use guide. The outside-reader item above
      remains a person's job either way.

## Needs Ian — not scheduled

- [x] **A question loop that runs out never says the budget ended
      it — RULED 2026-08-07: add the bound.** PROMOTED — ticket
      0155, cut same day; the sentence gains the limit, the
      `loop_done` record line keeps the agent's raw words.

- [x] **ADR 0019 (the CLI surface) — RATIFIED 2026-08-07, as
      recommended, all ten opens included** (his criterion: least
      surprise, most standard, most expected for a user) — **and
      LANDED the same day**: `bot config` (0161) and `bot models`
      (0162) are live, spec'd and CHANGELOG'd; the unknown-command
      sentence names all thirteen words. Also ruled the same day:
      the ratchet ceiling 8000 → 8500 (petitioned with two
      measured exhibits), and script naming stays extension-blind
      as built — bare names blessed as house style by one
      authoring-guide sentence, nothing forbidden.

- [x] **The stage scratch tree's modes — RULED YES and LANDED (0140,
      2026-08-06).** Scratch is born owner-only at every level, keyed
      by home, swept by prune where provable. Pre-existing trees keep
      their modes: Ian's own `~/.cache/bot/tmp` (like his home) needs
      one manual `chmod` if he wants old trees closed.
- [x] **BOT_AUTH rides into stage shells — RULED 2026-08-06: scrub,
      and go further.** Ian ruled for the scrub AND for the own-auth
      ADR that dissolves it: BOT_AUTH retires entirely (ADR 0017,
      drafted same day), bot minting its own credential file under
      XDG. The literal-TMPDIR rider and the interim stage-shell scrub
      ride the ADR's implementation tickets.
- [x] **Vertex service-account file auth — RULED 2026-08-06:
      retirement BLESSED.** No carve-out; the seal's fileExists-false
      stands and ADR 0017 records it as law.
- [x] **The prune help screen's 24-line cap — RULED 2026-08-06:
      leave.** The `scratch/` prefix self-describes and inspection.md
      carries the rule. No petition.

Also ruled 2026-08-06: pre-0137 install litter is LEFT (new litter is
impossible since 0137; old directories are the operator's to rm), and
the EACCES raw-sentence defect from the 0133 audit is PROMOTED —
ticket 0143, cut same day.

F8's guard was ruled 40s on 2026-08-05 — the code already carried the
number with its measurement, so the ruling closed the item with no
change. The mode ruling is creation-only by design: existing trees keep
what they have. Checked 2026-08-06: `~/.local/share/bot` does not exist
on Ian's machine (nothing to chmod there); `~/.cache/bot` and its `tmp`
sit at 775 holding two pre-0140 scratch strands from 2026-08-03. The
driver's session cannot touch home dot-directories (classifier), so the
one-liner remains Ian's:
`chmod 700 ~/.cache/bot ~/.cache/bot/tmp && rm -rf ~/.cache/bot/tmp/2026-08-03T*`.

## Rough edges — the 0158 audit's unfixed remainder (2026-08-07)

The full ranked report is recorded in ticket 0158. Fixed at
harvest same day: bare `make` help screen, the launcher's Node
guard, the README on-ramp, `npm ci` alignment. Still open, worst
first (src-costing items wait on the thin ratchet reserve):

- [x] ~~`bot check .` / `./` refuse a valid assembly~~ **FIXED
      2026-08-07 by ticket 0163** — one normalization at the one
      classification seam; `"$PWD/"` turned out broken too and
      rides the same fix; `run` shares the seam.
- [x] ~~`bot show`'s human mode is a util.inspect dump, closing
      with dead `gone` scratch paths~~ **FIXED 2026-08-07 by
      ticket 0164** — one designed clause per event type, all
      fifteen; `gone` rows dropped; `--json` unmoved, proved by
      restoring the committed file and comparing bytes. The
      driver's hostile-record probe found one thing worth its own
      ticket: agent-authored reason text reached the terminal
      raw, control characters and all — **0165, ruled by Ian and
      LANDED the same evening.** A reason is spelled, never
      obeyed, at both print sites; what the agent is handed did
      not change.
- [ ] `--json` on 5 of 13 commands (config and models landed with
      theirs); the others refuse it with an untrue sentence;
      `bot status` has no machine form (ticket).
- [ ] `-h`/`help`/`--version` all refuse; a launcher cannot say
      which checkout it runs (small).
- [ ] bare `bot auth` = 38 unlabelled registry rows (small).
- [ ] help.ts uniformity pass; `make check` meta-test noise;
      `bot check`'s 165-char success line; --home-at-a-file
      answers as empty; prune/status column words; two value
      refusals that name no valid values; auth import conflates
      missing with empty; refusal paths unanchored; planning/
      status vocabulary + index; link's exit 0 on BROKEN (word to
      small each — see the ticket for all of them).

## Watch (not work yet)

- [x] ~~The flow-level model check cannot see stage or container
  rungs~~ **FIXED 2026-08-07 by ticket 0153** (study 0149,
  premise #44: both verbs shared the over-refusing pass — never
  check-vs-run). Every rung relieves the assembly now; corpus
  106 → 112.
- [x] ~~`bot check` never walks `subflows/`~~ **FIXED 2026-08-07
  by ticket 0159** (study 0154: hole real and wider — the
  assembly-agent leg validated zero stage models, and render-level
  input-collision in a subflow was checked by nobody). Corpus
  112 → 118. The ratchet petition it forced was RULED 2026-08-07:
  ceiling 8000 → 8500.
- [x] ~~package-lock version drift~~ **FIXED 2026-08-07 by Ian's
  ruling**: everything says 0.0.1 now (package.json and both lock
  fields), version stays 0.0.1 until Ian says otherwise, and bot is
  NOT published to npm — `"private": true` already enforces that;
  global installs come from the checkout.
- **$SKILLS files are read-only since 0117** — the capture's seal
  rides `cp` into scratch. No spec promise broken ($TMP is the scratch
  space), but the likeliest author surprise in the capture batch.
  Ticket 0156 folds one authoring-guide sentence in; the behavior
  itself stays as designed.
- Four test files sit at or beside `max-lines: 400` — measured
  2026-08-05: `inspection-corrupt-run.test.ts` (400, exactly at it),
  `gating.test.ts` (399), `inspection-record-contract.test.ts` (399),
  `hostile-gating.test.ts` (376). The next witness in any of them forces
  a split, and the 0099 precedent says split, never raise (0114/0115
  audits). `gating.test.ts` and `hostile-gating.test.ts` carry
  near-identical fixtures, so the next test in either is the moment to
  extract the shared one (0133 audit).
- `graph.ts` emits `tail-container` with two different sentences
  (:270 "A branch cannot directly be a parallel container." vs
  :305 "End the sequence with a stage.") — one code, two
  sentences, the shape CHECKLIST 9 usually objects to. Both
  corpus-covered; surfaced by the 0151 build.
- [x] ~~Rendered-show assertions ride `util.inspect` formatting~~ **GONE
  2026-08-07 with ticket 0164**: no `util.inspect` remains in the human
  mode, so no assertion rides Node's formatting. The redesigned ones are
  labelled in `cli-json-and-show.test.ts`, `inspection-conformance.test.ts`
  and `scratch-keyed-by-home.test.ts`.
- `cli-boundary.ts` carries `expect` in two helpers. Precedent exists
  (`assembly-home.ts`), but a helper module holding assertions is worth
  watching.
- The standing rule from the smoke ladder (ticket 0069): a smoke session
  must break a rung on purpose before reporting green.
- [x] ~~The credentials contention flake~~ **FIXED 2026-08-07 by
  ticket 0160**: the retry budget was 87% consumed at worst under
  full-suite load (measured, 41 samples); it is now 1s = 6.8x the
  worst observed hold, zero net src. Honest caveat from the audit:
  the flake itself was never reproduced in 41 runs — the fix
  removes the budget as the binding constraint; if a contention
  red EVER reappears, check the signature first (ELOCKED = budget,
  5000ms timeout = something else entirely).
- **Load-sensitive flakes still watched, not ticketed:**
  `cli-assembly-update-swap.test.ts`'s one 60s-timeout sighting,
  and NEW from the 0160 measurement — `hostile-gating.test.ts > a
  tool result settling across the attempt boundary keeps its own
  attempt's retry` failed once under +16 CPU spinners (1 of 6
  rounds, `waitFor: the probe never held`). One sighting each; a
  second sighting of either is the moment to cut a ticket.
