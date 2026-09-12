# Conformance

> **Stability: stable.**

## Conformance levels

A runtime may name two claims for publication 0.0.1 separately:

1. **0.0.1 static conformance** means passing all 143 current model-free corpus cases. It covers only behavior that the corpus can exercise without a model.
2. **0.0.1 invariant compliance** means claiming that live execution satisfies the normative invariants, including behavior the static corpus cannot exercise.

Static corpus passage does not imply invariant compliance. A runtime may report the claims separately; complete 0.0.1 conformance requires both.

The corpus is the executable form of this specification: assemblies that must be
accepted, assemblies that must be refused, and the exact behavior expected of
each. It lives beside the specification, so a second runtime has something to be
checked against rather than only something to read.

```text
specification/
  conformance/
    accept/
      <case>/
        home/            optional: config.yaml, and assemblies/ when a case needs more than one
        assembly/
        invocation       the command line, one line
        expected.jsonl
    refuse/
      <case>/
        home/            optional
        assembly/
        invocation
        expected.jsonl
```

A case is a whole invocation, not only a folder. Several rules — which rung a
value came from, an unresolvable model, an ambiguous provider, a missing flow —
are about the home and the command line rather than the assembly, and a layout
that held only an assembly could not express them. The invocation line holds
the arguments handed to the assembly-check reader, and it
names no verb: every rule the corpus states is within check's reach, including
the ones a run would meet first, because check reads the whole tree a run would
read — every flow, and every subflow under it.

## The suite runs without a model

Everything in the corpus is deterministic. No case calls a provider, so the
whole suite runs in seconds, offline, on every commit, and a failure names a
rule rather than a mood.

That is possible because most of this specification is not about what a model
does. Reading the folder, typing each sentinel, ordering the stages, resolving
options across the rungs, binding slots, refusing what is malformed — all of it
happens before a model is reached, and all of it is checkable with
the assembly-check reader.

## Operational record conformance

Capability tests prove that the real CLI reports the same package version, Git source identity, and source-tree hash that a fresh `run_start` receives. Provenance tests independently frame `package.json` and regular `src/**/*.ts` bytes in bytewise path order. They prove stable ordinary trees, more than 256 source files, source bytes above four mebibytes, paths above 1,024 bytes, mutation sensitivity, child reuse, and failure before run birth after an ordinary source read error. JSON retains the complete descriptor inventory beside those four facts. Markdown adds exactly one identity line after its heading and renders a null Git digest as `-`. Separate cases cover unknown Git, source-identity dependency failure, both output bounds, and unchanged `bot --version` failure. The command reads no home, provider, credentials, network, or cache and creates no run. It may read the Bot package and invoke local Git. The compiled inventory supplies new-command dispatch and help facts. Run-list closed values and limits come from the parser's contract constants. Raw output is identified without a fabricated schema version. Mutation tests reject duplicate operations, command paths, and options, an unknown network value, an incomplete operation inventory, and output above 65,536 bytes. Malformed requests fail before source identity work. Unknown commands remain outside the compiled inventory.

Run-start tests prove that the noun-based spelling calls the existing invocation and runtime path. Real scripted execution compares the returned run identity, start, ending, output descriptor, correlation, and accepted bytes with retained evidence. Focused renderer cases cover UTF-8, binary, JSON-expanding, and oversized outputs, bounded multibyte reasons, incomplete records, and started nonzero exits. Parser cases reject malformed correlation before creating a run. Capability and help agreement tests name fixed options, declared slot options, modes, network behavior, and output bounds. Legacy run tests remain the isolation proof.

Run-resume tests drive the existing donor validator, continuation planner, and runtime through the noun-based spelling. They compare donor, correlation, outcome, and carried identities with the durable record. Injected copy failures before the first carry and after one carry prove that results report only durably appended `stage_carried` facts. A large-prefix renderer case preserves the exact count while omitting identities within the result bound. Refused donors use the common pre-start error. Existing continuation tests preserve donor validation and carried-stage behavior.

Run-record tests prove exact bytes for empty, invalid UTF-8, malformed, torn, structurally invalid, unsupported-format, and oversized root records. Real-CLI tests through the new route cover fixed-descriptor replacement and append behavior, backpressure, partial output after short reads and output failure, close failure, quiet closed pipes, and complete output after a delayed reader. Request tests cover required and repeated flags, forbidden selectors and output modes, unknown options, home precedence, selection failures, capability discovery, and generated help.

