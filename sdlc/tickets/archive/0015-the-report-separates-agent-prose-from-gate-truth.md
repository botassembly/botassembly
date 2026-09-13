---
flow: build
priority: 5
---
# The report separates agent prose from gate truth

An agent's summary can say "all checks passed" while the gates say
otherwise, and today's rendering lets the prose sit where an operator
reads it as fact. The repo's issue
`sdlc/issues/an-agents-summary-can-contradict-the-gates.md` holds the
incident (this ticket deletes it); the 2026-08-10 outside review's
advice is the right frame: do not interpret the prose — label it.

## Behavior

- Refusal addendum (2026-08-10), resolving the boundary the first
  flight rightly refused on: the byte-exact output contract WINS.
  `bot output` and every stored byte (records, outputs on disk) stay
  byte-identical to today — they are data surfaces, not presentation.
  The labeling requirement applies only to human-readable rendering:
  `bot show` and any surface that already formats for a reader. Where
  `bot show` presents a stage's text, it labels it as the agent's
  report and renders the gate verdicts separately as the
  authoritative result; a reader who sees only one thing sees the
  gates. "Stage outputs" in the earlier wording meant their rendering
  inside `bot show`, never the stored bytes — that ambiguity was the
  refusal's cause and this sentence removes it.
- No attempt to detect or flag dishonest prose — presentation, not
  judgment.

## Tests you are authorized to restate

- Rendering/inspection tests may be restated where they pin the
  output layout; verdict-content assertions keep their strength.
- Second addendum (2026-08-10), naming the pin the refusal cited:
  `tests/cli-json-and-show.test.ts` — the `bot show` human-output
  assertion expecting the contiguous "exit 0, success, sealed ..."
  text restates to the labeled shape with the agent-report prefix.
  The JSON-output assertions in that file are data surface and keep
  their exact strength.
- Third addendum (2026-08-10), from the third refusal:
  `tests/show-reading.test.ts` is also named. Its exact `bot show`
  rendering assertions restate to the labeled shape — agent report
  prefixed as the agent's words, gate verdicts rendered separately as
  the authoritative result. Assertions about which content appears
  (verdicts, stage names, stored bytes) keep their exact strength;
  only the human layout may change. No file beyond
  `tests/cli-json-and-show.test.ts` and `tests/show-reading.test.ts`
  may be restated. If the change cannot fit the ceiling, the commit
  message must carry the required justification and the named
  duplication/bloat search rather than silently raising the ratchet.

The src line ceiling may rise by at most 20 lines.
