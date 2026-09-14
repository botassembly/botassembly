---
flow: build
priority: 2
deps: []
---
# Align assembly checking

## Outcome

`bot assembly check` reports the complete static procedure a run can reach within Bot's fixed subflow-call ceiling. It names each flow definition and each node once, preserves resolved node options, and states authored and runtime limits without predicting dynamic choices. `DESCEND.md` accepts `max-depth` from 1 through 11 because a root flow starts at depth 1 and Bot separately permits ten child calls.

## Current facts

- `max-depth` accepts every safe integer of at least 1. A value above 11 passes checking even though the ten-call runtime ceiling prevents the authored self-chain from reaching it.
- The runtime hardcodes the mixed-flow ceiling of ten in `scopedSubflows`. The accepted initial flow is call position 0, so ten child calls can reach descent depth 11.
- Assembly checking already walks child flows to find faults. It renders each child through a fresh child invocation, then discards the child's rows. Current output therefore omits subflow stages and leaves their resolved options invisible.
- The current output calls every row a stage. Containers are already rows, while flow definitions are absent. Same-named nodes in different flows would be ambiguous if child rows were appended without an explicit flow identity.
- A model or fan-out may select a subflow at runtime. Loops repeat, choices select one alternative, and fan-out item counts come from input. Static checking can report the admitted definitions and bounds but cannot report one future execution order or count.

## Scope

- Define one pure shared constant for the maximum mixed-flow child-call chain, 10, and derive the maximum authored descent depth, 11. Use the same facts in graph validation, runtime scope exhaustion, checking output, help, and maintained documentation. Do not change the runtime's ten-child-call behavior.
- Validate `max-depth` as a safe integer from 1 through 11. Values 0, 12, fractions, strings, and unsafe integers fail with `value-invalid` at the `DESCEND.md` path. The human repair sentence names the 1-through-11 range.
- Replace the check renderer's silent child-output discard with one deterministic static procedure. For a named-flow check, emit the selected flow first. For a flowless assembly check, keep the assembly-agent row first. Then emit other reachable flow definitions in bytewise path order. Emit one definition row immediately before that flow's node rows. Within a flow, preserve authored static sequence order and the current container expansion order.
- A flow is reachable when the selected assembly agent or an agent node in a reachable flow can name it through the effective assembly, flow, or stage scope, or when a reachable `FANOUT` names it, within ten child-call edges from the selected root. Use the same name-shadowing rules as runtime scope. Track traversal states by flow identity, mixed-flow call position, and consecutive self-call depth. Deduplicate emitted definitions and nodes separately. This must discover a same-named flow-local definition that a `DESCEND` self grant hides at lower depths and reveals at its maximum, respect a stage-local override of that self grant, and retain a shared flow reached at different call positions near the ceiling. A `DESCEND` self-call does not duplicate its definition or nodes. Use a bounded state queue; do not enumerate execution paths. Definitions reachable only beyond the fixed ceiling are validated as part of the assembly tree but do not appear as reachable procedure rows. Do not scan unrelated folders or infer calls from prompt text.
- Keep `data.stages` as the paged row list and schema version 1 under the pre-release change-in-place policy. Add `flow` to every named-flow node row. Its value is the flow's assembly-relative path and disambiguates equal node names. The assembly-agent row remains `stage: "assembly"`, `type: "ASSEMBLY"`, with its current scope and resolved options.
- Add one definition row per reachable named flow. It carries `stage` as the assembly-relative sentinel path, `flow` as the flow path, and `type` as `FLOW` or `DESCEND`. Every definition row carries `max_subflow_calls: 10`; a `DESCEND` row also carries its authored `max_depth`. It carries no synthetic input, output, files, or model options because a definition does not execute an agent.
- Preserve current node facts. Ordinary stages and agent-running choices retain fully resolved option bundles. Containers retain their authored `repeat` or `width`; fan-out retains `width` and `max_items`. Stage-local skills, files, workdir, input, and output remain. Do not invent token, time, disk, branch-selection, loop-continuation, call-count, or fan-out item-count predictions.
- Child flow option resolution does not inherit the selected root's command or task rungs. It uses that child's sentinels, assembly, home, and defaults exactly as a run does. A node reached only as a child carries that bundle in `options`. If the selected flow can also re-enter through a self-call or cycle, keep its selected-root bundle in `options` and add `child_options` with the separately resolved child bundle. Validate both contexts and report either context's faults. Do not duplicate the node row.
- The selected root's first input keeps its retained `request.<extension>` name. A child flow's request extension depends on the runtime call: inline input becomes text, fan-out input becomes JSON, and file input preserves a dynamically chosen admitted extension. Use the schematic source `request.<runtime>` for a child-only flow instead of copying the selected root extension. If the selected flow can re-enter as a child, keep the root source in `input` and add `child_input` only where the child-context source differs. The placeholder describes a runtime-owned request artifact and is never a filesystem path or predicted extension. The static reachability walk must not change validation coverage or fault codes for definitions omitted from the reachable report.
- Page the combined definition-and-node row sequence through the existing limit, cursor, byte, and summary boundaries. `summary.matched` counts all reported rows. Continuation produces no duplicate or omitted row. Human output distinguishes flow-definition rows from executable node rows and includes each named-flow node's flow identity.
- Update the specification, conformance cases, help, maintained guides, all checked-in example transcripts, the changelog, and witnesses. Remove prose that says child flows are intentionally absent. Do not change Pi, model availability checking, runtime execution order, records, sessions, assembly installation, or platform support.