Run-output tests cover root and named-stage output, binary bytes, missing and changed output, and absent and ambiguous runs. A larger accepted root and named-stage output proves the noun-based command has no such limit or output-sized temporary-storage dependency. Generic two-pass tests prove that the initial held-descriptor hash must match before stdout, path replacement cannot redirect delivery, appends do not extend the fixed extent, and a changed delivery hash returns the integrity failure after bytes already written. Failure cases cover truncation, source read, stdout, descriptor close, wrong hash, and closed pipes. Malformed mode, repeated mode, and unknown-option cases prove validation occurs before home access. Real `bot run start` and `bot run resume` executions return descriptor-only results for large accepted outputs, then `bot run output` returns those exact bytes. Capability and generated-help tests publish the raw-only mode without the retired byte limit.

Run-check tests prove exact check-name and executable-file selection, complete attempt selection, ordinary repeat-one equivalence, loop repeats, record order, inert Markdown, the exact JSON shape, failed and null-exit recordings, and exact raw bytes. They cover agreeing successes, disagreements, malformed matching facts, empty and ambiguous selections, request conflicts, unsafe, linked, missing, replaced, non-file, unreadable, and oversized captures, raw-output delivery failure with an accepted prefix, the record-document bound, incomplete records, named record failures, invalid home contents, capability discovery, generated help, the command matrix. The executable digest is reported as gate identity and never compared with capture bytes.

Home-busy tests prove idle and conservative busy answers in human, JSON, and quiet modes. They cover relative-directory and home precedence, missing homes and run directories, malformed live trees, bounded request failures, capability discovery, generated help, the command matrix and direct in-process liveness calls.

Run-request tests cover empty and binary requests and accepted requests above 1 MiB. A real `bot run start` records a request above that boundary, and the noun command returns its exact bytes. Selection tests refuse missing, linked, non-file, changed, disowned, and recorded-size-disagreeing requests before standard output. The shared two-pass tests cover wrong hashes, late mutation, truncation, output and descriptor failures, and closed pipes. Malformed arguments fail before home access. Capability and generated-help tests publish the raw-only, network-free command.

Run-list tests prove the inert bounded Markdown and versioned JSON readings, exact retained end timestamps, signed integer millisecond durations, negative differences, reading-clock independence, numeric and null facts, the expanded default and selectable projection order, every reachable shared state-precedence branch, live recordless omission, bounded repeatable typed filters, canonical UTC millisecond timestamp edges, streaming exact count mode across 500 invalid runs, per-cell clipping evidence, bounded warnings with exact omission counts, sparse matches, strict canonical-JSON size-limited path-hashed membership cursors, every named invalid cursor shape, a maximal cursor round trip through a real process, cross-home and cross-filter rejection, creation, removal, and rename conflicts within the traversal, hostile retained and invocation text, home and runs path kinds, explicit-home precedence, structured errors, complete network-free help. The reader uses record summaries and does not inspect sessions or detailed artifacts.

FANOUT tests prove the exact authored form, root-only placement, strict bounded list validation, sorted requests and rows, width-limited child execution, complete-set handoff, timing-independent aggregate selection, sibling continuation after ordinary failures, outside-signal settlement, whole-control resume, child-output verification, and incomplete records after real record-storage failures. One runtime story assertion compares the retained manifest, sorted plan, request artifacts, child records, accepted outputs, aggregate, and successor inputs. The per-event shape oracle checks individual event fields only. Neither expands the shared structural reader.

Resume continuation tests prove that the same first-fresh plain root stage receives bounded prior-failure evidence beside its unchanged ordinary source. They cover first-stage and later-stage failures, exact retained bytes and digest, absent and Unicode-shortened reasons, deterministic name collision, successful and disagreeing donors, outside signals, container restart, unchanged donor bytes, and the prompt's prior-data label.

Pre-start fault tests inject synchronous and asynchronous preparation failures, a rejected initial record write with partial bytes, and unborn-directory removal failure. They prove operation-specific one-line reasons within 2,048 UTF-8 bytes, successful removal while reserved, cleanup-fault precedence, reservation release, unchanged caller-owned id bytes, and a successful following run.

Incremental semantic record tests prove fixed-size positional reads, short-read completion, byte and segment bounds, strict UTF-8 for complete and torn segments, retained CR bytes, torn omission, source metadata, first-fault line numbers, final append and replacement detection, and complete rejection of partial data after read or stability failure.

