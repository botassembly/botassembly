# The vocabulary, and how rulings arrive

Naming fights relitigate silently across context boundaries, and a
ruling about a word is the easiest kind to lose. This file is the
ledger of words Ian has ruled on and the shape a ruling takes.
Written 2026-08-03 at Fable's recommendation, on its way out.

Every entry cites where the ruling lives. An entry without a source
is not a ruling — it is somebody's memory, and it does not belong
here.

## Words that are settled

- **`local-context`**, never `workspace`, for the $PWD flag.
  "Workspace" was rejected as "not explicit enough"
  (ticket 0055, the ruling section).
- **No new top-level verbs.** Assembly management sits under ONE
  subcommand root — "I don't feel like we should have five
  top-level things" (handoff, 2026-08-02 rulings) — and cost got
  no verb of its own: "we definitely don't want a new verb for
  cost. You can just have the CLI sum everything up"
  (ticket 0054).
- **The CLI owns the home.** Humans never `ln -s` into XDG;
  `bot assembly link` is how a working tree becomes an assembly
  (handoff, 2026-08-02; the guides teach the verbs, never the
  symlink).
- **There is no deterministic chooser.** "That's not a thing — it
  should go away"; CHOOSE is an agent decision (ticket 0022,
  spec + corpus + runtime moved together).
- **A bare skip is an error**, not a mark: refused marks and
  selections never reach the record (ticket 0049,
  checklist.md:48-55).
- **Refuse, not warn.** Malformed input is refused at check time;
  warn-and-continue was rejected because it erodes the promise
  into a suggestion (ticket 0042, accepted on the veto list).
- **Containers** are CHOOSE, PARALLEL and LOOP — the folders that
  hold stages. After ticket 0057 they are also a skills scope.
  Subflows are not containers; they are flows a stage can call
  (specification/elements/graph.md, subflow.md).
- **The record never lies** is the project's working test for any
  new runtime fact: absence means the thing never existed, and
  nothing claims more than happened (CHECKLIST item 11).
- **Silence is not a zero.** A count the record does not report
  renders `-`, never `0` (inspection.md, ticket 0054).

## How rulings arrive, and what they look like

- **Ian's transcripts are voice-dictated.** Read charitably —
  "maubflow" is subflow, "sub-glows" is subflows — and confirm
  the ruling back in writing before building on it. A
  mis-transcribed word is never a design instruction.
- **One recommendation, with trade-offs.** The format that gets a
  fast ruling is: options named, trade-offs stated in a sentence
  each, then ONE recommendation. Surveys without a recommendation
  come back slower and vaguer.
- **Silence on a listed item is acceptance.** Recommendations
  presented as veto-able proceed unless vetoed; the veto list in
  the handoff is how they stay visible (resolved-accepted
  2026-08-03).
- **Every report ends with four items:** biggest risks, biggest
  open items, worries, what's next. Plain English
  (planning/plan-2026-08-03.md, Process).
- **Rulings are recorded where the work is**, not only in chat:
  the ticket carries the ruling verbatim-in-intent, the handoff
  carries the day's, and this file carries the words. What lives
  only in a transcript is lost at the next context boundary —
  the 2026-08-03 grading review and luna's calibration data both
  proved it.
