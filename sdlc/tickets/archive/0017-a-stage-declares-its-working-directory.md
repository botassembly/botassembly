---
flow: build
priority: 9
---
# A stage declares its working directory

Adopts the pilot-proven feature from the staging worktree
(a consumer's staging worktree, commit `ee26c8c` in the
`botassembly-stage-workdir-prototype` worktree). That commit is the
reference implementation; this ticket lands the behavior on main
through the flow, red-green. The design may follow the reference or
improve on it — the behavior below is the contract, not the diff.

A multi-stage flow may need each agent settled into its own
caller-prepared directory: the agent works there, its output moves
on, and the next agent is not steeped in the previous stage's
leavings. Today every stage shares the flow's working directory.

## Behavior

A stage may declare in its frontmatter:

```yaml
workdir: ./investigator
```

The path resolves against the run's root directory (`--in`). It
must be an explicit relative path, may not contain `..`, may not be
`.`, and must already be a directory — absolute, escaping, missing,
and non-directory paths are refused before any provider spend.

The agent, stage-local context and skills discovery, the before,
success, and failure hooks, and the gates all use the declared
directory as their process working directory. A subflow inherits
the calling stage's directory unless its own stages override. A
stage without the field behaves exactly as today.

The workspace stays caller-owned: bot creates, empties, preserves,
and removes nothing. This is deliberate placement, not sandboxing,
and the specification says so in those words — it blocks invalid
authored paths lexically and claims nothing about confining a
process.

`bot check` and `bot run` agree about the resolved directory, and
check's rendering shows it.

Container semantics (PARALLEL, LOOP) are deliberately out of scope
here — ticket 0018 specifies and pins them. Recording the resolved
directory in the run record is ticket 0019.

## Deferred proofs

- PARALLEL and LOOP workdir behavior: deferred to ticket
  `0018-containers-workdir-semantics-are-pinned.md`, which exists
  on this board. Design here leaves those cases unauthored and the
  reviewer may not refuse for their absence.
- The record naming each stage's resolved workdir: deferred to
  ticket `0019-the-record-names-each-stages-workdir.md`, which
  exists on this board.

## Tests you are authorized to restate

Added by the refusal addendum below; the ticket originally named
none, which is what blocked it.

- `bot/tests/cli-subflow-pins.test.ts` — the subflow pins. This
  ticket gives a subflow the calling stage's working directory
  unless its own stages override, so assertions that pin where a
  subflow's stages run may be restated to match. Every assertion
  about subflow *selection*, ordering, and refusal shapes keeps its
  exact strength; only the working-directory expectations move.

## Refusal addendum, 2026-08-11 (first flight)

The flight refused on two traceability defects. Both are the
ticket's fault, not the design's.

**It named no tests it was allowed to touch.** The behavior above
changes where a subflow's stages run, and the pins for that live in
`bot/tests/cli-subflow-pins.test.ts`. A ticket that changes pinned
behavior without authorizing the pin leaves the builder no honest
move. Fixed by the section above.

**The ratchet raise came without its justification.** `bot`'s
ratchet is a running argument, not a number — `bot/scripts/ratchet.mjs`
carries the reasoning for every previous raise in the file itself,
and the standing agreement recorded there is that raises are funded
deliberately and sparingly.

So: prefer not to raise it. The reference implementation's runtime
delta is +41 net, and this ticket's own ceiling of 55 lines is
already generous against that. If the work genuinely fits under the
existing ratchet, land it and do not touch the file.

If a raise is unavoidable, the commit that raises it must say why
in the file's existing voice, and must name the duplication and
bloat search that was actually performed — which files were read
for an existing home for this logic, and what was found. "It did
not fit" is not a justification. A raise recorded without that
search is the drift the ratchet exists to stop.

The src line ceiling may rise by at most 55 lines (the reference
implementation's runtime delta is +41 net).

## Consumer handoff note, 2026-08-12

A downstream consumer runs this feature in production from the staging worktree
(definition d8426cb, implementation ee26c8c) and cannot move to
upstream main until it lands here — that is why the priority rose
to 9. Their handoff confirms this ticket is the intended fold; the
second staging change (a transport maxRetries) is deliberately NOT
part of this and is superseded by tickets 0021/0024. The reference
implementation ran their eight-stage assembly for real; treat their
commits as tested prior art, and the behavior contract above as
unchanged.