Rendered session tests retrieve a transcript beyond the former total byte and line-count bounds through stable pages. They prove the default and maximum message counts, the 1 MiB rendered-output and source-line bounds, refusal of one 8 MiB source line before parsing, the 4 MiB source-work target with complete-line stopping, opaque snapshot-bound source offsets, renderable-message lookahead, truthful remaining-message and remaining-data statements, empty and terminal pages, malformed and non-message entry tolerance, multibyte chunk boundaries, stale, cross-selection, cross-repeat, missing-repeat, mid-line, and out-of-range cursor refusal, append and replacement rejection without partial output, unchanged repeat listing, and unchanged bounded raw bytes. Tool-log tests prove the separate 16 MiB logical-line bound and its terminal-carriage-return rule.

Gate feedback tests retain exact check captures while proving the 10,000-byte model view, the 2,048-byte terminal view, code-point-safe head and tail selection, invalid-UTF-8 isolation, ordinary retries, exhaustion, exit 75, unchanged check fields, and the failure hook's absolute capture path.


Copied-install tests prove that local install, Git install, and update omit root and nested source dot-entries while Bot writes one root `.bot-source`. They prove that a dot-prefixed selected root remains eligible, matching local and Git trees preserve visible bytes and executable bits, and incomplete replacements do not displace an existing install. Link behavior remains unchanged.

The final signoff matrices also cover the 1-through-247 ASCII-alphanumeric request suffix, normalized parent and child request paths, recomputed inline descriptors, null-authored workdir resolution, extension-free graph entry names, and identity mode. A no-flow run permits only `assembly`. A named-flow run forbids `assembly` and requires a 1-through-9-digit prefix on every flow-stage identity. The same boundary covers starts, carried work, terminal facts, and synthetic current-record completion. The matrices also cover legal unnumbered CHOOSE and PARALLEL branch components, one-digit and nine-digit sequential-sibling rejection, and exact active-artifact hash drift with different expected and actual hashes. The drift executable table covers an entry flow, a top-level subflow, flow-local and stage-local subflows, recursive forms of both nested scopes, a repeated flow/stage name, an unnumbered owner, a non-flow prefix, and extra components after the executable.

The static assembly corpus does not exercise a running writer or retained run records. Deterministic runtime tests therefore form the executable conformance coverage for the record's semantic boundary. They generate current writer records and prove the three classifications, every current known-field and conditional event shape, the constructor-field coverage ledger, the whole-file 1 MiB and 10,000-line bounds, before-hook matrices, every raw hook and gate exit under natural and hidden machinery outcomes, the two natural gate-exit-75 paths, non-gate failed-check dispositions, failed-stage precursor and sealed-output rejection, sequential signal requirements and its one-event unreconciled window, every open-stage terminal pair, exact open-child LOOP and PARALLEL machinery settlement, rejection of direct non-signal container bypass, terminal-owner uniqueness across stage, carried, and container facts, stage and retry transitions, normalized paths, exact writer-owned request, session, check, hook, and output paths, top-level request sources, required current workdirs, required ordinary slots, exact optional `SUBFLOWS` recording, CHOOSE slot omission, absolute recorded slots, root-relative workdir and absolute PWD agreement, current success-hook outcomes, per-cycle check order, per-attempt gate ownership, decisive control and hash-drift terminal-pending boundaries, CHOOSE decision agreement and declined-branch exclusion, the complete LOOP ending vocabulary, continuation-dependent limit outcomes, and repeat-terminal consumption, observed same-execution PARALLEL coverage, provisional sibling proof, numbered and cross-repeat rejection, width and concurrency limits, all-unstarted settlement, exact propagated branch identity, explicit terminal propagation and consumption, top-level directory identity, record-version classification, unnamed closed ordinary run endings, the run-identity and post-stage root-machinery matrices, root-lock compromise, invalid-story search exclusion and stale-source removal, stable record and session snapshots, exact short reads, fail-closed automatic cleanup, exact selected cleanup, inline and file-backed child-artifact agreement, actual retained child request bytes, missing, changed, unreadable, linked, and non-file child request rejection, unsafe subflow input suffix refusal before child creation, preserved file-input machinery rejections, retained draft hash verification, the parsed forensic `show --json` behavior, exact installation-identity propagation through root and child records and structured results, and exact raw record snapshots across invalid bytes, bounds, child authorization, links, replacement, appends, early EOF, delayed output, closed pipes, output failure, and descriptor-close failure. A frozen current-shape fixture also proves that additive fields, including an omitted `installation_id`, remain readable without rewriting its bytes. The installation tests keep the stored record at version 1 and the run record at shape 1. They cover missing-parent, missing-home, missing-record, changed-state, link-settlement, finalization, publication-warning, first start, first resume, concurrent first use, and lexical-versus-canonical path selection. Direct fixtures cover invalid UTF-8, a byte-order mark, supported wrong ownership, insecure copied modes, invalid start and resume identities before birth, a barrier-synchronized real two-process race, and a stable oversized lexical symlink path that maps to a short canonical home. A mechanical check rejects Linux descriptor-namespace paths in the portable implementation and stale ticket 0032 identity attribution. The tests do not claim protection from a same-account actor that races intermediate-ancestor replacement. These tests cover the named current contract. They do not claim exhaustive possible-story coverage or migrations for older pre-release shapes.

