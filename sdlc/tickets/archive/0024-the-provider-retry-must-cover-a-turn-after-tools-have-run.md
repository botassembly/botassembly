---
flow: build
priority: 10
---
# The provider retry must cover more than the first call of a stage

Ticket 0021 added a retry for a provider call that never landed. It
is deployed and it works — inside a window narrow enough that it did
not save either of the two runs that faulted on its first day.

Two runs on 2026-08-12 make an unusually clean natural experiment.
Both faulted in `04-code-review`, both on
`Codex error: Our servers are currently overloaded.`

## The retry firing, and winning

Run `2026-08-12T11-47-14-bc35` (botassembly 0022):

```
12:13:14.961  stage_start    04-code-review/1  read code.txt
12:13:16.383  turn           04-code-review/1  input: 0, output: 0, total: 0, stop: error
12:13:16.384  provider_retry 04-code-review/1  attempt 1, delay 1000 ms
12:13:23.793  turn           04-code-review/1  input: 1655, output: 114, stop: toolUse
```

The error arrived 1.4 seconds after the stage started, before any
tool had run. The retry fired, the call succeeded, and the stage
carried on for another 44 seconds across five tool-calling turns.
The mechanism did exactly what it was built to do.

## The retry not firing, twice

Then, in that same stage:

```
12:13:56.298  turn       04-code-review/1  input: 33621, output: 277, stop: toolUse
12:14:00.018  turn       04-code-review/1  input: 0, output: 0, total: 0, stop: error
12:14:00.019  stage_end  04-code-review/1  exit 2, fault, wrote nothing
```

One millisecond from failed call to fault. No retry. Both fences
were up by then: `retried` was already true, and tools had run.
8.13 million tokens were discarded, with design, design-review and
code all sealed and gated.

Run `2026-08-12T11-47-11-aafd` (sdlc 0065) shows the tool fence
alone. Three assistant messages with `toolCall` blocks and
interleaved `toolResult` messages, then a zero-token error, then the
fault one millisecond later. No `provider_retry` event was ever
written in that run. 5.18 million tokens, same three stages sealed.

## The two limits, both real

The guard is an `every(Boolean)` over five conditions:

```js
if ([message.stopReason === "error", !retried, !tools.started,
     input.config.timeoutMs > budget.milliseconds,
     isRetryableAssistantError(message)].every(Boolean)) {
```

The classifier is not the problem. `overloaded` is on the library's
retryable pattern list and this message matches none of its
non-retryable quota or billing patterns — as the successful retry at
12:13:16 proves directly.

**`!retried` allows one retry per `prompt()` call, ever.** A stage
that hits two blips spends its only retry on the first.

**`!tools.started` closes the window as soon as a tool runs.**
`tools.started` is set by subscribing to `tool_execution_start` for
the duration of one `input.harness.prompt(next)` call, and that call
spans the harness's whole agentic loop rather than a single provider
turn. A stage calls tools within seconds, so in practice the retry
covers only the very first provider call of a stage.

Together those bound the protection to a couple of seconds at the
start of each stage. The failures observed keep landing outside it.

## The tension to resolve, not dismiss

`!tools.started` is not a mistake. Re-sending a prompt whose tools
already executed would run those side effects a second time, and
that is a worse failure than the one being prevented. The guard is
correct for a prompt-level retry.

The conclusion to draw is that the retry is at the wrong layer. A
provider call that returned zero tokens and `stop: error` never
happened, so retrying *that call* re-executes nothing — the danger
exists only when the retry re-sends a whole prompt.

The library already offers this shape: `retryAssistantCall` in
`@earendil-works/pi-ai` takes a `RetryPolicy` of `enabled`,
`maxRetries` and `baseDelayMs`, applies exponential backoff, returns
non-retryable errors immediately, and emits `onRetryScheduled`,
`onRetryAttemptStart` and `onRetryFinished`. Whether the bot adopts
it, wires a policy through to the harness, or keeps its own retry
and moves it down a layer is a design decision. Name the trade-offs
and pick one — and check what the harness actually exposes rather
than assuming the library's shape fits.

## What done looks like

A provider call that returns zero tokens and `stop: error` is
retried wherever in a stage it happens, including after tools have
run and including more than once per stage.

A prompt whose tools have executed is never re-sent wholesale. Side
effects still run exactly once.

When retries are exhausted the run faults as it does now — same exit
code, same cause, same recorded reason — so the queue's settlement
is unchanged.

