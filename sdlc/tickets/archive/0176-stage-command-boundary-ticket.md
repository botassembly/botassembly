---
flow: build
priority: 7
---
# A stage can enforce its model-facing tool and path boundary

Stage instructions can ask an agent to use only supplied evidence and named commands, but Bot currently offers unrestricted file and shell tools regardless of that contract. Trials8 run `2026-08-29T03-04-55-b55a` demonstrated the consequence: Research inspected tool implementation and repeatedly reconstructed temporary paths, while Normalize enumerated its whole batch, used inline Python as application code, and reopened a roughly 50 KiB generated output. The prompts already prohibited most of that work. Remembered instructions did not protect the context window.

Done, observably:

- An assembly stage can declare a model-facing access boundary for the tools and managed paths it needs.
- Bot refuses a model tool call outside that declared boundary before file contents or command results enter the model context.
- The policy can distinguish the managed input, output, temporary, skill, and working-directory slots rather than depending on their concrete temporary paths.
- Automatic before, gate, success, and failure hooks retain the access they need; the model-facing boundary does not silently narrow hook execution.
- A denied call is a bounded, typed result that explains which declared boundary stopped it without exposing the denied file or command output.
- The sealed run record and `bot explain` show the boundary offered to the stage and summarize denied calls, including an incomplete or exhausted stage.
- Existing assemblies that declare no boundary retain their current behavior. A compatibility test proves that this feature does not silently restrict them.
- Tests prove that an allowed evidence read and allowed project command succeed, while an undeclared implementation read, broad directory discovery, direct output reopening, and undeclared shell application code are stopped before their results reach context.

Hard choices, settled: this is enforcement at Bot's model-tool boundary, not a claim that Bot observes or filters every operating-system syscall. The declaration belongs to the assembly because each stage knows its own work. Denying the model must not deny deterministic hooks. Compatibility is opt-in so currently deployed assemblies remain runnable while consumers adopt the contract deliberately.

Trials8 is the first consumer. After this behavior is landed and deployed, Trials8 will declare its Librarian stages' existing narrow input and command contracts and rerun its sealed five-trial replay. That consumer change is not part of this ticket.

Boundary: do not change Trials8, clinical data, provider configuration, intelligence selection, stage semantics, or domain tools. Do not infer access from prompt prose; enforcement uses an explicit assembly contract.
