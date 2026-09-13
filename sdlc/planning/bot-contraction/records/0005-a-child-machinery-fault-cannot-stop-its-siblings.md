---
flow: build
priority: 10
completed: 2026-09-04
---
# A child machinery fault cannot stop its siblings

## Goal

A subflow child owns its lock and record-writer failures. Its local machinery stop cannot cancel a healthy sibling or masquerade as an outside signal.

## Result

Each child now receives a local abort scope combined with the root outside-signal scope. A child lock compromise or writer failure records the first local reason and aborts only that child. An already-running nested child receives the same caller stop. The losing stage sequence still crosses prompt abandonment, tap detachment, command capture, process settlement, nested-child settlement, and stage ending before the child publishes its result.

The signal controller releases each child writer at one stable terminal boundary and closes local-fault admission in the same synchronous step before `run_end` can append. The child keeps its physical run lock until `runChild` returns after the terminal append or a visibly incomplete writer result. An outside signal admitted before the terminal boundary wins. A signal admitted after the boundary cannot append to or change the child record. The root retains its final process sweep.

A lock compromise writes an ordinary child `run_end` with `fault`, exit 2, and the immediate reason. A writer failure leaves the child record incomplete. The parent records that call with its child reference and reason but no invented exit or cause. The model receives plain text that says the child machinery failed and the record is incomplete. A healthy sibling still completes, and the parent stage receives both ordered results.

The implementation reuses `FlowResult` and one shared local-stop type rather than adding parallel child result and cancellation types. The remaining 104-line nonblank production increase holds the child-local and inherited abort state, atomic per-writer signal release and fault-admission close, the physical lock lifetime, cause mapping through stages and commands, incomplete-result rendering, and the joined losing-sequence boundary. Removing those states would restore sibling cancellation, invented signal outcomes, lost faults at publication, or terminal publication before child work settles.

## Checks

The focused regressions start two children and make one writer fail after `run_start`. They prove the parent continues with an incomplete failed-child answer and a successful sibling. Lock-compromise cases hold stage ending, hold a provider past abandonment, hold a real gate command through its process-group kill barrier, queue a compromise at terminal publication, and admit an outside signal on each side of the boundary. A nested case holds a grandchild through its ending and proves neither the child nor parent publishes early. An unstarted nested call names its caller's local machinery stop rather than an outside signal. Already-aborted gate and hook cases preserve the same local-versus-root cause rule as active commands. The real-command case also proves its exact process group exits and leaves no fixture process behind.

The three focused files passed ten tests in five separate processes, for fifty consecutive case passes after the concurrent lock fixture stopped assuming child creation order. The final gate passed 169 test files and 1,020 tests, 142 of 142 conformance cases, lint, type checking, unused-code inspection, cycle detection, catch-budget enforcement, direct dependency pins, and the exact 12,046-line source ratchet.