## Acceptance

Start with failing tests. `max-depth` 1 and 11 pass. Values 0 and 12, a fraction, a string, and an unsafe integer fail at the sentinel with the existing code and an actionable range sentence. A runtime descent fixture proves depth 11 permits ten child calls and exposes no subflow tool at call position 10. The existing mixed-flow chain still stops after ten calls.

A static assembly fixture includes an entry flow, an assembly-scope flow, a flow-local flow, a stage-local flow, a self-descending flow, a fan-out-selected flow, shadowed same-name definitions, and a definition first reachable beyond ten edges. The report includes every and only reachable definition and node once. Equal node names remain distinct by `flow`. The self-flow appears once. A `DESCEND` fixture proves that its self grant shadows a same-named flow-local definition below maximum depth, reveals that definition at maximum depth, and yields to a stage-local override. A shared flow reached by both short and long paths remains traversable at the short path without duplicating its rows and does not expose a child beyond call ten. The beyond-ceiling definition remains validated but is absent from the report.

Resolution fixtures prove the entry node keeps command and task overrides while child nodes do not inherit them. A selected `DESCEND` flow with different root and child intelligence or timeout results carries both `options` and `child_options`, validates both, and still emits one node row. Child flow, assembly, home, and default rungs remain exact. A non-text root request proves inline-call, file-call, fan-out, and selected-flow self-call rows use the schematic child request source instead of copying the root extension; a re-entered selected row uses `child_input`. Definitions carry no model bundle. Choice alternatives all appear once, loop contents appear once beside their repeat bound, and fan-out reports its width and maximum without claiming an observed item count.

Human and JSON fixtures pin the definition rows, flow identity, row order, exact field names, default page, selected page, and summary counts. A procedure above 200 rows round-trips through every page without duplication or omission. Existing invalid-child fixtures keep the same complete fault set even when the invalid definition is not within the reported reachability ceiling. Assembly-agent checking retains its first row and reports flows reachable from its scope.

Run focused graph, option-resolution, depth, assembly-check, pagination, help, capability, example, conformance, and documentation tests, then the complete local gate. Independent code review must inspect static reachability versus runtime scope, shadowing, child invocation rungs, depth off-by-one behavior, deterministic ordering, duplicate suppression, fault coverage, pagination, output bounds, and inaccurate dynamic claims. The implementation and completion commits pass hosted checks.

## Dependencies

Ticket 0273 removed authored access and command filtering, so checking must not revive either field. Ticket 0276 owns bounded request and command output behavior. Ticket 0278 owns run-summary reading and does not change assembly graphs. Later platform and model-diagnostic tickets consume this check contract but do not define it.

## Risk facts

Existing machine readers gain definition rows and the required `flow` field on named-flow nodes. Existing example transcripts change. This is an intentional pre-release contract correction before the first advertised compatibility point.

The static report describes possible structure, not one predicted run. A definition may appear even when no model selects it in one execution. A loop or choice body appears once. The fixed call ceiling can make an otherwise valid definition unreachable from the selected root; validation still covers the assembly tree. Pagination limits presentation size but does not weaken validation.

## Size decision

- Starting production size: 18267 nonblank lines
- Ending production size: 18469 nonblank lines
- Simpler approach tried: Append the child rows the current validation walk already creates.
- Why insufficient alternatives were rejected: Blind append duplicates shared flows, ignores runtime shadowing and call depth, and leaves equal stage names ambiguous.
- Production code added: Shared depth constants, bounded `max-depth` validation, exact-state reachable-flow collection, depth-dependent artifact alternatives, exhausted-state artifact rendering separated from structural validation, definition rows, and flow identities.
- Production code deleted: Silent child-row discard and hardcoded copies of the call ceiling.
- Accepted cost: Assembly check can return more rows and require pagination for assemblies with many reachable flows.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: The change is one read-only contract, but it spans graph validation, runtime-shared scope facts, deterministic traversal, paging, public output, specification, examples, and conformance.
- Selected model: `gpt-6-astra` with xhigh reasoning for design review and `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: The accepted completion-plan reassessment combined the unreachable descent-depth issue and missing child rows into one assembly-check accuracy outcome. A read-only implementation survey confirmed that checking already validates child flows, discards their rows, accepts unbounded authored depth, and hardcodes the separate ten-call runtime ceiling.
- Design review: accepted after one rejection. The correction represents a selected recursive flow's separate root and child option and request contexts while preserving depth-dependent traversal states separately from emitted-row deduplication.
- Code review: accepted after two rejections. The first review found that rendering discarded exact descent states, left required adversarial proofs absent, and retained contradictory documentation. The repair preserves alternative child artifacts without changing the string `output` field. The second review found that a hypothetical exhausted call scope could falsely reject a valid non-recursive run. The final repair separates structural validation from speculative state rendering. Independent review then accepted the change after 52 focused tests, all 143 conformance cases, documentation tests, and negative fan-out probes passed.
- Completion: implementation commit `e5a77fcffd604b76d178887a811edbf256193db3` is published, passed the complete local gate, and passed independent code review. Hosted runtime run `34792017094` and documentation run `34792017216` passed on that commit.