The record keeps showing each attempt, as it already does. The
`provider_retry` event is what made this diagnosis possible at all,
and it must survive whatever replaces the current mechanism.

## The hard choices

Settled: do not retry a call that spent tokens. Non-zero usage means
the call landed; sending it again pays twice and risks acting twice.

Settled: do not classify by matching provider message text in this
repo. The library owns that list and it is already correct here.

Settled: keep it bounded. A few attempts with growing delay, not a
long ladder. The queue's channel cooldown handles a sustained
outage; this covers a blip narrower than the run. Note that the two
blips above were 44 seconds apart in one stage, so a policy that
permits only one recovery per stage does not fit what the provider
is actually doing.

Settled: this does not resume a faulted run from its last sealed
stage. That would have saved 13.3 million tokens across these two
runs and is worth doing, but it is a larger change to how runs and
records relate and belongs in its own ticket. This ticket prevents
the loss; it does not recover from it.

## Tests

`tests/turns.test.ts` covers the prompt loop and the 0021 retry;
those tests are authorized to be restated, and design should name
the specific titles. Pin: a zero-token `stop: error` after a tool
has executed in the same prompt is retried; a second blip in the
same stage is retried; a prompt whose tools ran is not re-sent as a
whole; a turn that spent tokens is never retried; exhausted retries
fault with today's exit code and cause; every attempt is recorded.

The src line ceiling may rise by at most 30 lines.

## Addendum, 2026-08-12: the reporting boundary is settled here

The first flight refused at `03-code` because the design review
refused approval, and that refusal was correct. It found:

> `providerModels(env, clock)` has no `RecordWriter` or
> `StageIdentity`, while `providerRetryEvent` requires identity and
> `providerModels` is constructed once for a run. The design
> therefore cannot bridge retries to the existing record without
> inventing and specifying a new context/reporting interface.

And:

> The claim that existing turn recording witnesses every
> failed/retried call is false for a wrapper beneath the harness.
> `pi-tap.ts` records only harness `turn_end` messages; suppressing
> an intermediate error so the wrapper can retry means that attempt
> never reaches the tap.

That is this ticket's fault, not the design's. The body above
requires the retry to move below the prompt layer *and* requires
that "the record keeps showing each attempt, as it already does."
Those two demands collide at exactly the seam the review names, and
the ticket left the collision for design to discover.

Settling it, so code can start from a complete contract:

**A new reporting seam is authorized.** Threading a record writer
and stage identity — or an equivalent reporting callback — down to
wherever the retry lives is in scope for this ticket. It is not
scope creep and it is not a second ticket. Design should specify
that seam concretely: what it carries, who constructs it, and what
happens when it is absent.

**Failed attempts do not need `turn` records.** The requirement is
that an operator can tell a one-shot refusal from a genuinely
unreachable provider, and that retries are visible when they
happen. A `provider_retry` event per attempt satisfies that. A full
`turn` record for a call that returned nothing does not, and
manufacturing one would put a zero-token turn in the record that
the provider never produced. If design finds a cheaper honest
shape, take it and say why.

**What must not be lost:** the terminal record after retries are
exhausted stays exactly as it is today — same exit code, same
cause, same recorded reason — so queue's settlement is unchanged.
And a successful retry must not leave the run's token accounting
claiming usage that never occurred.

**On `retryAssistantCall`:** the review is right that it takes a
promise-producing call rather than an event stream, and that its
policy does not enforce zero usage. Treat the earlier reference to
it in this ticket as a pointer to a shape, not an instruction to
adopt it. If a stream adapter costs more than a purpose-built
retry at the same seam, build the purpose-built one. Say which was
chosen and why.

**If the seam still cannot be specified**, refuse again and say
precisely which fact is missing. A second refusal on a named
missing fact is a better outcome than a design that guesses at the
boundary. What is not acceptable is approving a partial workaround
that retries without recording, or records without retrying.

## Tests you are authorized to restate, extended

Unchanged from above, plus: any test in `tests/turns.test.ts` that
asserts the retry is emitted from the prompt layer specifically —
name each such test in design before touching it. The three
authored provider-retry tests from the refused flight's design
stage may be restructured to match whatever seam is chosen, but
must still pin the three behaviors they were written for: a retry
after tools have run, more than one retry in a stage, and no retry
for a turn that spent tokens.

The src line ceiling may rise by at most 45 lines, raised from 30
to cover the reporting seam this addendum authorizes.
