# The ratchet ledger, bot's first 8,500 lines

History. The ceiling itself now lives in `sdlc/ratchet.json`, read by
`sdlc/scripts/ratchet.mjs` — the same short reader every project in the workspace uses, applying the same rule the sealed verify gate applies: the ceiling must equal the measured total. This file is where `bot/scripts/ratchet.mjs` kept
its raise log before that consolidation; every raise from here on defends
itself in its own commit message.

**The number did not change.** This repo's ledger already counted non-blank
lines in `bot/src` and stood at 8,500 with zero slack, because ticket 0032
ruled that counting every line makes deleting blank lines currency for adding
code. The sealed gate counted every line; it now counts non-blank lines too,
in every repo, so 8,500 carries over untouched and the two numbers can no
longer disagree (this repo's issue 0051, now closed).

The verbatim log follows, oldest first.

---

#!/usr/bin/env node
// Ratchet gate (ADR 0010): total non-blank src/ LOC must stay at or under the
// checked-in ceiling. An agent may raise MAX itself in the same commit as the
// code that needs it, without ticket authorization. Its commit message answers
// “is this the best option?” with the arithmetic: what grew, why the lines earn
// their place, and what was checked for removal first. The ceiling prevents
// unnecessary code; gaming the counter is the only sin. A diff that deletes
// blank lines while adding code is a red flag reviewers refuse.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ADR 0015: tickets carry line budgets and the ceiling is raised ahead of
// the work (budget + slack) so builders never fight the ratchet mid-ticket.
// It's the backstop against runaway generation, not a per-line negotiation.
// Current: src 5998 after 0054/0057/0059/0064/0055 — that queue is spent, and
// 0055 came in at +81 against a loose +60. Two lines of headroom is not a
// margin, it is a tripwire, so this is raised ahead of what remains: 0058
// (packaging), 0060 (revision marker) and 0063's item 1 (+10), item 8 (net 0)
// and item 9 (net 0) — call it ~40 wanted. 6100 is that plus honest slack.
//
// Raised 2026-08-03 for 0063 item 1, the update/remove liveness guard, which
// cost +25 against its ~+10 estimate and left 6099 with no room. Where it went:
// ~+16 in inspection.ts and ~+9 in management.ts. Two thirds of that is not the
// guard, it is the de-duplication the guard forced — `inspectRuns` decided
// running-vs-crashed inline, so a second caller meant extracting `ending()`
// (CHECKLIST 9, one fact one place) and adding `liveAssemblies()` beside it.
// The guard itself is three lines. 6160 is that plus slack for what remains in
// 0063; only item 15's injected clock is expected to touch src at all.
//
// Raised 2026-08-04 by Ian, for the six confirmed-defect tickets remaining from
// the SOL Agent review: 0072 (one output candidate, expected net 0), 0075
// (corrupt-run isolation), 0076 (honest endings for handled faults and subflow
// settlements), 0077 (preflight: request naming, timeout ceiling, schema
// compilation), 0078 (one registry walk, expected NEGATIVE) and 0079 (the
// record version reader). Those net out around +28 on estimate — but the two
// builds that landed the day this was raised each cost about twice their
// budget (0071 estimated 10, cost 20; 0073 estimated 3, cost 7), so 6220 is
// the estimate at the observed overrun rate and no more. This is a repair
// budget, not room to grow: a ratchet exists to stop drift, not to stop fixes
// to defects that were reproduced before they were ticketed.
//
// Raised again 2026-08-04 by Ian, same day, for the last four of that batch:
// 0076 (honest endings), 0079 (the record version reader), 0080 (a malformed
// record marks and continues, ruled) and 0081 (bot status on a broken link).
// The first raise was sized from estimates and they ran 2-4x low — 0075 was
// estimated at 6 and cost 34, 0077 at 10 and cost 28 — so this one is sized
// from what the day actually measured instead: src went 6131 to 6215 while
// eight confirmed defects closed, about ten lines each, and four remain.
// The standing agreement is that exceeding 6300 stops the work rather than
// buying a third raise: at that point the fixes are bigger than the defects
// justify, and that is a thing to look at rather than fund.
//
// It stopped the work, and that is why this line exists. Merged, the last four
// came to 6302 — two over — though every one of them was inside its own budget;
// the composition crossed the line, which is the thing no single build can see.
// Ian raised it to 6320 and closed the batch rather than fund an open-ended one.
// The check that mattered was not the number, it was refusing to shave two
// lines of comment to pass: a ceiling you can edit your way under is not a
// ceiling. If a later batch reaches this line again, the same question is the
// right one — are the fixes still proportionate to their defects? — and the
// answer is allowed to be no.
// Raised 2026-08-04 by Ian for the second review pass, and he attached a
// condition to it: this is the LAST raise of the review era. Four defects were
// reproduced through the real runtime before they were ticketed — typed agent-
// library faults leaving a one-line record (0082), the record reader's three
// seams (0083), assembly update losing an installation and two gate files both
// running (0085). Estimate is ~31; 6360 is that plus the overrun rate the last
// two builds measured (0070 was budgeted 2 and cost 7, 0084 budgeted 5 and cost
// 5). The two builds already landed fit under 6320 and spent none of this.
// The condition, written here because the next driver inherits it and not the
// conversation: the batch after this one is net zero or negative. If review
// findings still cost source lines after 0082-0085, the answer is no longer a
// raise — it is that the runtime is growing to meet its reviews, which is the
// thing this file exists to notice.
// Raised 2026-08-04 by Ian, AND THE POSTURE CHANGES HERE. The net-zero
// condition was met: 0087 cost +3 for a record reader that hung three verbs
// un-killably on a named pipe, and 0095 paid it back several times over by
// deleting ~38 lines of genuine duplication — a doubled RenderContext literal,
// three single-use wrappers, four interfaces restating the same four fields, a
// helper re-implemented beside the one that already existed, and a predicate
// restated inline that forced a cast to compile. The batch closed NEGATIVE.
//
// So the ratchet did the job it exists for, and Ian widened it deliberately
// rather than because it was in the way. Read the intent, not the number:
//
//   THE TARGET IS DUPLICATION, NOT LINE COUNT.
//
// A ceiling that stops a fact being stated twice is working. A ceiling that
// buys an inline expression where a named helper belonged, or a third read of
// the same file because one read cost nine lines, is buying the wrong thing —
// and it bought both of those today (0097 and 0098 each named theirs in their
// report, which is the only reason anyone knows). Neither was worth the lines
// saved. If a builder reports that the budget is shaping the design rather
// than the duplication, the answer is now a raise, not a shrink.
//
// THE CEILING IS NOT A WALL. An agent raises it itself when the better design
// needs it and records that decision in the commit message; no petition or
// ticket authorization is needed. What earns refusal is spending lines on a
// fact already stated elsewhere, or gaming the counter, not a better design.
// Earlier raise entries below are history, not a condition on a later raise.
//
// What has NOT changed: no build may shave a line off something load-bearing
// to pass. Blank lines are formatting, not currency. A ceiling whose counter
// can be gamed is not a ceiling.
//
// And the real constraint has repeatedly NOT been this file. eslint's
// `max-lines: 400` is the one that has actually forced worse designs: it held
// src/inspection.ts at 399 until ticket 0099 split it three ways (it is 276
// now), having first REJECTED an extracted helper at 406 lines and an inlined
// one at complexity 14. Raising THIS number does not touch that cap, and the
// answer to a file that outgrew it is to split it, not to move the wall.
// Where the wall stands today: tests/inspection-record-contract.test.ts at 382.
// Check the caps before assuming the ratchet is what is in your way.
//
// Raised 2026-08-05 by Ian to 6800, for ONE bounded batch and no more: the two
// safety fixes now running (0111, prune's implicit selector; 0112, the
// run-birth window and interior blank lines) plus per-run assembly capture and
// rendered-prompt retention, plus process-output and concurrency caps. src was
// 6454 with 46 lines left, which is a tripwire and not a margin — 0110 alone
// cost 25. ~350 lines is sized to fit that list and deliberately NOT sized to
// fit a second architecture: the snapshot design this funds is a private copy
// per run, no object store, no collector, no pins. If a build finds itself
// wanting the object store, the number is not the thing to change.
//
// The standing agreement from the last three raises still holds and has been
// honoured every time: exceeding this stops the work rather than buying
// another raise. It stopped the work at 6300 and Ian closed that batch rather
// than fund an open-ended one. Say the number and stop.
//
// Raised 2026-08-05 by Ian for the capture batch, re-sized after 0111+0112
// landed. The 6800 raise above funded this same list, but those two builds
// spent 79 of it (6454 -> 6533) and an external review flagged 267 lines of
// headroom against the widest build yet: ADR 0016's capture touches
// invocation reading, run birth, hashing, prompt retention, status and
// failure cleanup. Sized from the queue as cut — 0113 exec-bit +6, 0114
// mid-birth listing +12, 0115 runtime version +8, 0116 capture at birth
// ~+70, 0117 execution from capture ~+45, 0118 prompt retention ~+25, 0119
// status figure +10, caps batch ~+40 — ~215 on estimate, and this file's own
// history says estimates run ~2x, so 7000 is the estimate at the observed
// overrun rate and no more. Same agreement: exceeding it stops the work.
//
// Raised 2026-08-05 by Ian to 7150 for the closeout campaign (tickets
// 0127-0135), sized before the work like the 7000 raise: an external review
// plus a fresh-eyes usability playtest produced a bounded fix list — silent
// paths get sentences, provider naming, --home on inspection, link
// validation, BOT_AUTH scrub + 0700 modes, a progress line and an output
// verb — estimated ~50 src at the observed 2x overrun rate, and the
// witnesses ticket deletes dead branches back. This is closeout, not
// growth: if a build here wants a new subsystem, the number is not the
// thing to change. Same agreement: exceeding it stops the work.
//
// Raised 2026-08-05 by Ian to 7250, mid-campaign, when 0134 landed at 7149
// of 7150 with two audit-cut tickets (0136 management --home + spoken
// missing homes, 0137 install honesty) still queued. Sized like the two
// raises above: their ~+18 nominal at the campaign's OBSERVED ~4x overrun
// (~+72) plus margin for the 0134 parallel-tail pin. The 2x planning rate
// this file used to quote is dead — closeout tickets have run 4-7x nominal
// because audits keep widening them; plan with 4x or petition earlier.
// Same agreement, third restatement: exceeding it stops the work.
//
// Raised 2026-08-06 by Ian to 7400 for the seal-and-scratch defect batch:
// 0139 (the environment is bot's — process-env scrub at entry, the bash-tool
// inheritEnv leak that resurfaces scrubbed names in every stage shell, an
// injected auth context so provider resolution reads bot's snapshot instead
// of ambient env, TMPDIR into run scratch, tilde refusal in agent file
// tools) and 0140 (scratch closed and owned — 0700 at birth, home-keyed
// naming so prune in one home can never remove another home's scratch,
// an orphan sweep, honest "(gone)" marks in bot show). ~35 src nominal at
// the campaign's observed 4x (~140) plus margin — sized the same way 7250
// was. Same agreement, fourth restatement: exceeding it stops the work.
//
// Raised 2026-08-06 by Ian to 7500 for 0142, the last src ticket of the
// batch: `bot logs` (the home-wide tool-call stream, bounded by default)
// with `tools` retired clean in the same commit. ~+50 net nominal against
// 68 of headroom — petitioned AHEAD per this file's own doctrine rather
// than mid-build. The batch's measured rates: 0139 landed ON nominal,
// 0140 ran 2.7x (comment-weighted). Same agreement, fifth restatement:
// exceeding it stops the work.
//
// Raised 2026-08-06 by Ian to 7750 for 0144, the first ADR 0017 ticket:
// the seal completes — BOT_AUTH retires clean, the credential file gets
// its fixed XDG home, `bot auth import` bridges from any pi-shaped file,
// TMPDIR rides into stage shells, and cli.ts splits first (386/400, the
// split-first watch). ~+60 net nominal at the observed 4x is ~240
// against 46 of headroom; 7750 is that plus honest slack, petitioned
// AHEAD. Funds THIS ticket only — the login/list/logout ticket
// petitions separately when cut. Same agreement, sixth restatement:
// exceeding it stops the work.
//
// Raised 2026-08-06 by Ian to 8000 for 0145, ADR 0017's second and last
// ticket: `bot auth` grows login/logout and the bare listing on pi-ai's
// public Models.login/logout, bot supplying only the terminal interaction
// adapter; `bot auth` gets its own spec chapter. ~+90 net nominal against
// 131 of headroom, sized at the batch's measured ~2.5-3x, petitioned
// AHEAD. 0144 landed at 2.75x inside its own raise. Funds 0145 only —
// 0146 (profiles) petitions separately at dispatch. Same agreement,
// seventh restatement: exceeding it stops the work.
//
// Raised 2026-08-07 by Ian to 8500, petitioned AHEAD with two measured
// exhibits of the budget shaping design instead of stopping duplication —
// exactly the smell this file says earns a raise, not a shrink: 0159's
// honest house-density comments measured 7998 and were reflowed to land on
// 7992, and the whole rough-edges queue (0158's report: check-dot, the
// show renderer, --json coverage, --version, auth labels) plus ADR 0019's
// two ratified commands (`bot config`, `bot models`) sat blocked behind
// eight lines of reserve. Sized from that queue: ~+180 nominal at the
// campaign's measured 2.5-3x is ~500; 8500 is that and no slack padding.
// Same agreement, eighth restatement: exceeding it stops the work.
// Raised 2026-08-10 to 8516 within ticket 0010's +20 allowance so its local
// provenance branch remains readable. The review searched management.ts for
// duplicate locator parsing and scratch cleanup before retaining these lines.
// Raised 2026-08-10 to 8522 for ticket 0011's atomic install publication:
// same-filesystem staging and cleanup cost six source lines within its +15 allowance.
// Raised 2026-08-12 to 8566 for ticket 0024's bounded provider-stream retry:
// its 44 net source lines fit the approved 45-line ceiling.
// Raised 2026-08-12 to 8621 for ticket 0017's stage workdir, within its +55
// ceiling. The review searched flow.ts, run.ts, check.ts, reader.ts, and
// local-context.ts for an existing resolution or validation seam: preparation
// already owns the effective PWD, while check and run each need the shared
// resolver; workdir.ts prevents those two rules from drifting. The 42 net src
// lines carry parsing, validation, root/inherited threading, and rendering.
// Raised 2026-08-12 to 8900 for ticket 0025's explicit continuation. Its 275
// source lines prove donor compatibility and completed prefixes across the
// existing flow graph, verify and copy sealed outputs, and add the run and
// record plumbing that exposes a fresh run's provenance. They cannot be
// removed without weakening the approved continuation safety requirements.
// Raised 2026-08-12 to 9030 for ticket 0029's runtime provenance resolver:
// exact lockfile hashing, resolved adapter identity, and immutable propagation
// through the existing run and child-flow seams require 128 source lines.
// Raised 2026-08-13 to 9056 for ticket 0031: home-held worktree locks need
// stale sweeping and a narrow asynchronous compromise boundary.
// Raised 2026-08-13 to 9067 for ticket 0019: the eleven source lines carry
// the event transport and human rendering. The review searched flow.ts,
// attempt.ts, machinery.ts, record-events.ts, and readings.ts for an existing
// seam or duplicate machinery. Existing gating configuration is the smallest
// transport seam; no new public interface or helper is needed.
// Raised 2026-08-13 to 9082 for ticket 0027: the five-field record contract,
// optional event field, and gating transport preserve exact minted paths on
// every work-stage attempt without altering chooser records.
// Raised 2026-08-13 to 8334 for ticket 0035's JSON-schema prompt rendering.
// Its six net source lines remove document metadata without losing constraints.
// Review searched schema-check.ts, prompt-assembly.ts, and record.ts for an
// existing renderer or prompt serializer; none duplicates this behavior.
// Raised 2026-08-14 to 8500 during review of ticket 0040. Formatting the
// extracted prune reader restores local control-flow reasoning without changing
// its behavior. Review searched inspection.ts, flags.ts, record-lines.ts, and
// the existing inspection helpers for duplicate walkers or formatting seams;
// none removes these required boundaries.
