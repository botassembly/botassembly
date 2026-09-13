# The extension surface — what Pi's ecosystem teaches, and what we should offer

**A study, not a decision.** Written 2026-08-07 at Ian's direction: read
Pi's own extension API and the ~30 community extensions in `~/foss`, then
think without a budget about every place a deterministic script could
plug into an assembly. Nothing here is ruled. No ticket exists for any of
it. The ranking at the end is the driver's recommendation and Ian's to
overrule.

## 1. What was read

**Pi's own surface** (`~/foss/pi`, `packages/coding-agent/docs/`): 33
subscribable events, custom tools, slash commands, keybindings, CLI
flags, custom providers, themes, skills, prompt templates, a TUI
component API, and an SDK. Extensions are TypeScript modules loaded by
jiti, subscribing through `pi.on(event, handler)`.

**The ecosystem** (~30 repositories under `~/foss/pi-*` and friends):
what people actually built with that surface.

## 2. The five findings that matter

**(a) Seven independent teams built the same thing.** pi-steering-hooks,
pi-gatekeeper, security-harness-pi, pi-permission-system (and a full
fork of it), pi-opa, pi-sandbox, pi-bash-readonly — all intercept
`tool_call`, classify what the agent is about to do, and allow, ask or
block. Three of them independently converged on parsing bash with
tree-sitter and failing closed when the parse is uncertain. This is the
loudest signal in the entire survey: **deterministic interception of an
agent's tool calls is the single most-wanted thing in an agent runtime,
and Pi does not ship it.**

**(b) Somebody reimplemented shell hooks on top of Pi.** `my-pi` carries
`hooks-resolution.ts`, a from-scratch implementation of Claude Code's
`PostToolUse` shell-hook protocol — matcher regex, JSON on stdin, ten
minute timeout — because Pi has no way to call an ordinary script at a
lifecycle point. **Bot Assembly's entire extension model is that
mechanism.** What that ecosystem bolts on, we already are.

**(c) Config layering was reinvented six times.** Global versus project
versus per-agent frontmatter, last-match-wins wildcards, each with
slightly different rules, in six separate repositories. Our eight-rung
option ladder is that problem solved once, in the specification, with
`bot check` able to say which rung won before anything runs.

**(d) Testing extensions is the ecosystem's loudest complaint.**
`pi-test-harness` exists solely because in-process TypeScript handlers
wired into a live agent session cannot be tested without mocking so much
that the test stops meaning anything. A gate is a program that takes a
file and exits — it is testable by running it.

**(e) The honest ones publish their limits.** security-harness-pi's
threat model and pi-bash-readonly's limitations page both concede that
static classification cannot stop write-then-execute races, dynamic
interpreter content, or socket escapes, and both recommend layering with
OS isolation. If we ship interception, we say the same thing in the same
plain words. A gate is a policy instrument, not a sandbox.

## 3. Why we should not copy Pi's event list

Pi is a **session**: one agent, one conversation, a human at a terminal.
Roughly half its events exist to serve that — `input`, `user_bash`,
`message_update` streaming, compaction, session fork and tree
navigation, model and thinking-level selection, and the whole UI
context. None of it has a meaning here.

Bot Assembly is a **graph**: many stages, in a structure written down
ahead of time. That gives us hook points Pi cannot have, because Pi has
nothing to hang them on — no branch to route, no parallel to join, no
loop whose next turn is a decision. Those are worth more to us than most
of Pi's list.

And our protocol is not an API. It is: a process, its arguments, a few
environment variables, an exit code, and whatever it printed. That is
five things to keep stable, against Pi's 33 typed events. **A hook
written for us in 2026 will still run in 2036**, which is the
file-over-app thesis applied to extensions.

## 4. Everything that could exist

Organized by level and moment. Bracketed marks: **[have]** exists today,
**[gap]** does not.

### Per tool call, inside a stage

- **`tools` gate [gap]** — the framework calls a program before each tool
  call with the tool name and its arguments; exit 0 allows, non-zero
  blocks and the printed text becomes the tool's result the agent reads.
  Same shape as `gate`, one level down. The record already writes a
  `tool_call` event, so we observe what we cannot yet refuse — that
  asymmetry is the tell.
- **`tools` result filter [gap]** — rewrite or truncate what a tool
  returns before the agent sees it (redact secrets out of a file read,
  cap a huge output). Pi's `tool_result` middleware; used by the
  telemetry and redaction extensions.

### Per stage

- **`before` [have]** — prepare `$INPUT`.
- **checklist, schema, `gate` [have]** — the three checks.
- **`success` / `failure` [have]** — after the fact.
- **`retry` [gap]** — between a failed check and the agent's next
  attempt: add context the agent should have (the last three similar
  failures, a reference example). Today the check's own output is all it
  gets.
- **`model` [gap]** — choose the model for this stage from the input
  (cheap for short, expensive for long). **Costs us `bot check`'s
  promise**: check could no longer say which model would run without
  executing a script. Real conflict, stated here so nobody proposes it
  without seeing the price.
- **`budget` [gap]** — called between turns with what has been spent;
  non-zero ends the stage. The deferred run-budget feature, in hook
  form.

### Per container — the ones only we can have

- **`choose` [gap]** — a CHOOSE alternative picked by a program instead
  of an agent. Prints the alternative's name, exits 0. **Saves an entire
  model call per decision**, makes routing auditable, testable, and
  free. The highest-value idea in this document for non-coding work.
- **`iterate` [gap]** — a LOOP's continue-or-stop decided
  deterministically ("stop when the test suite passes"), instead of by
  the agent's own judgment against a repeat limit.