The `run show` tests exercise normal CLI dispatch and the shared safe record reader. They prove the exact JSON and Markdown shapes, empty, running, crashed, and ended states, stage and subflow reduction, writer-owned child spelling without child reads, shared scratch paths across retries, fixed lock and scratch observation order, hostile optional and identity text, inert escaping and clipping, warning truncation, one common row prefix, both exclusive document ceilings, record-fault mapping, and malformed consumed facts. Bot smoke callers consume the supported `bot run show -j` result; retired command spellings take the ordinary typed unknown-command path. The `run events` tests prove current dispatch and capability discovery, the one-document JSON envelope, the retained human root reading, parser-before-home behavior, typed selection and integrity failures, parent-authorized child reading, and synchronous output-failure handling. The `run session` tests prove current dispatch, exact raw bytes, both Pi session formats, version-1 and version-2 continuation, cursor conflicts, parser-before-home behavior, and synchronous output-failure handling. Existing pagination race and resource tests continue to prove held snapshots, append behavior, source and line bounds, and complete logical-message paging.

The `run checklist` tests exercise normal CLI dispatch and the shared bounded semantic record reader. They prove record-order Markdown and exact version-1 JSON, inert 480-byte cells, historical null fields, independent and combined exact selectors, absent repeat versus explicit repeat one, incomplete prefixes, earlier retained marks beside later no-output work, malformed mark refusal, unrelated event isolation, run resolution, request validation before home access, shared record-fault exits, capabilities, help, and retired-command refusal.

A real CHOOSE run proves that current `chose` events carry the selection, declined alternatives, and reason without a constant origin field. The event-shape proof also accepts any retained additive `via` value without assigning it current meaning.

## The check output contract

`--json` writes one object per stage, in execution order:

```json
{
  "stage": "02-assess/risk",
  "type": "STAGE",
  "input": ["read.txt"],
  "output": "risk.json",
  "files": ["STAGE.md", "schema.json", "gate.sh"],
  "workdir": "./risk",
  "options": {
    "intelligence": { "value": "default", "from": "assembly" },
    "provider": { "value": "anthropic", "from": "assembly" },
    "model": { "value": "claude-opus-5", "from": "assembly" },
    "reasoning": { "value": "high", "from": "assembly" },
    "timeout": { "value": 3600, "from": "default" },
    "retries": { "value": 2, "from": "home" },
    "local-context": { "value": "ignore", "from": "default" }
  }
}
```

