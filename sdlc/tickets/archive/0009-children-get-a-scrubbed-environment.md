---
flow: build
priority: 5
---
# Children get a scrubbed environment

## The ruling this ticket implements

Ian ruled on 2026-08-09 (resolving the credential-boundary issue,
which this ticket closes): ADR 0017 stands — bot's credential source
is its XDG credentials.json, and BOT_AUTH stays retired. The half of
the issue that was true regardless of the ruling is this ticket: the
environment bot hands its children currently includes whatever
credentials the caller's environment happens to carry.

## The exposure

Bot passes the caller's environment to agents, gates, and hooks
(specification/elements/runtime.md). Bot also accepts
provider-specific environment credentials (bot/src/credentials.ts).
So an operator whose shell exports a provider key runs every agent
with that key readable — and an agent that can read the model key can
exfiltrate it in a commit it is authorized to push. The filesystem
authority model (queue ADR 0013, "the machine is the sandbox") ruled
on files; it never ruled that agents see credentials.

## Done when

- Bot consumes credentials in the parent process — the XDG file, plus
  any provider-specific environment variables it recognizes — and
  wires model authentication from that snapshot.
- The environment handed to agents, gates, and hooks has every
  recognized credential variable removed. The variables bot itself
  recognizes in credentials.ts define the minimum scrub list.
- Each child kind gets its environment through an explicit per-child
  allowlist or scrub step in one place, so the next credential
  variable added to credentials.ts is scrubbed by construction, not
  by remembering.
- A test proves an agent, a gate, and a hook each observe a scrubbed
  environment while the model call still authenticates.

## Existing tests that pin current behavior

bot/tests/auth-snapshot.test.ts pins BOT_AUTH being ignored and
RETAINED in the child environment. The retention half pins the
behavior this ticket changes; this ticket authorizes restating those
assertions through design/design-review commits.

## Out of scope

- Queue spreading its environment into lifecycle scripts: those
  scripts are the repository's own operator-authored code, not the
  untrusted party. Revisit only if a real exposure shows up.
- Any sandboxing or distribution proposal. The machine-as-sandbox
  filesystem model is unchanged.
