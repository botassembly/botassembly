# Minimal data-driven FANOUT

## Goal

An authored flow can run one authored subflow for every item in a list produced by the immediately preceding stage. Bot owns complete coverage. The agent that produced the list does not restate it as tool calls.

## Authored shape

`FANOUT.md` is a numbered root entry in an ordinary named entry flow. An ordinary JSON stage comes immediately before it. An ordinary stage comes immediately after it. FANOUT cannot be first, last, nested in another container, or placed in a subflow. Its folder contains only `FANOUT.md` and optional `README.md`.

The sentinel has no body and requires exactly four keys with no defaults: `items`, `subflow`, `width`, and `max-items`. `items` and `subflow` are nonempty strings. `items` names one top-level member of the preceding JSON object. `subflow` resolves through the same assembly and flow scopes that an ordinary stage uses. The selected subflow's required final stage fixes one output extension. The bounds satisfy `1 <= width <= max-items <= 32`.

## Manifest

Bot opens the preceding stage's sealed output, fixes the descriptor snapshot, refuses a file above 1 MiB before allocating its body, reads strict UTF-8 JSON, and verifies the recorded hash. An unreadable file, short read, replacement, or hash mismatch is a machinery fault. The JSON root must be an object. The authored `items` member must be a nonempty array with no more than `max-items` entries.

Each entry has exactly two top-level members. `id` is a string that matches `[a-z0-9][a-z0-9_-]{0,127}`. `input` is an object and is not an array. Flat values are invalid. Duplicate ids are invalid. Bot uses the runtime's ordinary JSON parser. The retained bytes and the parser's result determine one plan. Bot rejects every manifest-shape error before it creates a child run.

Bot sorts entries with the existing bytewise UTF-8 comparator. The source array order has no execution meaning. Each child request is the existing compact JSON serialization of a newly constructed `{id, input}` object with no trailing newline. The request carries both fields. The same retained predecessor output therefore produces the same request bytes and hashes.

## Execution

FANOUT runs no model. The implementation extracts one ordinary subflow-child operation from the current batch runtime. Agent-invoked batches and FANOUT both use it. FANOUT adds only manifest planning, bounded dispatch, aggregation, and handoff. It does not create a second child lifecycle.

FANOUT starts children in sorted-id order while at most `width` children are live. A settled child frees one slot for the next item. The existing bounded pool owns concurrency. FANOUT converts each child-operation rejection into that item's machinery disposition before it returns control to the pool. One broken item therefore cannot stop later launches.

The shared child operation returns the child's terminal result and retained record reference. Agent-invoked subflow batches may still copy a successful answer into `$SUBFLOWS` and render bounded tool content. FANOUT does neither. It gets the accepted output from the child record and lets the next stage's ordinary input materialization perform the only copy. Child execution also does not inherit the root-only callback that reads the final output into `FlowResult.outputBytes`. These two boundaries prevent FANOUT from copying or buffering every output before handoff.

Each child owns separate request, scratch, session, record, and output paths. Children share the trusted working directory and declared slots. Bot does not promise an operating-system sandbox.

Every planned item receives one disposition. A started item carries its child reference and terminal outcome when its child record completed. A child record-writer failure keeps the started child reference without inventing a terminal pair. A setup rejection remains unstarted and records its machinery reason. Ordinary child failure, child setup rejection, and child machinery fault do not cancel siblings or stop later items.

The root signal controller alone owns an outside signal. A signal check occurs before `fanout_start` and before every launch. An outside signal stops new launches, aborts running children, waits for every started child, records the unstarted items, writes the completed FANOUT facts when the record writer remains available, and ends the parent with the signal result.

After all children settle, the aggregate first selects dispositions that make the run impossible. These include exit `2`, a started child with no terminal pair, and an unstarted child setup rejection. It selects the lowest sorted id within that class. If no such disposition exists, it selects the lowest sorted id among unsuccessful work outcomes. Completion timing never changes the aggregate. Successful sibling outputs remain in their child records. Resume reruns the whole FANOUT from the retained predecessor output.

FANOUT has no timeout or clock of its own. The finite `max-items` bound and each ordinary child stage's authored timeout bound its work. An outside root signal remains the only parent-wide stop.

## Complete-set handoff

