---
flow: build
priority: 7
---
# A tmp slot dies with its scope

Every stage gets a tmp slot, and bot points the environment's temp
directory at it deliberately (`bot/src/tools.ts:290`) — correct
containment, with the consequence that everything a stage's
toolchain considers temporary lands there. Scratch keeps it all
forever. On 2026-08-21 one biomcp run retained 22G, of which the
stages' own work — input, output, answers — was about 28 kilobytes;
the rest was tmp. Roughly 130 retained runs multiply whatever tmp
holds. Nobody will ever read a .rlib to learn why a stage refused.

Ian's ruling, 2026-08-21: a tmp slot is deleted when its scope
ends. A stage-scoped slot is deleted when its stage is done; a slot
shared across a flow is deleted when the flow ends; and settlement
of the run deletes whatever tmp remains, so a run that dies
mid-flow leaks nothing. The stage-owned slots — input, output,
answers, skills — are retained exactly as today.

Done, observably: after a stage ends, its stage-scoped tmp no
longer exists; after a flow ends, its shared tmp no longer exists;
after a run settles — success, refusal, or death — no tmp bytes
remain anywhere in its scratch, while the retained slots are
untouched. The deletion is unconditional: the runtime's exit
warning (ticket 0116) gives the agent its chance to save what
matters before this happens, and a refusing or dying stage gets no
warning, which is exactly why the deletion must not depend on one.

The behavior replaced: retained scratch today includes tmp, and any
shipped assertion pinning a whole-scratch listing or size after
settlement is restated to the retained slots. What the record and
sealed outputs promise does not change in any way.
