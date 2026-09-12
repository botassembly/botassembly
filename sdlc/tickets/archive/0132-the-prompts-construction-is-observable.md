---
flow: build
priority: 4
---
# The prompt's construction is observable

The harness-contract standard's hardest demand: for any turn, "what
did the model see, and where did each piece come from." Today the
pieces exist — the sealed assembly copy in the run directory, the
stage markdown, the lent skills, the request, the session transcript
itself — but their composition is re-derived knowledge held only by
the harness source. A reader who wants the resolved context must
guess, and a guess is the one thing an observation layer may never
do.

Done looks like: for any stage attempt, a reading answers with the
ordered decomposition — which sources composed the prompt (assembly
and stage files, skills, request, harness defaults) and each one's
bytes or path — sourced from what the run already retains wherever
possible. Recording additions are made only where a piece's origin
is not recoverable from retained artifacts, and each addition names
the piece it carries. The reading joins the existing inspection
verbs; it does not spawn a parser of sessions beyond the readers
that already exist.

The proof must cover both a root stage and a later stage. It may not
label every first turn as the original request: later stages inherit
named prior outputs. It must account for every source the runtime
actually composes, including flow procedure text, output schemas,
helper descriptions, and workspace context when present, so an
unrepresented source makes the design incomplete rather than leaving
the reader to guess.

Hard choices, settled: decomposition, not duplication — the reading
points at retained bytes (sealed copies, session files) rather than
re-embedding them; turn-level reconstruction is the session
transcript's job and stays there — this ticket answers the
*construction*, the transcript answers the *sequence*; old runs say
what is recoverable and what is not, plainly; default text outputs
unchanged, new facts ride `--json`.

Old-run representation is settled: `bot show --json` remains the raw,
byte-identical event stream and never invents fields. The derived
prompt-construction inspection returns an explicit unavailable result
with the reason that provenance was not recorded when a historical run
lacks the new event data. That derived result, rather than a synthesized
raw event, is how old runs say what cannot be recovered.

Consumer: deck's run and session pages — the "how was this prompt
built" section. This ticket is the long pole of the
harness-contract track; deck's rendering of it files only after
this lands.

## Refusal amendment — 2026-08-26

The recorded construction must describe the bytes the first model turn actually receives, not the inputs that existed before stage preparation. Build the provenance after the stage's `before` hooks have finished rewriting the input directory, from the same resolved inputs used to construct that first turn.

Harness-injected prompt descriptors are sources too. The reading must name them explicitly alongside files and inherited outputs; it may not omit a descriptor merely because the harness generated it rather than reading it from the input directory.

One integrated proof must exercise both conditions together: a `before` hook rewrites the prepared inputs and the harness injects descriptors, then the inspection reading is compared with the actual first-turn construction. Separate tests that prove only one half do not close this gap. This amendment changes no session parsing, text output, or historical-run boundary stated above.