FANOUT succeeds only when every item succeeds with one sealed final output. For each successful child, it requires a valid child record whose `run_end` is `success/0`. The current successful `run_end` carries no terminal stage identity. The last `stage_end` therefore owns the output identity. That ending must name the selected subflow's exact final root stage, omit `repeat`, carry a positive `retry`, be sealed and judged at `success/0`, and name exactly `stages/<final-stage>/1/<retry>/output.<authored-extension>` beneath the child. The parent output descriptor names that same normalized path beneath the child reference. A mutation to the stage, retry, path, extension, terminal result, or descriptor agreement makes that item a machinery fault.

The stage-input materialization boundary has two source forms. An ordinary source keeps its established `diskPath` copy contract. This includes the initial request and test or embedding callers whose source does not live beneath the run directory. A FANOUT output carries an already held source capability. Materialization copies that accepted output from its held descriptor and hashes the bytes during the same copy. It compares that hash with the recorded output hash before `stage_start`. It removes a partial or disagreeing destination and faults before the successor starts. It never verifies one path and then reopens that path for the authoritative copy.

A zero-byte held source still creates and closes its empty destination. Destination construction belongs to the write phase. A construction failure returns a write interruption and closes the held source descriptor. The held copy streams an initial descriptor-sized snapshot, so ordinary child outputs do not inherit the 1 MiB manifest or inspection-body limit and do not require an output-sized buffer. The preparation barrier waits for every started ordinary or held source copy to settle before it reports one failure. No stream or descriptor remains active while failed-stage cleanup begins. FANOUT adds no second child-output copying path and does not redefine ordinary `FlowSource` resolution.

The next stage receives one `<id>.<extension>` file per item through the existing `$INPUT` materialization path. It receives no manifest file. A missing, unreadable, short, replaced, or hash-disagreeing child output faults before `stage_start`. A failed FANOUT returns no sources, so the successor cannot start with a partial set.

## Record

The record remains shape 1 under ADR 0024. A valid manifest produces `fanout_start` before any child directory exists. The event carries the container identity, received predecessor descriptor, authored settings, measured manifest bytes and hash, and the complete sorted plan. Each plan row carries `item`, call number, request byte count, and request hash. The plan does not claim that an unstarted child's request file exists.

Each planned item produces one `subflow_call` row in sorted-id order after all children settle. The additive fields `via: "fanout"`, `item`, and an optional accepted output descriptor distinguish these rows from agent-invoked calls. The row records whether the child started, its child reference when one exists, and its terminal outcome. An absent `via` continues to mean an agent-invoked subflow call.

Started child references keep the existing `stages/<node>/<repeat-or-1>/<retry>/subflows/<call>` relation. Their input descriptors name `request.json` beneath that reference. Existing raw-child authorization and child-record agreement therefore continue to validate the exact parent fact and retained child request. The accepted output descriptor uses the child path relative to the parent run.

`fanout_done` follows all item rows. It carries the terminal exit and cause, optional selected item, and measured peak concurrency. A successful event has no selected item. The selected item row keeps its existing reason. The failed node result gives `run_end` the FANOUT identity. No FANOUT event carries `repeat` under the initial placement rule.

Manifest rejection happens before `fanout_start`. `run_end` names the FANOUT node and carries cause `rejected` plus the specific rule. An unreadable predecessor or hash mismatch produces cause `fault`. No child directory exists in either case.

ADR 0025 governs shared record reading. The structural reader recognizes the two new event names, requires one `fanout_start` before one `fanout_done` for the same identity, treats FANOUT-owned `subflow_call` rows as container facts rather than open stage-attempt facts, and checks legal terminal and outside-signal pairs. It does not parse the manifest, traverse child directories, recompute the plan or aggregate, or inspect successor inputs.

Writer and conformance tests own the detailed FANOUT story. A cross-event assertion compares the retained manifest descriptor, `manifest_bytes`, `manifest_sha256`, sorted plan, exact one-to-one item rows with no missing or extra row, child references, output descriptors, derived aggregate, and successor `stage_start.received` set as one story. It requires exactly one matching `fanout_done` after all item rows. The ending's exit, cause, and selected item must equal the aggregate derived from those rows. The per-event shape oracle remains limited to individual event fields. Any future operation that relies on one of those facts validates that fact and its artifact at its own boundary. Raw record access remains available under ADR 0025.

## Static reading

`assembly check` reports the FANOUT identity, `items`, `subflow`, `width`, `max_items`, and `<item>.<extension>` output pattern. Static validation resolves the selected subflow and its final stage. It does not inspect runtime manifest bytes.

## Code ownership

