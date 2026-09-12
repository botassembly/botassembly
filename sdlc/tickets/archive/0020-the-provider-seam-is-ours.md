---
flow: build
priority: 7
---
# The provider seam is ours

Raised by the 2026-08-11 provider-fault investigation
(`notes/pi-adapter-retry-bug.md` and
`notes/botassembly-in-flight-experiments.md` in the workspace
notes). Standing rule: no upstream issues; the fix path is our own
seam.

Three facts motivate one change. The pinned pi adapter's WebSocket
path throws retryable provider overloads immediately while its SSE
path retries them, and bot cannot currently influence transport or
observe the difference. Pi's two harness events cannot honestly
report what happened — they carry the *requested* transport (which
may be `auto`), no attempt number, no retry delay, and the
WebSocket path may emit no response event at all. And pi's modern
provider collection is deliberately mutable: `models.setProvider()`
replaces a provider under its own id, a door bot currently hides
behind a narrower return type in its credentials module.

## Behavior

Bot wraps the Codex provider at its own provider-construction seam:
retrieve the built-in provider, wrap its streaming entry points,
re-register under the same provider id. Nothing in `node_modules`
is touched; the pinned pi version does not change.

The wrapper makes bot the witness of its own provider traffic: for
every provider attempt, the run record gains the facts pi cannot
give us — the transport actually used, the attempt number, the
HTTP status when there is one, the request id when a response
header carries one, and the delay before any retry. `bot show`
renders them. The record specification documents the event.

The wrapper changes no retry or transport behavior in this ticket —
it observes. Behavior comes as ticket 0021, on top of this seam,
so the observability lands even if the policy discussion runs
longer.

## Deferred proofs

- Retry and transport policy at the wrapper: deferred to ticket
  `0021-a-pre-stream-provider-failure-gets-its-retries.md`, which
  exists on this board. Design here leaves policy unauthored and
  the reviewer may not refuse for its absence.

## Refusal addendum, 2026-08-11 (first flight)

The flight refused, and it was half right. It found that a same-id
wrapper registers fine but sees only the options it was handed and
the returned event stream, so pi's retries *inside* one `stream()`
call — and the delay it chose between them — happen below the
wrapper and cannot be witnessed. That is correct, and the fix is to
stop asking for them. Attempt numbering and retry delay for pi's
internal loop are struck from this ticket. Do not author them.

Two things the refusal missed, both on the public surface of the
pinned 0.83.0, and they carry the rest of the ticket:

**`StreamOptions.onResponse`** (`types.d.ts:80`) is a callback the
caller supplies, invoked with a `ProviderResponse` — `status` and
`headers` — after each HTTP response and before its body is read.
The wrapper passes its own, so HTTP status and the request id from
a response header are honestly available, and each call is one
observed HTTP attempt. `SimpleStreamOptions extends StreamOptions`,
so this reaches both entry points. Bot sets no `onResponse` today.

**Transport is an input, not a mystery.** `StreamOptions.transport`
takes `"sse" | "websocket" | "websocket-cached" | "auto"`. The
record cannot honestly report a transport pi selected, but bot can
stop leaving the choice open: pass an explicit transport and the
requested one *is* the used one. Bot sets no transport today, which
is why the record has nothing true to say.

That is a behavior change, and it contradicts the sentence above
saying this ticket only observes. Take this addendum over that
sentence. Choosing the transport explicitly is the smallest change
that makes the record honest, and honesty is what this ticket is
for. Which transport bot asks for is a policy question and belongs
to 0021; this ticket only requires that the choice be explicit and
recorded. If the design believes a defensible explicit default
cannot be picked without 0021's discussion, say which one it picked
and why, rather than reverting to `auto`.

**WebSocket failure metadata** is struck as worded — bot cannot see
inside a socket it does not open. What it can witness is its own
experience: the wrapper called in, no response event ever arrived,
and the stream ended this way after this long. Record that as a
fact about what bot saw, never as a claim about the connection.
That is precisely the signature of the fault under investigation,
so the narrower fact is the useful one.

Nothing here needs `node_modules` touched or anything raised
upstream. If some remaining piece still cannot be done honestly
within the public surface, refuse again and name the specific
declaration that blocks it, with its file and line.

## Second addendum, 2026-08-11 (planning seat's challenge)

The planning seat challenged both facts the first addendum added.
Both challenges land, and reading the pinned adapter to answer them
turned up something better than either. Read the pinned
`node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js`
alongside this section; line numbers are from 0.83.0.

**`onResponse` is SSE-only. Confirmed.** It is invoked at line 288,
inside the HTTP branch. The WebSocket path never reaches it. So the
per-attempt HTTP observability the first addendum promised exists
only on the transport that is not the suspect. Do not build the
design around it as though it covers both.

**"Requested is used" is false. Confirmed, and worse than assumed.**
Line 189 reads `options?.transport || "auto"`, but line 191 then
disables WebSocket for the whole session when a previous failure
recorded a fallback, and line 247 records one after any WebSocket
failure before stream start. The fallback is sticky per session, so
a request that explicitly asks for `websocket` can silently run over
SSE because of something that happened on an earlier request. Never
record the requested transport as the used one.

**The adapter already publishes the truth.** Line 236 appends an
`AssistantMessageDiagnostic` of type `provider_transport_failure`
carrying `configuredTransport`, `fallbackTransport`, `eventsEmitted`,
and `phase` — the last being `before_message_stream_start` or
`after_message_stream_start` — plus the error's name, message, and
code and a timestamp. It rides on `AssistantMessage.diagnostics`,
a public typed field (`types.d.ts:296`) on the message the wrapper
already receives.

That is the WebSocket failure metadata this ticket asked for and
that the refusal declared unavailable. It is not observation of
pi's internals; it is a fact pi publishes.

So the record's transport field comes from the diagnostic when one
is present, and is labelled as *requested* when none is. Both are
honest, and they are honestly different. Setting an explicit
transport is still worth doing — it removes `auto` from the
question — but it is no longer the source of truth, and the first
addendum was wrong to treat it as one.

If reading `diagnostics` turns out not to reach the wrapper on the
failure path that matters, refuse again and say where the message
is lost.

## Tests you are authorized to restate

- `tests/pi-tap.test.ts` — assertions about how bot attaches to
  pi's event stream, only where the wrapper changes their shape.

The src line ceiling may rise by at most 45 lines.
