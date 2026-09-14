---
base: 6664e734b4075803bb346fc0dc7fd4eeb04e018a
head: e5a77fcffd604b76d178887a811edbf256193db3
---

# Assembly checking reports the reachable procedure

`bot assembly check` now reports every statically reachable flow definition and node once within the fixed ten-child-call ceiling. Named-flow nodes carry their flow identity. Definition rows state the runtime ceiling and each authored descent bound. Named checks keep the selected flow first, and flowless checks keep the assembly agent first. Other flows sort by bytewise path. The existing pagination contract covers the combined rows.

The runtime and checker share one pure scope resolver and one ten-call constant. `DESCEND.md` accepts safe integer depths from 1 through 11. Reachability tracks flow identity, call position, and self depth separately from emitted-row deduplication. It respects assembly, flow, and stage shadowing, preserves shorter routes near the ceiling, and validates authored definitions that the reachable report omits.

Child nodes resolve without selected-root command or task rungs and use `request.<runtime>`. A selected recursive root keeps its root input and options and adds child context fields. Exact depth states preserve differing fan-out artifacts through `child_outputs` or `possible_outputs` while the primary `output` remains a string. Exhausted speculative states do not invent admission faults; ordinary structural validation still rejects malformed targets.

Independent design review accepted the contract after one rejection required separate root and child contexts and exact traversal state. Independent code review rejected the first implementation because it reset descent state during rendering, lacked adversarial shadowing and route proofs, and retained contradictory documentation. The repair preserved alternative artifacts and added the missing proofs. A second review rejected a false `flow-unknown` from a hypothetical exhausted route. The final repair separated structural validation from speculative artifact rendering and proved that a depth-11 flow can take a non-self path through ordinary fan-out. Independent review then accepted the implementation.

The implementation commit is `e5a77fcffd604b76d178887a811edbf256193db3`. The complete local gate passed 143 repository and documentation tests, 1,691 runtime tests across 210 files, all 143 conformance cases, static checks, four isolated public examples, the repository scanner, and the 18,469-line production-size check under Node 22.22.3.

Hosted runtime run `34792017094` passed the complete same-commit gate. Hosted documentation run `34792017216` built the site and passed its nested same-commit check.

The report describes static possibilities rather than one predicted run. It does not predict model selections, loop continuation, child-call counts, fan-out item counts, or future execution order. Pi and runtime execution behavior remain unchanged.
