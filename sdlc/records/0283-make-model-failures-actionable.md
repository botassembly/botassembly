---
base: 28e29cf4ed2912d9439017da8b23d6fcff692af8
head: 2b01f98684195c0ded85700bb26c024d7c75ef0f
---

# Model failures name the model, the rung, the cause, and the next action

Every model failure at admission or run time now names the authored model
string, the rung it resolved from, the immediate cause as far as the runtime
knows it, and one next action. A catalog miss states the catalog Bot read and
no longer claims that no provider anywhere offers the model. The no-credential
case became a pre-birth refusal under the new code `credential-missing`,
declared runtime-only in `refusals.md` in the declared sentence form. Every
field in the JSON refusal envelope is bounded at 512 bytes.

The unreachable value-missing admission shape is deleted, with evidence that
home configuration drops a modelless intelligence row before a node under it
can be reached. The conformance runtime-only pin now requires a byte-exact
stderr test that declares the code as a `RefusalCode` from `spine.ts`, anchored
so a commented-out declaration fails the pin. `bot assembly check` stays
Pi-free under record 0270 and makes no availability claim.

Independent design review accepted the contract after two rejections. The
first found a check-side item that would have reversed ticket 0270's Pi-free
contract, duplicate conformance work already owned by ticket 0282, an
incomplete JSON contract, and an unexplained post-birth credential fault. The
second found the new code needed a conformance closure exemption. Independent
code review accepted the implementation after one rejection, whose findings
were unbounded envelope fields, an untested admission shape, a string-grep
pin, and two weakened tests, plus one minor regex-anchoring fix made before
landing.

The complete local gate ran spec, lint, and test rungs separately in the
foreground on the amended commit: 214 files, 1,730 tests, all 143 conformance
cases, and static checks. The ratchet moved from 18,733 to 18,817 nonblank
lines. Hosted runtime run `34850112117` and hosted docs run `34852836201`
both passed; docs run `34850112390` on this same commit was cancelled when a
later push superseded the queue, and `34852836201`, which builds the site
including this ticket's two page changes, is the run that qualifies them.

Two limits stay open. Bot's only offline credential evidence is what Pi's
`getAvailable()` reports, so a credential Bot cannot see refuses a run that
might have succeeded. A provider's own error report still embeds verbatim and
unscrubbed in the fault sentence, recorded for the release ticket in
`sdlc/issues/2026-09-14-provider-report-unscrubbed.md`.