`model.ts`, `graph.ts`, `fanout-authored.ts`, `assembly.ts`, and `check.ts` own the authored node and static validation. `fanout.ts` owns manifest reading, planning, dispatch, aggregation, and child-record output ownership. `subflow-runtime.ts` owns one child lifecycle shared by agent batches and FANOUT and keeps agent-only answer rendering outside the FANOUT path. `flow.ts` supplies the existing recursive child-run capability without its root-only final-output reader and owns stage preparation. The source materializer preserves ordinary `diskPath` copying and selects descriptor-held copying only when a source carries that capability. `run-files.ts` supplies its existing descriptor-held streaming primitive and reports the streamed hash. `fanout-events.ts`, the structural reader, human reading, event-shape oracle, specification inventory, and conformance fixtures learn the additive record facts.

No FANOUT logic belongs in the general record validator, the model harness, Pi tools, the workflow orchestrator, or the inspection CLI.

## First proof

Write focused red tests in this order:

1. Static parsing accepts the four-key sentinel and rejects bad bounds, unresolved subflow, wrong neighbors, nested placement, and placement in a subflow.
2. One black-box run writes an unsorted two-item manifest. Width one starts children in sorted-id order. The successor receives exactly the two named outputs. One cross-event assertion ties the retained manifest, plan, requests, child records, final-stage outputs, item rows, aggregate, and successor inputs together.
3. One table rejects malformed UTF-8 or JSON, missing and empty lists, non-list values, flat items, bad and duplicate ids, over-count input, and a document above 1 MiB before any child directory or `fanout_start` exists.
4. A completion-order latch makes a lower-id machinery disposition finish last beside an ordinary failure and a success. Every item starts. The rows and selected aggregate stay in authored sorted order. The successor does not start.
5. Width two starts two of three latched items. SIGTERM settles those children, leaves the third unstarted, records FANOUT before the signal ending, and starts no successor.
6. One CLI-level resume of that donor carries the predecessor stage, reruns every item, writes fresh child records, and reaches the successor only with the new complete set.
7. Child-record mutations separately change the final stage identity, retry, output path, authored extension, terminal outcome, and output descriptor. Removing or changing the output before it opens faults before successor `stage_start`. A valid child output above 1 MiB streams through unchanged. The large-output case also proves through injected callbacks that FANOUT does not request an output-sized `FlowResult.outputBytes` buffer or create the agent-only `$SUBFLOWS` answer copy.
8. Replacing the output path after its descriptor opens cannot redirect the held copy. An append after open is not chased. A zero-byte source creates an empty destination. A short read, destination-construction failure, later write failure, close failure, or streamed hash disagreement removes the destination and starts no successor. The destination-construction case asserts a write interruption and one descriptor close. The focused held-copy tests reuse the established race modes in `raw-record-races.test.ts`. The integration mutation at the old reopen seam must fail against any implementation that verifies and later copies by pathname.
9. Real record-storage failures cover `fanout_start`, the first item row after children settle, and `fanout_done`. The test makes the underlying writer fail during its append instead of throwing before the writer sees the event. The first seam starts no child. The later seams retain completed child records. Each retained parent record remains a possible incomplete prefix with no invented `fanout_done`, `run_end`, or successor.
10. The event-field ledger proves both directions: every constructor and emitted field has a ledger entry, and every ledger field appears in a maximal constructor sample. FANOUT event constructors accept an identity type with `stage`, `retry`, and `repeat?: never`. Supplying `repeat` fails TypeScript checking as well as the runtime event-shape oracle.
11. Cross-event mutations change the manifest byte count or hash, remove and add item rows, duplicate an item or call, and change or remove `fanout_done` aggregate fields. Each mutation makes the FANOUT story assertion fail. The unchanged happy story proves the plan ids and calls match the manifest items exactly, item rows match the plan exactly, and the successful aggregate is `success/0` with no selected item.
12. Existing hostile-flow cases still materialize ordinary sources from their supplied `diskPath` and reach the node behavior they test. Refusal-sentence tests name FANOUT wherever they enumerate legal control sentinels. The human `show` fixture includes both FANOUT events and their stable clauses.

Mutations must make the focused tests red when they skip one planned item, start past `width`, publish rows in completion order, choose an aggregate by completion timing, pass a partial source set, launch after a signal, omit an unstarted disposition, or let `fanout_done` precede its start. The complete project check remains the final proof.

The conformance chapter names only behavior these focused tests prove. It attributes cross-event relationships to the runtime story assertion, not the per-event shape oracle. It claims incomplete records after writer failure only after the real storage-failure test observes an incomplete retained prefix.