- **`join` [gap]** — PARALLEL's branch outputs merged by a program
  (dedup, reduce, concatenate in a fixed order) instead of handed to an
  agent to merge.

### Per flow

- **`before` / `success` / `failure` [gap]** — today the spec says a
  hook belongs to one stage, and a flow wanting its request normalized
  puts a `before` on its first stage. True, but it couples policy to a
  particular folder: reorder the stages and the hook moves, and with
  parallel or subflows "the first stage" stops being obvious.

### Per assembly / per run

- **`before` / `success` / `failure` [gap]** — once per run: prepare a
  worktree, publish the result, notify, clean up.
- **`hold` [gap]** — block until a file appears. **The file-over-app
  answer to a permission prompt**: an approval gate with no interactive
  mode, no daemon, no UI — write `APPROVED` at a path and the run
  proceeds. What makes high-stakes and regulated work possible without
  becoming a chatbot.

### Things we should refuse, and why

- **Prompt rewriting.** Pi's `context` and `before_agent_start` let an
  extension rewrite what the model sees. It would break the promise the
  guides open with: the folder says what the work is. A prompt no one
  can derive from the files is a prompt nobody can review.
- **Output transformation.** Already ruled: gates do not write, hooks do
  not transform, work is a stage's job. The ecosystem's own experience
  supports it — the extensions that rewrite results are the ones whose
  authors document surprising behavior.
- **Telemetry hooks.** Three separate OpenTelemetry extensions exist in
  that ecosystem because a Pi session's events live only in memory. Our
  record is JSONL on disk, already. The answer is a documented tailing
  pattern, not a hook.
- **Everything session-shaped** — input rewriting, human bash
  interception, compaction, fork and tree navigation, streaming
  interception. No meaning in a graph that runs unattended.

## 5. The ranking

Value against fit against cost. The first three are the ones the driver
would actually cut tickets for.

1. **`tools` gate.** Proven demand (seven implementations), exact shape
   match to `gate`, and the answer to the first question every serious
   user asks. Ship it with an honest limits paragraph.
2. **`choose` hook.** Unique to our shape, removes a model call from
   every deterministic routing decision, and it is the difference
   between "an agent reads the email and decides" and "the sender's
   domain decides, in a program anyone can read."
3. **Run-level and flow-level `before` / `success` / `failure`.** Small,
   obvious, removes an awkward coupling the spec currently admits to.
4. **`hold`.** The approval gate. Unlocks a category of user we cannot
   serve at all today, without an interactive mode.
5. **`join`.** Deterministic merge of parallel branches.
6. **`iterate`.** Deterministic loop control.
7. **`retry`.** Enrich the input between attempts.
8. **`budget`.** The deferred feature, in hook form.
9. **Tool result filtering.** Real value (secret redaction), but the
   first thing on this list that can silently change what an agent
   believes, so it wants its own design pass.
10. **`model`.** Interesting, and it costs static check. Not worth it.

## 6. What the use cases ask for

Sampled deliberately across the kinds of work an assembly might do, and
the pattern is consistent.

- **Coding** — `tools` (no force push, no writes outside the worktree),
  `gate` (tests, lint, coverage), `choose` (language or subsystem
  routing), run-level `success` (open the pull request).
- **Email triage** — `choose` carries almost everything: sender domain,
  headers and attachments decide the flow, with no model call at all.
  `tools` confines what can be sent. `hold` before anything leaves.
- **Customer support** — `choose` for tier and SLA routing, `gate`
  requiring the reply to cite a real knowledge-base article (a grep, not
  a judgment), `hold` on refunds over a threshold, `success` to post.
- **Claims and document processing** — `choose` on document type by
  content, `schema` for extraction, `gate` for arithmetic that must
  reconcile, `failure` to route the exceptions to a human queue.
- **Research and analysis** — PARALLEL with a `join` that dedups
  deterministically; LOOP with an `iterate` that stops on a coverage
  threshold rather than on the agent's satisfaction.
- **Regulated and high-stakes** — `hold` at every boundary, `tools` for
  data egress, and the record as the audit trail it already is.

**The unifying observation: outside coding, the most valuable hook is
the one that keeps a model out of a decision that was never a
judgment.** That is `choose`, and it is the cheapest and most auditable
thing on the list. The second most valuable is the one that stops an
agent doing something irreversible — `tools` and `hold`.

## 7. The Pi-extension question Ian asked

Two directions, and the interesting one is not the obvious one.

**Inbound** (a Pi extension that gives Pi our features): unnecessary for
us. Our runtime calls pi-ai the library, not the Pi coding agent, so
`tools` interception belongs at our own tool-dispatch seam, not behind
someone else's event bus.

**Outbound** (a Pi extension that gives Pi *our gates*): genuinely
attractive. `pi-botassembly-gates` would let an interactive Pi session
run a repository's own `gate/` folder against what the agent just wrote
— subscribing to `tool_call` or `turn_end`, invoking the same
executables, feeding the same printed reasons back. It costs one small
repository, it makes our gate format valuable to people who never run an
assembly, and every gate written for Pi is a gate that already works
here. Worth remembering when we want distribution; not worth doing
before v1.

## 8. What this study does not answer

Whether any of it should be built. The measured cost of each, which
wants the study-first treatment tickets 0149 and 0154 established.
Whether `tools` interception belongs in the specification as a stage
concept or as a runtime concern. And the one question no reading can
settle: which of these the users arriving tomorrow will actually ask
for.
