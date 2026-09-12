# Historical open questions

Archived 2026-09-08. This is an unreconciled historical snapshot, not current direction or status. The [current plan](../plan.md) owns follow-up. Claims below may describe removed behavior or superseded decisions.

Moved here on 2026-07-30, out of the specification documents. The specification
says what the format is; anything still undecided lives here. Ruled questions
are deleted — the specification is where their answers live now. Last swept
2026-07-31, after the adversarial-review pass and the full-corpus tightening
sweep.

## Blocking a first runtime

Nothing. Everything below can be decided while a runtime is being written.

## Skills

- Whether the home has a `skills/` directory shared across every assembly in it,
  making a fourth scope below the assembly.

## The runtime

- Whether the assembly's purpose statement is fixed text or itself templated.
- How the schema is rendered into the prompt for each of its forms.
- Whether `before` and `success` ever get context beyond their slots, the way
  `failure` gets `$CAUSE` and `$REASON`.
- Whether the subflow injection limits (10,000 characters / 100 lines, fixed in
  `subflow.md`) become home-configurable.
- The retention numbers behind `bot prune` — how old, how many kept by
  default. The shape is ruled: report by default, delete only with an explicit
  flag, nothing automated, ever.
- **Provider configuration and the ambiguous-provider refusal.**
  `model-unresolved`'s second arm — "more than one configured provider offers
  it" — cannot be written down: home.md's `config.yaml` grammar has a single
  `provider` key and no provider catalog, so no specified file can express
  "two providers offer this model", and the corpus cannot case it (P5, spec
  issue 6). Deciding the shape of multi-provider configuration (a catalog in
  config.yaml? runtime-side credentials only, per ADR 0013?) decides whether
  that arm is real or should be cut. Until ruled, the arm is untestable.

## The record

- The event vocabulary is handled. ADR 0008 records the initial accepted set. The current vocabulary and field detail live in the specification's `record.md`; the maintained schema ledger and mechanical writer oracle keep the implementation aligned with it.

## The runtime as a project

- **The home agent.** `bot run "what is the weather in Boston"` — no assembly
  named — is the assembly-agent pattern one level up: an agent that reads
  every assembly's purpose statement (progressive disclosure again: names and
  one line each), picks into one or answers directly on the home's model with
  the home's skills. Deferred until the assembly agent works, on the hard
  condition that it shares that exact code path — if it can't, that is the
  signal it doesn't belong.

## Revisit-only-if-it-hurts

- **Warnings as a tier.** Strict whole-assembly validation stands — nothing
  runs unless the whole folder is well formed. Revisit only if
  authoring-in-progress friction proves real.

## Out of scope

No user interface. No queue or scheduler — a work queue is an assembly, not a
runtime feature. No trust mechanism. No assembly discovery by current directory,
no layering, no shadowing. Repetition is `LOOP.md`, and re-running is the
caller's job. No cross-assembly subflows — a run happens inside one assembly.
No retry machinery in the runtime — transport resilience is the agent
library's, and the runtime records what it surfaces. No resume: a dead run is
dead (invariant 44), and invoking again is a new run. No nested loops
(invariant 40) — iteration inside iteration is a flow calling a flow.
