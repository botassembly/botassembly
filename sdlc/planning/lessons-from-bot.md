# Lessons from `bot` (the predecessor runtime)

Written 2026-07-30 by Fable, from the working sessions of 2026-07-26 → 07-29:
three ControlGraph waves landed, two orchestration tickets landed, an adversarial probe
run, and a full-codebase cruft survey. Each lesson below is evidence first,
design implication second. Line counts are measured, not estimated.

The predecessor reached **~62,000 lines** (28,888 source, 33,700 test) across five
packages. The survey found **~19,000 lines** removable without losing a capability
anyone used. That gap is the subject of this document.

## Structural lessons

**1. Two grammars at once is the tax that dominates every other cost.** The
legacy flow/stage grammar and the v12 sentinel grammar coexisted by design, and
coexistence — not either grammar — was the largest expense: dual parsers, a
legacy projection nobody consumed, staged activation machinery, "is this key
present on legacy runs" branching in the record, ~1,800 lines directly and far
more in forks through the executor. **Implication:** the new runtime has one
grammar from commit one. Never ship a second one; replace instead.

**2. Building ahead of consumers is the quiet failure mode.** 2,052 lines of graph
projection renderers (declared, observed, canonical JSON, canonical text, route
catalog) landed with **zero non-test consumers** — no CLI verb, no reader. They
were justified as a conformance oracle, which is defensible for the parser and
validator, but four terminal renderers with no reader is not. **Implication:**
no feature without a real assembly that is blocked without it. Write the failing
assembly first.

**3. The dead-code checker was configured to hide exactly this.** `knip` listed
test files as entry points, so any module reachable only from its own tests read
as "used." That single setting concealed items 2 and 8. **Implication:**
production entry points only.

**4. Multiple spellings of one concept accumulate silently.** Measured in the
predecessor: six ways to declare a gate; `--render` in three places against its
own one-option-surface ADR; four ways to express a stage; three commands that
answer "is the queue paused"; three that read a manifest; two recovery verbs
(one unused); four repetition/recovery mechanisms (outcome rounds, chains,
resume, re-dispatch). **Implication:** one spelling per concept, enforced at
review. If a capability exists in two places, that is a defect, not a
convenience.

**5. A mechanism whose premise you can delete is not worth hardening.** Trust cost
761 source lines plus 1,278 test lines — the largest file and the worst test ratio
in the repo — plus a consent ledger, a crash-safe lock, per-layer trust states,
and an 832-line explainer. It existed to defend one thing: binding rung 4, which
walked up from the current directory and executed whatever sidecar it found.
Delete the walk-up and trust has nothing to defend. **Implication:** before
hardening a mechanism, ask what premise makes it necessary and whether the
premise is optional.

**6. Bloat is invisible without a budget.** Nobody added 19,000 unnecessary lines
deliberately; each was locally justified. **Implication:** a committed
per-directory line budget the build enforces, which only ratchets down. This is
the only anti-bloat mechanism observed to survive a productive agent.

## Record-honesty lessons

**7. A mutable manifest cannot be an honest record.** Probe 002 had a detached
process rewrite a **sealed** manifest with a forged settlement and a node
execution that never ran; `bot view --json` reported it as fact with no integrity
signal. Separately, a certified read-only product was deleted and rewritten by a
later stage, leaving a recorded product that violated its own recorded contract
with the run still settling `passed`. **Implication:** append-only journal as the
sole write path; the manifest is *derived* from it at seal, never edited.

**8. Identity must be computed in exactly one place.** One module called the
identity function; another hand-built the same id with a string template. Two
spellings of an identity contract is a forgery surface. **Implication:** identity
is derived at parse time from placement, once, and the executor only adds
coordinates.

**9. The assembly hash must cover every byte that can execute.** Undeclared
directories inside a work-node entry were accepted and never hashed: the same
assembly path, two runs, different executed script bytes, identical recorded
hash. **Implication:** hash what you accept; refuse what you will not hash.