Every option carries the rung it came from, and `from` is one fixed word per
rung ([the eight rungs](elements/invocation.md#options-and-where-they-resolve)):
`command`, `task`, `stage`, `container`, `flow`, `assembly`, `home`, `default`.
That is the field that makes "why did this use that model" answerable before
the run rather than after it.

An authored `intelligence` is stamped with the rung that named it. Its
resolved provider, model, and reasoning values carry that same rung. The name
records what ran without putting it in a prompt, while the resolved fields
snapshot the complete bundle so the result does not depend on later home table
changes. Retired literal model-choice fields are not authored alternatives;
they remain here only as resolved output fields.

A single-file stage is `type` `STAGE` like the folder form — the form shows in
`files`, which lists only the file itself.

An authored stage `workdir` appears as written. It is absent when the stage uses
the flow's inherited working directory.

`input` is every name that may appear in `$INPUT`. For the stage after a
`CHOOSE`, that is one name per alternative and exactly one of them will be
there — which one depends on which alternative ran, and that is not statically
knowable, so the list names them all rather than guessing.

`files` lists the recognized files in the stage's folder — the sentinel first,
the rest in name order ([invariant 41](elements/invariants.md)), the entries of a
`gate/` folder as `gate/01-lint.sh` — so a reader can see that a gate exists
without opening the directory. A single-file stage lists only itself.

Two option details: `provider` appears only when the selected intelligence
bundle supplies it — it has no built-in default — and carries the rung that
selected that intelligence. A container's own frontmatter is rung `container`
on its own line, the same word its contents see. A stage's line also carries
`skills`: the flattened names it would see, narrowest override applied, in
name order — which is what makes the scope rules assertable without a model.

A container emits its own line and then the lines for what is inside it. Its
line carries `stage`, `type`, `options`, and its own key — `repeat` or `width` —
and no `input`, `output`, or `files`, because a container produces nothing of
its own. A `LOOP` lists its contents once, since how many repeats there will be
is not knowable without running, and a `CHOOSE` lists every alternative, because
any of them could be the one that runs.

Given no flow — `bot assembly check review` — it validates the whole assembly exactly as
any invocation would, and reports the assembly agent as the one stage that
would run: `stage` is `assembly`, `type` is `ASSEMBLY`, `files` lists
`ASSEMBLY.md`, `output` is `assembly.txt` (no schema — text), and a `scope`
field names the flows and root subflows the agent could call, in name order
([running the assembly](elements/invocation.md#running-the-assembly)).

Everything this does is deterministic, which is what makes it the backbone of
this corpus.

## Accept cases

Each holds an assembly and the JSONL output from the assembly-check reader that
the conformance harness compares.

Two runtimes reading the same accept case produce the same lines. That is the
claim the corpus exists to test.

Four groups. The corpus directory is the list — this prose names what each
group pins down, never which cases do it or how many:

| Group             | What they pin down                              |
| ----------------- | ----------------------------------------------- |
| Shape             | how a folder becomes a graph — the forms a stage takes, how stages order, how deep they nest, what a reader ignores ([the graph](elements/graph.md)) |
| Resolution        | one case per rung — each proving a value came from where it should ([the rungs](elements/invocation.md#options-and-where-they-resolve)) |
| Format selection  | `schema.json`, `schema.md`, none — each proving the extension the next stage sees |
| Naming            | what `$INPUT` holds after each container, including the alternatives after a `CHOOSE`; skills flattened across scopes; a collision resolving narrowest-first; identity inside a loop |

## Refuse cases

Each holds an assembly that is malformed in exactly one way, and the refusal it
must produce: a code, a path, and an exit of `2` ([refusals](elements/refusals.md)).

**The expectation is the code and the path, never the sentence.** Asserting on
prose would couple every runtime to one runtime's wording, and a rephrasing
would break the suite. The sentence stays free to be improved.

A case asserts its faults as a set — code and path, order-free — because the
order faults are reported in is not specified. Most cases isolate one fault,
which is what keeps a failure legible; a case may hold several exactly to pin
the report-every-fault rule ([refusals](elements/refusals.md)), asserting the
whole set.

At least one case per rule — several rules can share a code
([invariant 39](elements/invariants.md)), so a code may be asserted by more
than one case, and the corpus directory, not this prose, is the count.

The refuse set is where a specification earns its keep. Two implementations
agreeing about a correct assembly is easy; agreeing about a folder with two
sentinels, a `CHOOSE.md` listing an alternative that does not exist, a symbolic
link, or a gate with no executable bit is where formats quietly diverge.

## The order it gets built

1. **The refusal vocabulary**, because a case cannot assert on a code that does
   not exist ([refusals](elements/refusals.md)).
2. **The refuse cases**, which are mechanical once the vocabulary exists and are
   where most of the value is.
3. **The accept cases**, which need the assembly-check reader to be producing its
   fields.

A new rule about an assembly a runtime reads is always a new case; it is a new
code only when no existing code names the fault
([refusals](elements/refusals.md#adding-to-this)).

## What a runtime claims

A runtime that passes every case in the corpus implements the parts of this
specification that do not need a model. It does not thereby implement gating,
resumption, or anything else that happens once a model is running — those are
claimed by reading [the invariants](elements/invariants.md) and meaning it.