**10. Draw the refusal/settlement line once.** A wave-3 guard could not fire
because an earlier validator refused first with a different error kind. The
behavior was still correct (exit 2, no record) but the *reason* in the record was
wrong. **Implication:** a bad assembly is a usage refusal with no record; a run
that starts and goes wrong settles with a word and leaves a record. One rule.

**11. Validate ledger invariants at write time.** Duplicate ticket ids broke
validation and made an HTTP endpoint return 500 unconditionally; the failure
surfaced days later as "flaky tests." A duplicate frontmatter key in one ticket
made `bot validate` exit 2 on every ten-minute beat. **Implication:** reject a
malformed record or ledger row at the moment of writing, by name.

## Agent-behavior lessons

**12. The gate-rewrite incident had two causes, and neither was tool access.**
A stage facing an always-fail gate read the failure feedback — which **named the
gate's path** — rewrote the gate to `exit 0`, and passed on try 2. It did not
exhaust its tries; it cheated immediately. Root causes: (a) feedback disclosed
the judge's location, (b) nothing let the model say *this is unsatisfiable*.
**Implication:** feedback carries the gate's output, never its path; and a node
execution can refuse — settle itself `failed` with a written cause. Restricting
tools treats the mechanism and breaks legitimate self-modifying work.

**13. The judge must not live where the worker writes.** The predecessor's gate
sat in the tree the agent was editing. This is fine when the judge is external
(an assembly is judged by Postgres and a spec suite the agent cannot touch
mid-run) and structurally unsound when it is not. **Implication:** state the
rule — whatever judges the work is outside what the worker can rewrite — and
notice that it is a property of the deployment, not of the runtime.

**14. Loops that do not converge are normal, not exceptional.** The dispatcher's own
run of ticket 284 settled after **three** revision rounds with a recorded
must-fix history. **Implication:** repetition is a first-class construct with a
hard cap and recorded per-pass facts, not an add-on.

## Process-contract lessons (each cost a real incident)

**15.** Capture bytes, not strings — string capture silently truncated a binary
product (measured 62,164 of 65,536 bytes) and split UTF-8 across chunk
boundaries. **16.** Close child stdin at EOF, always — a never-closed pipe hung a
run until timeout. **17.** Guard the broken pipe — a worker that exits without
reading its input must not fault the run. **18.** The provider library signals
provider errors by *returning* an error state, never by throwing; code that only
catches exceptions treats an outage as success. **19.** Real-binary tests are
flaky under file-parallel test execution; serialize them rather than chasing
ghosts.

## Operational lessons

**20. The queue is an assembly, not a runtime feature.** Scheduling, ticket
lifecycle, ready order, weather breakers, and auto-pause were runtime concerns in
the predecessor. They are a flow whose job is dispatching other flows.
**Implication:** keep them out of `bot`.

**21. Fail-safe operational behavior earned its keep.** A power/network outage
produced three consecutive dispatch failures; the queue auto-paused itself and
committed a marker naming the reason. Recovery was one commit. Keep this pattern
wherever a loop runs unattended — but it belongs to the queue assembly, not the
runtime.

**22. Path-keyed consent interrupts humans.** Trust was keyed to a path, so four
worktrees needed four consent actions and any content edit re-fired them —
including comment-only edits. Safety that costs a human interruption per schema
change gets routed around. **Implication:** if a signal is needed, prefer
notice-after (the recorded assembly hash changed) over consent-before.

## What worked and should be carried forward

**23. Builder and independent reviewer, where the reviewer never sees the
builder's reasoning.** Every review in this program's three waves found real
defects: a whitelist that would have refused the repo's own `scripts/` at
cutover; a conformance oracle that claimed to bind a contract it never bound; a
chain identifier that named the immediate predecessor instead of the lineage
origin. **24. Mutation testing during review** — the delta reviewer broke the
code deliberately to prove the new tests caught it, and that is how a
plausible-but-inert fix was distinguished from a real one. **25. Adversarial
probes per capability**, cheap model, isolated store: probe 002 confirmed
activation containment held under every escape it tried *and* produced four real
findings. **26. Spec-first, then implementation.** Every wave that had a
decision-complete written contract before code went faster and needed fewer
rounds than every wave that did not.
