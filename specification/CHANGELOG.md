# Changelog

## 2026-09-12

Ticket 0265 corrects the authentication contract link in the home specification and adds the specification checker to the complete offline `make check` gate. The gate now rejects missing local specification links and record-event vocabulary drift before the project checks run.

## 2026-09-11

Ticket 0259 adds `bot auth logout PROVIDER` to the current command surface. It validates the exact provider before the retired-store warning, then calls a dedicated Pi runtime without a racy existence preflight. That runtime uses the live authentication path, no model file, no creation refresh, and disabled model network. Pi owns parsing, its long-wait file lock, deletion, and typed post-delete synchronization. Success reports only the canonical provider and completed settlement. A typed post-delete synchronization failure preserves that result and exits 5.

Ticket 0256 adds `bot auth login PROVIDER` to the current command surface. Pi owns the interactive login and its shared authentication lock. Provider validation precedes the retired-store warning and all credential access. Interaction stays bounded and on standard error. JSON success reports only the canonical provider, `authenticated: true`, and the credential type. A typed post-persistence synchronization failure preserves that truthful result, reports a non-retryable structured error, and exits 5.

Ticket 0254 adds `bot auth list` as a finite safe credential-metadata inventory. Stored public metadata reports `stored`; every other provider is `unobserved`. Unobserved does not mean unavailable. Pi 0.85.1 provider status can read environment values, so the command never asks for it. The command does not resolve ambient secrets, probe provider files, run provider commands, refresh, mutate, or use the network.

Ticket 0249 moves the three exact-pinned Pi packages together to 0.85.1. Newly written Pi sessions use format 4 at Bot's retained record-named path. Retained format-3 sessions remain readable.

## 2026-09-10

Ticket 0243 puts Pi 0.83.0 behind Bot-owned harness, tool, execution, and event contracts without changing the provider, model, retry, session, command, or specification behavior. Gating now owns an explicit idempotent logical close. It detaches record taps and closes before `stage_end`, while the flow retains a final cleanup backstop. A close failure cannot follow a successful stage ending. Unsignaled and signaled cleanup failures retain their distinct terminal record facts.

Ticket 0242 accepts Pi's public `ModelRuntime` as Bot's future provider, model, availability, and authentication boundary without loading Pi extensions. ADR 0030 records the ownership, trusted local-configuration limits, catalog network rule, owner-only authentication-store preflight, three-ticket migration, staged supersession of four earlier ADRs, rejected alternatives, evidence, and accepted costs. This ticket changes no runtime or normative specification behavior.

Ticket 0241 states Bot's existing runtime boundary without implying a sandbox or complete file observation. The specification and public guidance explain unrestricted direct tools, the `access` direct-dispatch guardrail, the authority retained by allowed processes, hooks, and gates, and the need for external containment. Inspection now describes `bot logs` as a reading of calls reported in retained sessions. Bot does not watch the filesystem or claim a complete list of changes.

Ticket 0239 makes local `.` and `./` installs and links use the resolved current directory basename. It keeps explicit names, `#subdir` names, ordinary local names, Git names, and `.git` stripping unchanged. The management reference and install guide explain that links expose later edits, installs make fixed copies, updates refresh copies, and repeating an install refuses. A real-process test preserves the existing sequential collision guarantee.

Ticket 0237 adds `bot run checklist RUN` as the supported checklist-mark reader. Markdown and version-1 JSON preserve each mark's record order, stage, repeat, retry, item, decision, evidence, and reason. Independent exact selectors can be combined. Historical absent evidence remains readable as null. Malformed marks and semantic-record faults fail without partial output. Capability discovery, generated help, the specification, and the documentation publish the network-free read-only command and its 1 MiB record and 480-byte cell limits. Legacy `bot explain` remains unchanged.

Manual Bot ticket 0083 migrates the smoke driver, S5, S6, and S10 validators from human `bot show` rows to the supported `bot run show RUN -j` result. The smoke parser accepts only the exact consumed version-1 shape, and S6 now proves stage, subflow, and scratch facts from that reading while retaining raw-record event evidence. Legacy `bot show` behavior remains unchanged.

Manual Bot ticket 0082 adds `bot run show RUN` as a bounded root-run reading. Markdown and version-1 JSON report the same root, stage, and subflow prefix from one held record snapshot, one later liveness sample, and ordered scratch checks. The command never follows child records or contacts a provider. Source-text, cell, row, warning, row-count, and complete-document limits fail closed or report exact omissions. Legacy `bot show` and the smoke caller remain unchanged.

Ticket 0080 aligns the published pre-release compatibility rule and resume documentation with the accepted runtime. The specification and maintained invocation reference now teach `bot resume RUN` and `bot run resume RUN`, distinguish their command-specific options, resolve run controls from current configuration, and carry only a contiguous prefix of plain root stages before `LOOP`, `CHOOSE`, `PARALLEL`, `FANOUT`, or `DESCEND`. The focused documentation check rejects the retired `bot run --continue` instructions and the superseded stable-0.1 compatibility promise while preserving this changelog's historical text.

## 2026-09-09

Manual Bot ticket 0072 replaces the bounded defensive source inventory with a recursive plain read of `package.json` and regular `src/**/*.ts` files. It removes file-count, total-byte, and path-length quotas plus link, entry, normalized-path, descriptor, and short-read defenses that targeted mutation of Bot's trusted installed program. The prefix, bytewise path order, 12-byte frame, exact-byte digest meaning, pre-start failure boundary, child reuse, capability fields, and record compatibility remain unchanged. Hashing grows with the installed program, and the sequential observation is not atomic.

## 2026-09-08

Manual Bot ticket 0066 makes copied install and update omit every source entry whose basename starts with a dot. The selected root remains eligible even when its basename starts with a dot. Local and Git sources share one copy filter and retain matching visible bytes and executable bits. Bot writes one root `.bot-source` after the copy. Links and existing installed copies remain unchanged.

Manual Bot ticket 0065 moves the disposable `bot find` SQLite index from the searched home into the operator's XDG cache. A full lexical-home-path hash separates copied homes. Stored filesystem identity forces a rebuild when that identity changes. A digest of each already-held complete source prevents stale watermark reuse when a replacement recycles device and inode values. Concurrent searches serialize refresh. Legacy in-home indexes remain untouched and supply no results. Status still counts only home bytes. Prune remains unchanged.

Manual Bot ticket 0062 adds the Bot source identity to `bot capabilities`. JSON carries `runtime`, `runtimeSource`, `runtimeDigest`, and `runtimeTreeSha256` beside the unchanged command inventory. Markdown adds one identity line. Both forms use the same package version, local Git reading, and bounded source-tree hash as `run_start`. Unknown Git remains a successful unknown source. A source-tree identity failure returns the common dependency failure. The command still reads no home, provider, credentials, network, or cache.

Manual Bot ticket 0061 adds `endedAt` and `duration` to `bot run list`. Ended rows carry the accepted `run_end.ts` and the signed integer millisecond difference from the accepted `run_start.ts`. Other rows carry nulls. Human output shows elapsed age and exact milliseconds. Capability discovery, generated help, the command matrix, and current inspection and conformance documents publish the expanded default field order. The legacy command remains unchanged.

Manual Bot ticket 0060 adds `bot home busy DIRECTORY` through the existing directory-liveness predicate. Human and version-1 JSON modes report either boolean with exit zero. Quiet mode preserves the legacy exit-zero-or-one behavior and writes nothing. Missing state answers idle. Indeterminate live state remains conservative and answers busy. Capability discovery, generated help, the command matrix, and current inspection and conformance documents publish the noun command. The legacy command remains unchanged.

Manual Bot ticket 0059 adds `bot run check RUN NAME`. Markdown and JSON list every well-formed recording selected by the exact check name, optional executable file, and optional complete attempt identity. Raw mode returns one safely held capture under a 16 MiB bound. The semantic record reader retains its 1 MiB bound. Failed and null-exit facts remain visible. Matching malformed facts fail integrity. Capability discovery and generated help publish the command. The legacy check reader remains unchanged.

Manual Bot ticket 0058 carries a direct provider error cause into the assistant session and the `stage_end.reason` and `run_end.reason` fields. It appends a qualifying cause message and code, ignores malformed and nested causes, applies the existing UTF-8-safe bound once, and leaves retry behavior and the `provider_retry` shape unchanged.

Manual Bot ticket 0057 makes the first start or resume initialize a missing home identity before run birth through the existing private initializer. Concurrent first runs use and record one published winner. Existing valid identities remain unchanged. Invalid records still refuse before provider contact or run publication. `bot home show` remains read-only. The `bot home init` route, capability, help, result document, and current specification contract are removed.

## 2026-09-06

Manual Bot ticket 0054 adds `runtime_tree_sha256` to each new `run_start`. Bot measures a bounded bytewise-framed inventory of `package.json` and regular `src/**/*.ts` files before the top-level start. Child runs reuse the parent value. The field identifies the source snapshot observed on disk and does not claim to identify modules Node already loaded. Older shape-1 records remain readable.

Manual Bot ticket 0052 records `provider_start` before each logical provider operation. The event carries the provider, model, and copied stage identity. A silent or interrupted operation therefore remains visible without inventing a completed turn. Bot attaches and removes Pi's typed provider hook with its ordinary event subscription. The record remains shape 1.

Manual Bot Quick Fix 0046 makes every maintained run-id-file statement name all four run-creation spellings that accept `--id-file`: `bot run`, `bot run start`, `bot resume`, and `bot run resume`. The option's timing, path handling, failure behavior, and command parsers remain unchanged.

Manual Bot ticket 0045 removes the constant `via: "body"` field from newly written `chose` events. The agent remains the only chooser. Current events retain the selected alternative, declined alternatives, and reason. Readers continue to tolerate any additive `via` value in retained pre-release records without treating it as a current field.

Manual Bot ticket 0044 records the optional `$SUBFLOWS` stage slot. An output-bearing stage with a subflow in scope now carries the exact runtime environment string as `stage_start.slots.subflows`. Stages without that environment value omit the member. `CHOOSE` continues to omit the entire slot object.

Manual Bot Quick Fix 0041 publishes the complete closed stage `access` grammar. The stage contract now defines its mapping and arrays, four operations, deny-all forms, managed slot exports, conditional `SUBFLOWS`, executable-name syntax, stage-only placement, and the limit that authorization does not prove installation. A table-driven authoring test keeps every accepted and rejected shape aligned with the existing parser.

Manual Bot Quick Fix 0040 makes the hooks contract name an agent-reported `fault` among the endings that run a stage failure hook. `$REASON` names the retained fault-reason capture when one exists. A focused runtime proof covers the exact cause, absolute capture path and bytes, hook diagnostics, unchanged stage and run ending, and absence of retries and checks. The signal exception remains unchanged.

Manual Bot Quick Fix 0039 corrects invariant witness 46. The witness now cites the current exhaustive event-constructor and field-shape proofs without preserving an obsolete constructor count. Its separate unreadable-input, LOOP-placement, byte-stability, and honest-limit clauses remain unchanged.

Manual Bot Quick Fix 0037 isolates the complete check and its static readers from ambient process state. The root-check test removes recursive Make control variables from its child environment. Each conformance case and the static PARALLEL fixture now use their own explicit Bot home. Twenty-two accept expectations now record the fixture-owned `faux` provider and `faux-1` model.

Manual Bot ticket 0036 corrects the published `bot models` network contract. Ordinary listings read the pinned catalog without contacting providers. `--live` requests current catalogs and may contact applicable configured providers. A named live request without a credential refuses before contacting that provider.

Manual Bot ticket 0034 adds `bot run request RUN --raw`. The command returns every retained root request whose recorded path, byte count, and SHA-256 match one fixed held descriptor. Two bounded-memory passes prevent output before initial verification and require a matching delivery hash for exit zero. The legacy request reader keeps its 1 MiB limit.

Manual Bot ticket 0055 gives each explicitly initialized home one private stable installation identity. `bot home init` publishes the version-1 `installation.json` atomically after held-parent synchronization. Portable canonical-path checks validate final objects without following links and revalidate the containing directories around operations. They detect observed replacement under Bot's local same-account trust model. They do not defend against a same-account actor that races an intermediate ancestor. An absent show requires successful containing-object revalidation. Before mutation, exact final serialization of the same resolved lexical home string used by the command result proves that both home commands can report the initialized identity in Markdown and JSON within 4,096 bytes. Storage canonicalization does not change the reported value. A non-`EEXIST` link rejection remains retryable after successful finalization and never claims possible publication. Post-publication cleanup and close failures preserve the publication warning. `bot home show` reads the identity without mutation. Capability discovery publishes both required-home commands. Every new root and child `run_start` records `installation_id`, and version-1 structured run results project the same value from the written event. Historical shape-1 records remain readable, and the run record remains shape 1.

Manual Bot ticket 0031 removes the output-sized private copy from `bot run output RUN [STAGE] --raw`. One safely held source descriptor supplies both bounded-memory passes over its fixed initial extent. The first hash must match before stdout. The delivery hash must match for exit zero. Path replacement cannot redirect delivery, appends do not extend it, and a late in-place change may leave bytes on stdout before the command reports the integrity failure. The legacy output reader remains unchanged.

Manual Bot ticket 0027 lets `bot run output RUN [STAGE] --raw` return every accepted output. It verifies a private fixed snapshot before stdout, keeps memory bounded, attempts temporary cleanup on every exit, requires successful cleanup for exit 0, and leaves the legacy output reader's 1 MiB limit unchanged.

Manual Bot ticket 0026 adds `bot run output RUN [STAGE] --raw` as the noun-based spelling for exact hash-verified accepted output. It delegates selection and reading to `bot output`, preserves the existing 1 MiB bound and every legacy exit, and validates its raw-only request before reading the home. Capability discovery and generated help publish the implemented command and bound.

Manual Bot ticket 0025 adds `bot run resume RUN` as the noun-based resume mutation. Human mode preserves legacy resume output. Structured mode uses the bounded `bot.run.result` contract and adds the donor plus the count of stages whose `stage_carried` events were durably appended. It includes the complete ordered identities only when the full result fits and explicitly reports omission otherwise. Partial copy failures report only the durable prefix. Pre-start refusals use the common error contract. Correlation stays bounded and opaque. Capability discovery and generated help report the implemented mutation.

Manual Bot ticket 0023 adds `bot run start` as the noun-based run mutation. Human mode preserves legacy output. `--json` and `-j` return one bounded `bot.run.result` for every started run from facts carried through the existing runtime. The result preserves nonzero exits, distinguishes incomplete records, bounds reasons, and includes complete accepted output only when the full document fits. Pre-start failures use the common error contract. An optional bounded opaque correlation value enters the shape-1 `run_start` event and result without uniqueness or replay behavior. Capability discovery and generated help report the implemented mutation. The record remains shape 1.

This file is history, not a contract.

What changed in the specification, and why. A ticket that changes
`specification/` writes its entry here, in the same commit. Entries are newest
first, one paragraph each, naming what changed and the ticket that ruled it.
New entries are headed by their date.

The specification used to carry a revision number too — a single integer,
advertised at the top of [README.md](README.md) and incremented by every ticket
that touched the spec. Ticket 0109 removed it. It told a reader nothing the
[conformance corpus](conformance.md) did not already tell them, and because only
one ticket could hold the next number at a time, spec work that was otherwise
independent had to run one lane at a time. The entries below were numbered 1 to
11 while the number existed; they keep those numbers, because several of them
refer to each other by number and renaming them would break that.

## 2026-09-05

Manual Bot ticket 0022 adds `bot run record RUN --raw` as the noun-based spelling for exact retained root-record bytes. The command delegates to the existing raw record reader. It therefore preserves safe opening, one fixed descriptor snapshot, append and replacement behavior, backpressure, partial output on interrupted copies, bounded diagnostics, and quiet closed pipes. Capability discovery and generated help report raw output without inventing a schema version. The legacy `bot show RUN --raw` spelling and bytes remain unchanged.

Manual Bot ticket 0021 adds `bot capabilities` as a bounded, network-free reading of the new command contracts compiled into the executable. Deterministic Markdown and versioned JSON report only `capabilities` and `run.list`, including output contracts, modes, home, mutation, network, options, closed values, and enforced bounds. One descriptor inventory supplies new-command recognition and help facts. Run-list parsing, rendering, help, and capability metadata reuse one exported contract. Malformed requests use the common structured or inert human failure without reading a home or contacting a provider. Legacy commands and outputs remain unchanged.

Manual Bot ticket 0020 adds `bot run list` as a bounded composable run-summary reading. It provides inert Markdown and versioned JSON, bounded typed filters, canonical UTC millisecond time bounds, projections, streaming exact count mode, strict canonical-JSON membership-bound path-hashed keyset cursors, per-cell clipping evidence, bounded warnings with exact omission counts, shared reachable record states, typed path failures, structured errors, and complete help. It reads no sessions or detailed artifacts, omits a live recordless run that is still being born, and leaves the legacy `bot runs` command unchanged.

Manual Bot ticket 0019 adds the provisional root-only `FANOUT.md` control. It validates one bounded JSON list from the preceding sealed output, runs one existing subflow lifecycle per sorted item under an authored width, and hands the next stage only a complete verified output set. The parent records the retained manifest, complete sorted plan, one disposition per item, and timing-independent aggregate through additive shape-1 events and fields. Ordinary child failures do not stop siblings. An outside signal stops new launches and settles started children.

Manual Bot ticket 0016 gives an applicable resumed plain root stage one bounded prior-attempt failure artifact beside its unchanged ordinary source. The donor's final failed stage and terminal run facts must agree. Outside signals, containers, nested failures, and later stages receive no artifact. The new run retains and binds the exact bytes through the existing `stage_start.received` descriptor without changing the record shape.

Manual Bot ticket 0015 makes unexpected failures before the initial `run_start` write settle as bounded operation-specific faults. Expected refusals and preparation faults now share one unborn-directory cleanup result. Bot removes the directory while holding its run-name reservation. A cleanup failure takes precedence and leaves the directory visible. Reservation release still runs, partial records disappear after successful cleanup, and caller-owned id-file bytes remain unchanged.

Manual Bot ticket 0014 makes rendered `bot session` output readable in stable bounded pages. Pages default to 100 messages, accept 1 through 500, emit at most 1 MiB, and scan toward a 4 MiB source target before completing the current bounded line. A rendered-session source line above 1 MiB is refused before decoding or parsing. Tool-log lines retain their 16 MiB logical-line bound, which excludes one terminal carriage return. An opaque cursor binds the selected run, stage, repeat, session path, held snapshot identity, size, timestamps, and next source-byte position. Stale, cross-selection, mid-line, and out-of-range cursors are refused. A loop cursor requires its repeat. Page statements distinguish proven remaining messages, unread session data, and the end, including pages with no rendered messages. Malformed non-message entries still advance the source position. Appends and path replacement publish no partial page. Existing repeat listing and bounded exact raw output remain unchanged.

Manual Bot ticket 0013 makes semantic record inspection parse one fixed held-file snapshot incrementally. It preserves the 1 MiB and 10,000-segment limits, strict UTF-8, CR bytes, torn-final-segment omission, source metadata, record classifications, and final path and file stability checks. A failed read or stability check discards partially visited lines. Raw records and sessions keep their existing readers.

Manual Bot ticket 0012 bounds gate feedback without truncating its evidence. Valid UTF-8 gate output reaches the model unchanged through 10,000 bytes and terminal reasons unchanged through 2,048 bytes. Larger output uses deterministic code-point-safe head-and-tail views with byte counts and a `check.capture` reference. Invalid UTF-8 remains exact only in the capture and produces a fixed truthful message without partial decoding or replacement text. Ordinary retries, exhaustion, exit 75, check events, and failure-hook capture paths keep their existing meanings.

Manual Bot ticket 0011 contracts raw record transport onto Node's file-handle stream and standard pipeline. The source stream ends at the safely opened descriptor's initial size. A non-closing file-descriptor stream owns standard output, so backpressure and delayed `EPIPE` or `ENOSPC` errors need no global output-owner state. Exact bytes, early-EOF detection, explicit descriptor close, and the existing diagnostics remain unchanged.

Manual Bot ticket 0010 makes `loop_done.ended_by` preserve the exact failed-body cause. Refused, exhausted, rejected, blocked, timed-out, and faulted bodies no longer collapse into one value. Stop, authored-limit, question-limit rejection, reasons, repeat counts, overall results, and outside-signal sequencing remain unchanged.

Manual Bot ticket 0009 adds `bot show RUN --raw` for exact retained record bytes. The raw path bypasses semantic parsing and whole-record bounds, fixes its snapshot from one safely opened regular-file descriptor, and does not chase appends or path replacement. Raw child access requires one exact authorization in a structurally valid parent before it bypasses child validation. Failures before open publish no bytes. Input-read, standard-output delivery, and descriptor-close failures preserve bytes already written, name their phase and stable immediate cause in a bounded diagnostic, and exit one. A closed output pipe stays quiet.

Manual Bot ticket 0008 lets exact-name, bytewise `--keep`, and writer-name `--age` selection remove a stopped structurally invalid run. Age accepts only a calendar-valid UTC timestamp at second precision from the exact writer run-name shape. Cleanup trusts independent lock, process-group, selected-name, and owned-tree evidence instead of invalid record events. Automatic selection still refuses missing, non-file, unsupported-version, and unreadable records.

## 2026-09-04

Manual Bot ticket 0006 makes the current record reader validate one possible run story before operational commands trust its facts. The specification now defines valid, incomplete, and invalid stories, current event shapes and byte-visible transitions, outside-signal ordering, root-lock compromise as a machinery fault, child-record agreement, stable search snapshots, fail-closed cleanup, and the provisional forensic JSONL reading. It also removes the unused pre-release record-migration promise.

## 2026-08-30

Ticket 0184 corrects access and durability claims to match existing behavior.
Access policies govern direct model-facing dispatch rather than containing an
admitted executable, and terminal record-file sync does not confer
whole-run-tree power-loss durability.

## 2026-08-29

Ticket 0176 records optional stage model-tool access policies and bounded denial
events so interrupted runs retain the enforcement evidence.

## 2026-08-28

Ticket 0165 updates the frozen human record reading so `bot show` leads
with the run outcome, identity, elapsed time, and stage and total spend.
It preserves every event after the summary while compacting adjacent
identical transport rows and humanizing aligned turn token counts.

## 2026-08-27

Ticket 0160 recharacterizes temporary-size sampling cadence, busy-heartbeat
freshness, and scratch-cache paths as runtime choices while preserving their
portable observable guarantees. Runtime behavior and conformance cases do not
change.

Ticket 0159 makes the spec gate refuse missing relative links in published
chapters. It also repairs three links, rejoins the Frontmatter refusal table,
and removes a duplicate conformance-ledger entry without changing the contract.

Ticket 0154 gives prompt construction its own gating-owned record event. A
successful before hook is recorded before prompt preparation, while historical
prompt-bearing stage and hook events remain readable
([record.md](elements/record.md)).

Ticket 0161 makes sealing sync the terminal record append, so sealed records
survive power loss while an unsealed tail may still be lost. It records this
two-tier durability boundary in the record contract.

Ticket 0158 publishes the 0.1 compatibility and conformance policy, labels each
normative chapter stable or provisional, and documents the shipped draft,
rejected-output, and version 1 inspection shapes. Runtime behavior and corpus
cases do not change.

Ticket 0157 completes the intelligence-only documentation sweep across the
authoring contract, worked example, inspection output, and conformance prose.
Runtime behavior and conformance results do not change.

Ticket 0152 makes the spec gate compare every record event and top-level field
with a compiler-derived vocabulary on every run. It also documents the
additive `prompt` field from ticket 0132 on `stage_start` and `hook`, and the
public `promptConstruction` inspection result for records with and without
that provenance ([record.md](elements/record.md)).

Ticket 0150 adds a durable gate-start event naming the stage identity, gate
file, and pinned hash before execution begins. The later completed check
remains the authoritative verdict, so live and interrupted runs expose work
in progress without claiming an outcome ([record.md](elements/record.md)).

## 2026-08-26

Ticket 0128 removes literal model choices and the profile-and-tier scheme from
all authored rungs. A run now resolves one complete provider, model, and
reasoning bundle from the home's named `intelligences` table, using the
`default` row lazily when no rung names one; retired keys and options refuse
with migration guidance ([home.md](elements/home.md),
[invocation.md](elements/invocation.md), [refusals.md](elements/refusals.md)).

Ticket 0145 makes durable-run pruning honor retained process-group evidence.
Live, malformed, or unreadable evidence refuses removal independently of a
stale lock, and deletion checks the evidence again after claiming the run
([inspection.md](elements/inspection.md)).

Ticket 0142 adds strict-by-default assembly root policy. Assemblies may declare
opaque top-level `folders`, or set `strict: false` to make other unknown roots
opaque. Opaque contents are not validated, captured, executed, or included in
procedure identity ([assembly.md](elements/assembly.md),
[refusals.md](elements/refusals.md)).

Ticket 0141 makes the sequence-tail rule unconditional: every sequence ends in
a stage, and an `intelligence` remains model configuration with no grammar
exception ([graph.md](elements/graph.md),
[refusals.md](elements/refusals.md)). It also preserves a task file's request
extension, refuses a nearer `model`, `provider`, `reasoning`, `profile`, or
`tier` against a farther intelligence, and recognizes an exact,
case-sensitive `Checklist` heading at any legal ATX level
([invocation.md](elements/invocation.md),
[checklist.md](elements/checklist.md)).

Ticket 0141 also closes three wind-down gaps. Tap detach now waits for in-flight
record appends before `stage_end`, a late temporary-size fault is re-read before
success is sealed, and failed temporary teardown records `tmp_teardown` without
displacing a settled stage or flow outcome ([record.md](elements/record.md),
[runtime.md](elements/runtime.md)).

Ticket 0133 adds `bot capture` inspection for listing and reading the sealed assembly a run actually executed. [inspection.md](elements/inspection.md) distinguishes absent, unreadable, partial, and complete captures, preserves exact file bytes for programmatic readers, and confines untrusted run and file paths.

## 2026-08-24

Ticket 0135 adds parent-authorized `bot show --child REFERENCE` inspection for a recorded subflow child. [inspection.md](elements/inspection.md) keeps child references opaque and confined beneath the opened parent, returning the child’s sealed facts only when the exact started `subflow_call` recorded it; missing, malformed, unrecorded, linked, escaping, unreadable, and non-file children are unavailable.

## 2026-08-23

Ticket 0123 adds `intelligences`: a flat home table whose names resolve complete
provider, model, and reasoning bundles at every option rung. Literal model
choices and profiles remain independent during migration; the chosen name is
recorded with resolution but never exposed to agent prompts.

Ticket 0127 adds an assembly `tmp-max-bytes` setting, defaulting to one GiB.
A runtime samples each live stage's backing `$TMP` path and faults only when
readable bytes exceed that ceiling; unreadable or vanished descendants count as
zero while readable siblings remain measurable.

## 2026-08-22

Ticket 0120 makes record-format evolution executable. The frozen v1 corpus
preserves its original JSONL while bot normalizes it in memory before
inspection, so later non-additive generations can retain a total migration
chain instead of rewriting history. A record version without a carried chain
is refused by name; additive fields remain ignored by readers that do not use
them.

Ruled by Ian from the 2026-08-22 principles review, no ticket: the record
format commits to an evolution policy. [record.md](elements/record.md) now
says how the format changes: additive fields are not a new format and readers
ignore what they do not recognize; a non-additive change is a new generation
named in the first line, and a runtime that reads records carries automatic
in-memory migration for every prior generation — files on disk are never
rewritten, and an unknown generation is refused by name, never guessed at.
The conformance corpus keeps a frozen record from each retired generation so
"the past stays readable" is tested, not assumed. Before this, the version
line existed but nothing said what happens when it changes — a plan that had
never been exercised is not a policy.

Ruled by Ian from the 2026-08-22 principles review, no ticket: the
specification stops prescribing the provider retry policy.
[runtime.md](elements/runtime.md) no longer fixes a retry count or delay —
those are the runtime's business, like the rest of turn continuation. What
remains is the observable contract: every runtime-selected retry is recorded,
retrying stays inside the stage's deadline, and a provider failure that
remains is cause `fault`, never a verdict on the agent. The shipped runtime
had already drifted from the old sentence (two retries with a doubling delay
against a promised one at a fixed delay), and the promise was the wrong side
to keep.

Same ruling, same review: [record.md](elements/record.md) stops naming one
runtime's dependency world as required record fields. `runtime_source` and
`runtime_digest` stay required of every runtime; `lock_sha256`, `node`, and
`provider_adapter` become bot's own dependency identities, with any runtime
recording the equivalents for its own stack. The provider-transport event
sheds its "Codex call" framing for adapter-generic wording. A record format
that names one vendor and one language runtime cannot be the vendor-neutral
format the specification claims.
Ticket 0091 clarifies five specification passages about schema and gate
judgment, stage scripts, run-id files, checklist states, and task-file
precedence without runtime behavior changes.

Ticket 0086 makes a stale run idle only when it has no live durable child-group evidence. [runtime.md](elements/runtime.md) requires a reservation before detached children start, and [inspection.md](elements/inspection.md) keeps an abruptly killed run busy while its child group remains alive.

Ticket 0112 adds the `fault` control tool. An agent can report a reason at any
terminal control point, ending its stage and run with exit `2` and cause
`fault` without checks or retries; the runtime, stage, graph, invariant, and
record contracts now share the seven-tool vocabulary.

Ticket 0118 makes a `failure` hook's exit, timeout, non-execution, output overflow, and hash-recheck drift diagnostic evidence only. The hook remains recorded without replacing the failed stage or run ending; gates and `before`/`success` hooks retain terminal force.

Ticket 0084 makes declared slot names ASCII POSIX identifiers and refuses case-insensitive uppercase export collisions at check time. [slots.md](elements/slots.md), [refusals.md](elements/refusals.md), and the conformance corpus ensure hooks and gates never receive an unreachable or silently overwritten declared variable.

Ticket 0092 moves the `bot check --json` output contract to
[conformance.md](conformance.md), because every accept case asserts it.
[inspection.md](elements/inspection.md) now describes the command and links that
contract; behavior and the corpus stay unchanged.

Ticket 0107 makes `bot prune` report and remove stale legacy worktree-holder locks, then remove their holder-key directory only when it is empty. A live holder or any unrecognized key entry remains, preventing crashed-stage debris from accumulating without widening prune's deletion boundary.

## 2026-08-21

Ticket 0110 extends flow procedure context into composite stages. Prompts name the enclosing loop, parallel branch, or choice alternative and retain the static root `Step N of M.` position, while empty bodies remain silent.

Ticket 0114 makes `$TMP` disposable at its scope boundary: each stage-owned directory is removed when its stage settles, a `tmp: flow` directory is removed when its flow settles, and refusal or handled signal paths remove what remains. Inputs, outputs, sessions, skills, and sealed record material remain available; this prevents toolchain temporary files from accumulating.

Ticket 0116 makes every normally completing stage warn once before it destroys
a non-empty `$TMP`. The warning names durable homes and a stage-bound
`clean-temp` confirmation, preserving evidence without spending a retry.

Ticket 0093 makes a nonblank ordinary `FLOW.md` body procedure context for
each stage in a flat flow, followed by its static `Step N of M.` position. A
blank body stays silent. [flow.md](elements/flow.md) and
[prompt.md](elements/prompt.md) define the shared context so authored procedure
prose reaches every fresh stage without replacing the stage's own instruction.

Ticket 0108 makes every record-controlled inspection read validate each run-tree
component and hold its regular file object through the read. Links, missing,
unreadable, non-file, and replaced paths retain their existing refusal answers;
healthy reads remain byte-exact.

Ticket 0053 makes `bot prune` select only provable garbage by default: orphan
locks and home-owned ended, missing, or dead-staging scratch. `--keep`, `--age`,
and exact run names select durable runs explicitly; the retired `--count` and
`--refused` flags no longer widen deletion. Every deletion remains report-first
and rechecks liveness at its edge.

## 2026-08-20

Ticket 0083 caps every mixed-flow subflow call chain at ten calls.
[subflow.md](elements/subflow.md), [descend.md](elements/descend.md), and
[invariant 32](elements/invariants.md) distinguish that fixed runtime safety
ceiling from authored `max-depth`; the witness ledger names the offline chain
test.

Ticket 0072 limits a child subflow's automatic context to 10,000 UTF-8 bytes,
including its truncation marker. Larger output supplies a marked bounded prefix
while retaining its full size and path, preventing a large single-line or
multibyte output from crossing the context limit.

Ticket 0085 replaces the stage-holder `bot worktree` probe with quiet `bot busy <directory> [--home DIR]`. It answers `0` or `1` from fresh ten-second run heartbeats: a live run owns its absolute root, active resolved stage overrides, and independent nested children; completed overrides, missing records, and stale heartbeats do not. A live unreadable or malformed record, child, or traversal is conservatively busy, and neither stream receives probe output.

Ticket 0052 replaces `bot run --continue` with `bot resume RUN`, which derives
the assembly, optional flow, and request from a verified dead donor. Only its
sealed plain root-stage prefix is carried; containers and child flows restart
fresh, and carried stages do not rerun their checks, gates, or hooks.

Ticket 0082 makes a `gate/` folder refuse entries whose stems are `before`,
`success`, or `failure`. The entry names its path and tells the author to put
hooks in the stage folder, preventing a file from becoming both a gate and a
hook.

Ticket 0088 makes `bot runs` omit a live run whose `record.jsonl` is not yet
readable, rather than publishing null identity fields. A record-less directory
without a live lock remains `no-record`.

## 2026-08-18

A consistency sweep across the elements, changing no behavior: the skill scopes are counted as [skills.md](elements/skills.md) defines them, `profile`, `tier`, and `local-context` are named where the rungs' settable keys are listed, [graph.md](elements/graph.md) keeps the word container to the three control sentinels and states the stage-only `workdir` exception, `width`'s ceiling of 32 stands beside its floor in [invocation.md](elements/invocation.md), [choose.md](elements/choose.md) splits zero alternatives (`folder-empty`) from exactly one (`chooser-invalid`), `$BOT_RUN_ID` and `TMPDIR` join the pass-through exceptions in [slots.md](elements/slots.md) and [invariant 43](elements/invariants.md), an extensionless task file's request is `.txt` in [slots.md](elements/slots.md) as [invocation.md](elements/invocation.md) always had it, [conformance.md](conformance.md) marks a case's `home/` optional, and [README.md](README.md) links [the witness ledger](elements/invariants-witnesses.md), whose row 7 now names `subflow` as the fifth control tool. Recorded here late: ticket 0142 (commit 4123ad0) renamed `bot tools` to `bot logs` in [inspection.md](elements/inspection.md) without an entry — the `bot tools` the 0127 entry below mentions is that verb, since retired.

The tail question is ruled: every sequence ends in a stage, whatever the container — the rule [graph.md](elements/graph.md) already carried and the runtime already enforced. The Nesting section's "stands anywhere a stage does" now says except last, [refusals.md](elements/refusals.md) states the `tail-container` fault as a container standing where a stage must, [the worked example](example.md) gains `05-report.md` so its flow no longer ends in its `CHOOSE`, and the corpus pins the ruling with `tail-container-choose` and `tail-container-loop`.

## 2026-08-16

Ticket 0044 makes `bot prune --scratch` reclaim selected ended-run and orphan scratch without deleting run directories or locks. [inspection.md](elements/inspection.md) keeps the flagless prune report unchanged.

## 2026-08-14

Ticket 0041 makes `bot request <run>` retrieve a run's retained request byte for byte. [inspection.md](elements/inspection.md) keeps established run resolution and refusal behavior while rejecting missing, unreadable, and non-regular request files.

## 2026-08-13

Ticket 0037 makes the gate-retry frame neutral across the runtime, specification, and live retry-session coverage. [gate.md](elements/gate.md) no longer assumes repository commits or tickets.

Ticket 0027 records exact resolved `pwd`, `input`, `output`, `tmp`, and `skills` paths on every output-bearing `stage_start`, including gate retries. [record.md](elements/record.md) leaves chooser records without slots and documents the additive contract.

## 2026-08-12

Ticket 0019 records portable `stage_start` workdir metadata and renders it in `bot show`. [record.md](elements/record.md) preserves authored and root-relative stage locations without machine-specific absolute paths, while [inspection.md](elements/inspection.md) reads older records as inherited root.

Ticket 0034 ships the caller-owned workspace fixture for the `accept/container-workdirs` case. The [conformance corpus](conformance.md) now tracks its request and alpha, beta, shared, and loop marker files, so every declared workdir exists after landing.

Ticket 0018 pins authored workdirs inside containers. [stage.md](elements/stage.md) gives parallel branches their authored directories, permits deliberately shared directories, keeps loop repeats in one directory, and lets container subflows inherit the calling stage's directory.

Ticket 0029 records runtime provenance on every top-level and subflow `run_start`. [record.md](elements/record.md) names the executing checkout when available, exact lockfile SHA-256, Node version, and resolved provider adapter identity; non-checkout runs record an unknown source and null digest.

Ticket 0025 lets `bot run --continue RUN` start a new run from independently verified sealed stages without resuming the donor process. [invocation.md](elements/invocation.md), [record.md](elements/record.md), and [runtime.md](elements/runtime.md) keep donor records unchanged, carry only proved completed work, and state the new run's provenance.

## 2026-08-10

Ticket 0017 lets a stage select an existing, explicit relative `workdir` beneath the caller-selected `--in` root. [stage.md](elements/stage.md), [slots.md](elements/slots.md), [subflow.md](elements/subflow.md), [invocation.md](elements/invocation.md), and [inspection.md](elements/inspection.md) define caller-owned placement, check rendering and refusal, local-context and hook/gate use, plus inherited subflow directories and root-based child overrides; the conformance corpus pins valid, missing, and invalid declarations.

Ticket 0014 gives executable gates an audited external-blocker verdict: exit `75` with nonempty captured output ends the stage and run at `1` with cause `blocked`, preserving the gate's exact evidence rather than wasting retries on a machine condition outside the agent's authority.

Ticket 0013 makes [`bot assembly install`](elements/management.md) resolve a supplied `#subdir` within its source root and excludes a source-provided `.bot-source` before writing provenance in staging, so source selection and metadata cannot escape their installation boundary.

Ticket 0011 makes [management.md](elements/management.md)'s install materialize beside its requested name and rename only after copy and provenance are complete, so an interrupted copy does not publish a partial assembly at that name.

Ticket 0010 makes local install provenance in [management.md](elements/management.md) the locator root's canonical absolute real path plus any supplied `#subdir`, so update reads that stored source independently of cwd and refuses at it while retaining the installed copy when it is missing or no longer an assembly.

## 2026-08-09

Ticket 0007 frames failed gate output before handing it back to the agent in
[gate.md](elements/gate.md), [gates.md](elements/gates.md), and
[record.md](elements/record.md). The frame says the output did not pass review,
asks for a repair and commit, asks for a plain statement when the cause is
outside the ticket, and then gives the gate's output unchanged. It does not
name the runtime machinery that made the judgment; retries and the gate's
capture remain unchanged.

## 2026-08-08

Ticket 0005 gives `bot run` the conventional `--` end-of-options marker in
[invocation.md](elements/invocation.md). Options precede the marker; the
assembly/flow and request after it are positional even when they start with a
dash. `bot run --help` names the marker, while other commands and invocations
without it are unchanged.

Ticket 0006 makes `mark` require evidence in [checklist.md](elements/checklist.md), [runtime.md](elements/runtime.md), and [record.md](elements/record.md). The runtime requires a nonempty string but does not judge its quality; accepted marks retain it beside the decision in the run record.

Ticket 0002 adds `$BOT_RUN_ID` to [runtime.md](elements/runtime.md): every
process a run starts receives its run directory's basename, and no run path or
other new environment variable.

Ticket 0004 makes an unfinished checklist name the action that resolves it in
[checklist.md](elements/checklist.md): after the numbered unmarked items, the
send-back says that an item done must be marked with `mark` and that prose does
not count. Checklist states, ordering, retries, and every other check's message
are unchanged.

Ticket 0001 adds `bot run --id-file PATH` to
[invocation.md](elements/invocation.md) and its run-start ordering and
machinery-fault rule to [runtime.md](elements/runtime.md). The run-only option
writes its id after `run_start` and before any stage work, while stdout remains
answer-only.

## 2026-08-07

A reason is spelled, never obeyed — ticket 0165, in
[inspection.md](elements/inspection.md) and
[runtime.md](elements/runtime.md). A reason is text the run itself produced —
an agent's own words, or the output a gate wrote and the machinery kept — and
a terminal obeys what it is handed: `ESC[2J` clears the reader's screen, a
carriage return repaints the line they were just shown, a direction override
reverses one without altering a character of it. Wherever bot prints a reason
it now prints the escape instead — `\x1b`, `\r` — and so does any character
that would reorder the line. A tab is ordinary text and stays a tab. Nothing
is dropped: a reading that differs from the record in a way the reader cannot
see would be the worse failure of the two. `--json` is untouched, being the
record's own bytes, and so is what a failed check hands back to the agent —
the model still receives the gate's exact output, because only the printing
changed.

`bot show` reads the record as a story — ticket 0164, in
[inspection.md](elements/inspection.md) and one sentence of
[slots.md](elements/slots.md). The human mode was the whole event object
printed by `util.inspect`, braces and quotes and every field regardless of
worth: the record's own job done a second time, which `--json` already does
byte for byte. It is now one line per event in four columns — when, the
event's own word, the stage, then a clause built from the fields that matter
for that kind of event and not from the rest. The nouns stay the record's, so
a reader who greps the file for a word they read here finds it; everything
else is plain English and numbers are bare. A reason that runs to a paragraph
gives its first line. The scratch section no longer prints a row for a
directory that is gone: a path naming nothing is not somewhere to go, and
`slots.md`'s sentence about it changed with the behaviour. `--json` did not
move one byte.

`bot models` lists what this machine can call — ticket 0162, the second and
last command of ADR 0019's ratified surface, in
[inspection.md](elements/inspection.md). Bare, it lists only the models whose
provider holds a complete credential in bot's own snapshot — bot's credential
file and the environment, nothing ambient beyond them — one line per model
with its context window, output ceiling, whether it reasons, and cost per
million in and out; nothing configured is zero lines, exit `1`, and stderr
points at `bot auth`. Named — `bot models anthropic` — it lists that
provider's whole catalog, callable or not: naming the provider is accepting
the length. The catalog is the pinned model library's and goes stale with the
pin, said out loud in the help screen; nothing on this surface reaches the
network, and `--home` is refused the way `bot auth` refuses it — models
belong to the machine. `--json` is one object per model per line, the
listings convention. The unknown-command refusal now names all thirteen
words.

`bot config` reads the home out loud — ticket 0161, the first command of
ADR 0019's ratified surface. A new top-level reading in
[inspection.md](elements/inspection.md): where the home is and which of the
three ways it resolved, whether a `config.yaml` stands there, the scratch root
and the credential file's path — named, never opened — then the defaults each
stamped `home` or `default` in the vocabulary `bot check` already prints, then
the profiles one cell per line. `--json` is one object, the one listing that
is not a list. The no-secrets promise is structural rather than filtered: the
command prints only the parsed values the closed-key readers return, so bytes
pasted into `config.yaml` have no path to stdout — an unknown key refuses
`key-unknown` naming the key, exactly as every reader of that file always has.
Nothing on this surface may call the credential store, and the boundary
against check is stated where both live: config answers what the home says,
check answers what a run would do.

Check walks the children — ticket 0159, from the 0154 study. `bot check`
rendered only the invoked flow, so a model-less stage inside a `subflows/`
tree passed check and refused at run, the assembly-agent invocation validated
the model of no stage at all, and a render-level input collision inside a
subflow was caught by nobody — against [inspection.md](elements/inspection.md)'s
"refused here exactly as it would be at run time, with the same code and the
same path". Now check renders every reachable subflow — the assembly's, the
flow's, and every stage folder's, each under a child's own invocation, since a
child never inherits the command line ([subflow](elements/subflow.md)) —
keeping the faults and emitting no lines, so `--json` stays the invoked flow's
own. Six corpus cases pin it (106 → 112 → 118), and
[conformance.md](../specification/conformance.md) drops its false affordance
that an invocation line "may be a `bot run`": every rule the corpus states is
within check's reach. The catalogue half stays open by design — check still
never holds a model catalogue. **This narrows behavior two ways: a tree whose
subflow stages collide on inputs ran yesterday and refuses today, under both
verbs; and a model-less subflow stage that passed check yesterday refuses at
check today, as it always did at run.**

Every rung relieves the assembly — ticket 0153, from the 0149 study. The
shared validation pass behind `bot check` and `bot run` resolved its
whole-flow model statement with an empty stage rung, so an assembly whose
model was named only on a stage or container was refused `model-unresolved`
at `ASSEMBLY.md` — against [assembly.md](elements/assembly.md)'s own "required,
unless a higher rung or the home sets one". Now the absence is asked of each
holder that runs an agent, at that holder's own path, with the same sentence a
run's walk gives; containers are never required to settle a model of their
own, and their `--json` line simply carries no `model` key when no rung named
one. The assembly agent (`bot check` with no flow named) still requires its
model at `ASSEMBLY.md` — it runs `ASSEMBLY.md` itself, with no higher rung to
relieve it. **This widens behavior: trees refused by check and run yesterday
run today.** The corpus grows 106 → 112: the moved refusal path, four accept
rows (stage-only, container-only, profile-on-stage, profile/tier split across
rungs), and two refusals pinning that the agent path legitimately differs and
that the fault lands at the model-less stage alone. No spec sentence changed —
the fix makes the runtime obey sentences already written.

The spec loses its spare words — ticket 0152, the terseness pass ruled
2026-08-05. Eleven files compressed, net −23 lines, no meaning moved: every
cut was a sentence restating a law that stands elsewhere in the same file, an
epigram, or authoring advice — never the law itself. Eighteen files were left
whole as already terse, and a dozen sentences that read as recap were left
standing because they carry the argument they appear to repeat; the ticket
lists them. No refusal code, key name, slot name, or quoted literal changed;
the conformance corpus is untouched.

The spec says what it means — ticket 0150, four accuracy fixes, no behavior
moved. [Skills](elements/skills.md) names the standard it follows — Agent
Skills, at [agentskills.io](https://agentskills.io) — and states the one
departure plainly: the folder is the skill's name, and a `name` key is an
extra key like any other, never read and never refused (verified against the
runtime and probed live before ruling). [Conformance](conformance.md)'s
Shape row stops enumerating cases the corpus owns and describes the family
instead — a document that restates a fact the tooling already owns will
eventually lie about it, and this one had. [Subflow](elements/subflow.md)'s
`input-file` slot list admits `$SKILLS`, which the runtime always expanded,
and says plainly that a subflow — being a flow folder — may carry its own
`skills/` and `subflows/`, resolved narrowest-first. Corpus untouched at 106.

## 2026-08-06

Profiles land in the chain — ticket 0146, ruling by
[ADR 0018](../sdlc/planning/adr/0018-profiles-two-dimensional-model-indirection.md)
(ratified the same day). The home's `config.yaml` may hold a closed `profiles:`
table — profile name × tier name → a bundle of `provider`/`model`/`reasoning` —
and `profile` and `tier` join the resolved keys, riding
[the eight-rung chain](elements/invocation.md) independently, `--profile` and
`--tier` included. The model choice is one fact with two spellings: the nearest
holder that speaks it (literal `model` or `profile`) supplies its spelling
whole; one holder spelling it both ways is refused; a nearer `reasoning` or
`provider` overrides the bundle's. A profile with exactly one tier may be used
without naming it; every lookup failure refuses as `model-unresolved` with a
sentence naming what the home does hold; a bundle without `model` is
`key-missing` (the code names the fix). Provenance carries both the literal
values and the profile/tier they came through, and a home with no table — or an
unused one — behaves byte-identically to today. The conformance corpus grows
94 → 106, each row a ruled decision: the wire format, the omission rule,
literal-beats-profile, the four refusals, and the invisibility promise.

Authentication becomes its own chapter — ticket 0145, completing
[ADR 0017](../sdlc/planning/adr/0017-bot-owns-its-authentication.md). New
[authentication](elements/auth.md): bare `bot auth` lists every provider with
how a person signs in and where its credential comes from (signed in / from the
environment / none — never a token, a fragment, or an expiry); `bot auth login
<provider>` runs the provider's own sign-in through a terminal bot supplies —
printing URLs and device codes, never opening a browser, refusing piped input
up front — and stores what the flow returns in the machine's one credential
file; `bot auth logout <provider>` removes one provider's login, and logging
out of nothing stored is an answer, exit 1. A login that does not finish stores
nothing and says one sentence of bot's own — the provider's failure text is
never repeated, because a failed token exchange can carry the very credential
the file exists not to print. [Inspection](elements/inspection.md) returns to
one exception (`bot prune`) and points here.

`bot output` verifies the bytes it reproduces — ticket 0147, ruled by Ian the
same day. The record has carried a `sha256` for every sealed output since seal
time, and no reader ever consulted it: the first sealed ladder's falsification
proved a one-byte in-place corruption of a sealed file reddened nothing, because
every reader of a seal reads the file itself and so confirms whatever it now
holds. [Inspection](elements/inspection.md#bot-output-run-stage) now says the
verb hashes what it read against the record and refuses a mismatch in one
sentence, exit 1, nothing on stdout — because `output` REPRODUCES an answer
where the other verbs describe one, and the scope stops there: no other verb
grows a check under this ruling. A seal that carries no hash promised none and
its bytes come back as ever.

Bot holds its own credentials — ticket 0144, ruling by
[ADR 0017](../sdlc/planning/adr/0017-bot-owns-its-authentication.md). The runtime's
logins were reached through a pointer an operator set, and that pointer had in
practice always pointed into another agent's folder, so every live run to date
authenticated out of somebody else's store. [The home](elements/home.md) now
names the second thing that is deliberately not in the home: credentials, in one
file for the machine at `${XDG_CONFIG_HOME:-~/.config}/bot/credentials.json`,
born owner-only, because a login belongs to the operator where a home is a
workspace and no one should log in once per project. `--home` does not move them
and no bot-named variable points at them — the pointer is gone, not renamed, and
`$BOT_HOME` is again the only variable the runtime reads.
[Inspection](elements/inspection.md#bot-auth) gains `bot auth import <file>`,
which fills that file from a credential file a person names: providers already
stored are replaced, providers the named file does not mention are left alone,
writing takes the lock every credential write takes while a file replaced whole
is what makes the lockless read of the source safe, and nothing — success,
refusal or listing — ever prints a credential. Where credentials come from
otherwise is unchanged: a stored login owns its provider and the environment
answers for the rest. [Slots](elements/slots.md) states one rider: a stage's
processes carry `TMPDIR` set to the stage's `$TMP`, so a program that mints its
own temporary files leaves them in the run's scratch rather than the machine's.
No invariant changed and the conformance corpus is untouched.

Scratch is closed and owned — ticket 0140. The cache the runtime works in held
the same bytes the home holds — every prompt, every `$INPUT` copy of a request,
every output a stage sealed, every skill materialized for it — and none of the
care. Measured under a permissive umask, the whole tree was born `0o777` while
the run's own copies were `0700`; [the home](elements/home.md) now says the
scratch root is closed by the same door, at its root, nothing beneath it moded
separately. Worse, and reproduced before it was fixed: a run's scratch was keyed
by the run's basename alone, and the cache root is shared by every home on the
machine. Two homes that mint one run name — a second and two random bytes — got
one directory, and `bot prune --delete` in either home deleted the other home's
work while reporting only its own. The entry is keyed by the home as well now,
which is what lets prune name the scratch nothing accounts for — a home deleted
whole, a clone a kill interrupted — while listing another home's never, let
alone removing it ([inspection](elements/inspection.md)). Two honesty paragraphs
came with it. [Slots](elements/slots.md) stops promising what a cache directory
can keep: scratch is retained best-effort, anything may reclaim it, and a run's
record is whole without it — so `bot show` marks a directory that is gone
instead of naming it unmarked. And [the home](elements/home.md) states as a
ruling what was an omission: runs live in the data home rather than
`$XDG_STATE_HOME` and configuration in the home rather than `$XDG_CONFIG_HOME`,
because the home is one folder holding everything bot owns and three directories
kept in step are three ways to be half there. No invariant changed and the
conformance corpus is untouched.

The environment is bot's — ticket 0139. [The home](elements/home.md) said
`$BOT_HOME` is "the one variable scrubbed from every stage's environment", and
that sentence was stronger than the code: the runtime deleted the name from the
environment it composed, and then the agent's shell put it back. The harness
under bot hard-codes environment inheritance for its shell tool and lays the
runtime's own process environment UNDERNEATH the one it is handed, so every
name bot scrubbed resurfaced in every command a stage ran — with whatever else
the caller's process was carrying, ambient API keys included. Reproduced first,
then closed: the shell a stage gets is now the environment bot composed and
nothing beneath it, which is what the paragraph says now. Two things follow it
there. Provider auth resolves from that same snapshot rather than from ambient
process state — an env-var key works exactly as it is documented to, and the
credential-file probes that went looking around the machine on their own answer
nothing — and a `~` at the front of a path handed to a file tool is refused,
because it is shorthand for a directory the agent was never told about. The
refusal is obscurity and not prevention, and the paragraph says that too: a
path written out in full still reaches wherever the operating system allows.
No invariant changed, nothing a user types behaves differently, and the
conformance corpus is untouched.

## 2026-08-05

The witness ledger stops understating itself — ticket 0135, the closeout
campaign's last. [The ledger](elements/invariants-witnesses.md) is a claim about
the test tree and it had gone stale in the way it exists to catch. Its count
table still read `UNWITNESSED 1 — invariant 22` and its closing paragraph still
said quartering every gate's clock was green, both written before ticket 0133
rewrote that row: the mutation was applied again for this entry and it reds
`gating.test.ts` "a gate is armed for the whole stage budget" with the row's own
numbers. The backlog is 49 witnessed, 0 unwitnessed, 1 unwitnessable by design —
empty for the first time, so the count now points at the eight rows carrying a
stated honest limit instead, which is where the thinness actually lives. Row 39
cited a test name that ticket 0125 renamed and row 50 already carried the new
one; row 19 gained the far end of "bytes are preserved end to end" —
`output-verb.test.ts` compares what `bot output` emits against the sealed file
itself. No invariant changed and no runtime behavior is described differently.

Install copies an assembly or refuses — ticket 0137, from the 0130 build's
premise corrections. [Management](elements/management.md) says what `install`
will put at a name: only an assembly, and where it refuses, the home is left
exactly as it was found. `bot assembly install ./dir-with-no-ASSEMBLY.md`
exited 0 announcing a success, and what it copied was then listed by nothing,
counted by nothing and removable by nothing — `remove` refused it as a name the
home does not hold; installing a FILE crashed out with a raw `ENOTDIR` string
and left the file standing at the name. Both are one fault with one predicate,
the `ASSEMBLY.md` question every reader already asks, and the refusal is the
reader's own: `assembly-unknown`, "Name an assembly; what is there is not one."
The asymmetry with `link` is the point and is written down — a link is read
afresh at every read, so a broken one is marked; an install freezes a copy, so
what it puts there has to be one already. [Refusals](elements/refusals.md)
widens the `assembly-unknown` row to the source `install` was pointed at. No
rule about linking changed, and no corpus case moved.

Management reaches any home — ticket 0136, from the 0129 audit.
[Management](elements/management.md) gains the sentence
[inspection](elements/inspection.md) already carried: every command there works
in one home, and `--home DIR` names it. `bot assembly list --home /tmp` refused
the flag as a stray argument, so the only home management could ever install
into, link into, update or remove from was the one `BOT_HOME` named — while
`bot run` and every reading verb had taken the flag for tickets. One flag, one
meaning; [the home](elements/home.md) is still the only chapter that states the
resolution order. No rule changed for a runtime that had already read the
inspection sentence as the convention it is.

The run says where it is, and hands back its answer — ticket 0134, from the
usability playtest. [The runtime](elements/runtime.md#streams) gains one
sentence: while standard error is a terminal, a run names each stage there as
that stage starts. A live run was silent from start to finish and a reader took
the silence for a hang. It is a display and it is described as one — a capture,
a pipe or a redirect receives exactly what it received before, the record holds
no line of it, and standard output stays the answer alone. The terminal
condition is the ticket's own rule for the trailing newline turned on the other
stream: what is added for a terminal may not change what a pipe gets.
[Inspection](elements/inspection.md#bot-output-run-stage) gains
`bot output <run> [stage]`, the only command there that does not write lines:
the run's answer, exactly the bytes it sealed, because `bot show` named the
file and `cat` was the only way back to your own result. Only a run that ended
in success answered; a stage argument reaches an inner output whatever the run
did, which is how far it got. The chapter also says why a run has exactly one
answer: a flow ends in a stage, so the containers on the way seal outputs the
run never answered with and the tail's is the last of them.

The missing witnesses and the dead branches, cut as ticket 0133 from the
external review. One [refusal](elements/refusals.md) row and one witness row
changed; no rule changed. `path-missing`'s row named `--in`, a slot's value and
a `@task` file, and the code has always also refused three ways of putting an
assembly in the home — a source that is neither a folder that exists nor one
git can clone, a `#subdir` the fetched source does not hold, and a link's
target — so the row now states its real span and leads with the shared fix, the
way `request-invalid`'s does since ticket 0126. [Invariant
22](elements/invariants-witnesses.md)'s row moves from UNWITNESSED to
Witnessed: the row was written before ticket 0063 built `clock.test.ts` and
`flow.test.ts`'s subflow-clock witness and was never swept, and the two probes
it recorded as staying green — quartering the budget a gate or hook is given,
and dropping the agent's accumulated spend so every send-back armed a fresh one
— are now the two mutations that fail, named in the row with the deadlines they
misread.

The trust boundary said out loud, cut as ticket 0131 from Ian's rulings of the
same day. [The home](elements/home.md) now states the modes: the home and each
run directory are created owner-only, `0700`. Real runs came out `775`, which
on a machine with a shared-group umask left prompts, transcripts and sealed
assemblies readable by every account in the group. The doors are the whole of
it — nothing inside either directory is made private separately, because a
directory nobody may traverse already hides what is under it, and setting a
permission on every file in a tree the owner controls would fight what a person
expects of their own files. Only creation carries the mode: a home that already
exists is left as it stands. [The runtime](elements/runtime.md) states the
other half of the same boundary, which is that there is not one: nothing bounds
a run as a whole — no deadline, no cost budget, no disk quota — a run ends when
its stages do, and supervising it is the operator's job. That is the design for
attended use, not an omission. The local ceilings a run does have are unchanged
and stated where they belong: a `LOOP`'s required maximum
([loop](elements/loop.md)), a `PARALLEL`'s `width` of at most 32
([parallel](elements/parallel.md)), a subflow batch of at most 32 calls
([subflow](elements/subflow.md)), and 16 MiB of output from a gate or hook.

Link tells the truth, cut as ticket 0130 from the same playtest. `bot assembly
link` took any path that existed, so linking a file or a folder that is not an
assembly succeeded, `list` printed the entry with no mark, `bot status` counted
it, and `bot check` on it then said to name an assembly that exists — about an
entry the tool had just listed. [Management](elements/management.md) now defines
a broken link by what it points at rather than by whether it points at
anything: gone and never-an-assembly are one state, `link` marks the link it has
just made, and the state is read at every read rather than judged once, so an
author who links a working tree and writes its `ASSEMBLY.md` afterwards needs no
second command. Linking stays permissive because a target can stop being an
assembly the moment after any check of it, which leaves the readers to be honest
regardless; refusing at link time would have bought a message and left the same
contradiction standing behind it. The refusal keeps `assembly-unknown` — the
code this chapter already required of a run of a broken link, and the one
[the corpus](conformance.md) pins for it — and only its sentence is new, saying
which of the two ways this one went wrong ([refusals](elements/refusals.md)).

Inspection reaches any home, cut as ticket 0129 from the same playtest. `bot
run --help` documented `--home DIR` and run and check honoured it, while all
six reading verbs refused it outright — so a run that lived anywhere but the
default home could be read only by setting `BOT_HOME` around the command, which
the playtester found by reading our own smoke script.
[Inspection](elements/inspection.md) now says that every command in that
chapter works in one home and that `--home DIR` names it. The order the flag
wins by was already [the home](elements/home.md)'s to state, and is not
restated: one flag, one meaning, one place that says what it means.

The tool always talks to you, cut as ticket 0127 from a fresh-eyes usability
playtest. Nine command paths wrote zero bytes and exited `1`, which is what a
crash looks like: no home at the path, a home with no runs, a name matching no
run, a name matching several, a run with no record, a stage or a repeat the run
does not have, a run that made no tool call, and nothing to prune.
[Inspection](elements/inspection.md) now says that finding nothing is an answer
that names which nothing, on stderr, with the exit code unchanged; `bot show`
states the prefix rule it shares with `bot tools` and `bot session` and says
that a shared prefix picks no run; `bot session` says that a `--repeat` the
stage never ran — a stage in no loop included — is nothing found rather than
something else. [Management](elements/management.md) says the same of a `list`
and a bare `update` in a home with no assemblies. Nothing's exit code moved:
the ticket asked whether a `--repeat` on an unlooped stage were a request
fault, and it is not — the run is there and the stage is there, so what was
asked for is missing, which is `1`.

The row tells the truth, cut as ticket 0126. `request-invalid`'s row in
[refusals](elements/refusals.md#resolution) enumerated invocation-shape faults
only, while the code also gives it to every other command line bot cannot act
on: a command or verb bot does not have, a command given the wrong arguments, an
option given no value, a name that would leave the home, and a name the home
already holds. The row now says that, and says the fix they share — change what
was asked for — which is what keeps them one code under
[invariant 39](elements/invariants.md). Nothing moved: every code, path and
sentence is where 0125 left it. Separately, that chapter said a sentence is
"free to be reworded without breaking anything", which 0125's own byte-exact
pins on `bot assembly`'s stderr made read as false. It is the corpus that never
asserts a sentence; a runtime that pins its own sentences in its own tests binds
itself and not this specification, and the chapter now draws that line where a
reader will look.

The code names the fault, cut as ticket 0125 from two of Ian's rulings.
Managing the home was refusing with `request-invalid` for faults no repair to
the request could reach, so [refusals](elements/refusals.md#managing-the-home)
gives `bot assembly` a table of its own: `assembly-in-use` for an assembly a
live run holds — or one nothing can prove idle, because a run whose record
cannot be read is still going, which is the same fault and the same fix, wait
for the run to end — `source-unknown` for an installed assembly with no source
to fetch again from, and `tool-missing` for a program the work has to run and
cannot find. [Invariant 50](elements/invariants.md) is scoped to match: every
refusal a runtime gives when it reads an assembly is a case in the corpus, and
these, which no checked-in case can hold, are named in that table and pinned by
a runtime's own tests instead. Separately, the `bad-record` state in
[`bot runs`](elements/inspection.md#bot-runs) now says that a truncated last
line is [the record's](elements/record.md#how-it-is-written) case rather than
one of the things bot established is not a record. That was already true and
already tested; the enumeration alone read as though it were not.

The litter is named, cut as ticket 0124. Two things the home held that no
command mentioned now have a name. An interrupted `bot assembly update` leaves
its copy beside the assembly under a hidden name, and nothing sweeps it —
after an interruption that copy may be the only one of the assembly there is —
so [`bot status`](elements/inspection.md#bot-status) gives each one a line
saying what it weighs and whether the assembly it belongs to is still standing,
and [`bot assembly update`](elements/management.md#bot-assembly-update) says
that recovering one is a person's move. A run killed before its directory
existed leaves a lock beside no run, which no verb listed and nothing ever
takes the name of again; [`bot prune`](elements/inspection.md#bot-prune) now
names each one whatever was asked for and removes it under `--delete`, without
`--refused`, because a lock holds no work and its claim that a process is here
has already gone stale — the escalation flag guards runs bot could not account
for, and there is nothing here to account for. A lock whose run directory is
there is that run's and is never touched, and a run prune removes takes its own
lock with it rather than leaving the orphan behind.

Strict config, tolerant prose, ruled by Ian and cut as ticket 0122. A byte that
is not UTF-8 in a document's frontmatter is refused, and so is one anywhere in
[the home `config.yaml`](elements/home.md), which is configuration whole and
has no body to be forgiving of. In a prose body such a byte still becomes a
replacement character, which
[a stage](elements/stage.md#the-prompt-and-the-configuration) already said and
explained. The asymmetry is now stated where the refusal is defined, in
[`frontmatter-invalid`](elements/refusals.md#frontmatter), because what bot
acts on is configuration: before this, `model: gpt<bad byte>4` reached the
provider as a name nothing serves and a Markdown schema template's torn key
demanded a field no agent could spell, both in silence. It is the same rule
[a schema](elements/schema.md) already put on an agent's own output, and the
runtime now applies one round trip to all three. The corpus gains
`refuse/frontmatter-utf8`, so the refusal this chapter now defines is a case
([invariant 50](elements/invariants.md)).

The healthy ending column is specified, as ticket 0122. `bot runs` has always
printed a finished run's ending as its exit code and cause joined by a slash,
and [inspection](elements/inspection.md#bot-runs) named only the states a
reader meets when something is wrong — `running`, `crashed`, `no-record`,
`bad-record`, `bad-version`, `unreadable` — so the column most runs show was
the one column no chapter defined. One sentence, pointing at
[the record](elements/record.md#what-it-names) for the two words it joins.
Behaviour is unchanged and already witnessed, byte for byte, by
`bot/tests/inspection-conformance.test.ts`.

Prune's selectors add up, said where the spec speaks, as ticket 0121. Ticket
0110 made `--count`, `--age` and `--refused` union and 0111 put the line in
`bot prune --help`; [inspection](elements/inspection.md#bot-prune) owed the
sentence, because a reader of the paragraph could as easily have derived that
naming two selectors narrows to the runs both name — the opposite of what
happens, and a reading under which `--age 7 --refused` would take nothing. The
sentence is scoped to what a person asks for, so it says nothing about the
default `--count 30`, which 0111 stopped from firing beside a named selector.
Nothing else moved: the behaviour is unchanged and already witnessed.

A run has ceilings and says so, ruled by Ian and cut as ticket 0120: 32
branches or subflow children at once, and 16 MiB of a child's output. Each is
one sentence where a person meets it. [Parallel](elements/parallel.md)'s
`width` is at most 32 "authored or defaulted", because the width a `PARALLEL`
with no `width` key has is its branch count, and a ceiling a deleted key steps
over is not one; over that is `value-invalid`, refused at `bot check` before
anything runs, with the corpus case to match. [Subflows](elements/subflow.md)
bounds a batch at 32 calls and says what a larger one gets — a tool result to
split, not a failure — because how many children an agent starts stays the
agent's business, as that chapter already said. [The runtime](elements/runtime.md)
bounds a gate's or hook's captured output at 16 MiB, stdout and stderr
together, on the reasoning the timeout bullet beside it already carries: a
child that will not stop is the assembly being wrong, not a verdict on the
agent's work, so it is terminated and the run exits `2`. The capture keeps the
bytes that arrived before the cut, so what the record shows is what was seen.
A third ceiling landed in the same ticket and is deliberately absent here:
eight files hashed at once changes no outcome a person can observe, and an
implementation detail is not the specification's business.

A run runs its own copy of the assembly, and the spec says so, ruled by ticket
0119 off [ADR 0016](../sdlc/planning/adr/0016-assembly-capture-at-run-start.md) —
the capture batch's closing entry, saying in the specification what tickets
0116 and 0117 built. [The record](elements/record.md) gains `assembly/` in the
run directory: the copy taken when the run started, the one every instruction,
schema, skill, gate and hook was read from, so an edit to the tree it came from
lands on the next run — to run your edit, start a run. Its storage is stated
baldly rather than hidden behind prune: nothing bounds what those copies hold,
a kept run keeps its copy, and `bot status` now reports how much they hold,
beside the figures it already printed. That chapter's "self-contained" is
narrowed to reading, since no runtime, provider or workspace is in the
directory, and its hash sentence now names the copy the run ran.
[Management](elements/management.md)'s live-assembly guard keeps its behavior
and loses its reason: "a link is what a run reads its own files through" died
when 0117 moved every read onto the copy, and the true reason — the home's
account of a going run — replaces it. Found by 0117's builder as a
stop-and-report. Invariant 14's witness row gains the executable bit's test
(ruled in 0113's audit) and follows the rehash witness to the file 0117 moved
it to.

The rendered prompt is kept, ruled by ticket 0118 off
[ADR 0016](../sdlc/planning/adr/0016-assembly-capture-at-run-start.md) step 7, which
supersedes [ADR 0012](../sdlc/planning/adr/0012-prompt-construction-stable-prefix.md)'s
"the record does not store the prompt: it is reconstructible". Both halves of
that were false: a session holds no system prompt, and `local-context: use`
puts a workspace's bytes in one from a tree no assembly contains — so a run
could be captured perfectly and still not say what the model was asked.
[The record](elements/record.md)'s layout gains `system.txt` and
`first-turn.txt` at the repeat level, beside the session and on the same rule
as it: one per repeat, holding the bytes as they were handed over, never
rebuilt. Later rounds are not written twice — a send-back and a loop's question
are turns in the session already. "What a record answers" gains its sixth
question, and [the session](elements/session.md) says what it does not hold.

The [worked example](example.md) delegates, and it is the front door, ruled by
Ian in chat (no ticket; driver's edit). The example showed PARALLEL, LOOP and
CHOOSE and never a subflow call — the format's headline capability was the one
thing it did not perform. It now carries an `oracle/` subflow the `risk` stage
calls. The README pointed readers first at fifty invariants; it now points at
the example, with the invariants named as the law beneath it. Same ruling,
recorded here because it governs every future spec edit: **spec prose is as
terse as possible — terser beats wordier in law; the guides, written later,
are where natural language belongs.**

The [record](elements/record.md) names the runtime that ran it, ruled by ticket
0115 off [ADR 0016](../sdlc/planning/adr/0016-assembly-capture-at-run-start.md)'s
consequences. "What it names — for the run" listed the assembly, its hash, the
request and the ending, and nothing about the program that produced any of it —
so a capture batch whose whole point is what exactly ran shipped beside a record
that could not say which runtime ran it. The run's opening line now carries a
`runtime` field beside the record format's own integer: the format says how to
read the file, the runtime says what wrote it, and a reader holding a record
from a year ago can tell which bot's behavior it is reading. The record format
integer does not move — an added field is not a new format.

A run being born reads `running` in [inspection](elements/inspection.md), ruled
by ticket 0114 off [ADR 0016](../sdlc/planning/adr/0016-assembly-capture-at-run-start.md)
point 6. The chapter gave `no-record` to any run with nothing at its record's
name, and that included the run whose name and lock are claimed before its
record exists — so `bot runs` named a fault for a run that was starting, while
`bot prune` asked liveness first and correctly refused to take the same run. The
chapter now says a missing record is answered by liveness before it is called
a fault, so a run still starting reads `running`, and confines `no-record` to
a run that is not alive. Nothing about the dead run moved: it is still `no-record`, still refused,
still removable only with `--refused`. Assembly capture is what made this
urgent — it stretches the window between a run's directory and its first record
line from one syscall to seconds.

Plain English in [inspection](elements/inspection.md), and the revision number
removed, both ruled by ticket 0109. The chapter's fault vocabulary had been
written to be unfalsifiable rather than to be understood: it called the program
"this reader", called a record format a "dialect", and described a failed
reading as "a whole record may be sitting behind whatever stopped the reading".
Those sentences were true — Revision 11 had just made them so, at the cost of a
ticket each — and a person could not act on them. They now say the same things
in the words a person would use: the program is bot, a format is a format, and
`unreadable` is a record bot could not turn into lines at all, about whose
contents nothing was learned, so what sits at that name may be a perfectly good
record and deleting it could throw away a run that was fine. Two claims were
corrected rather than merely shortened, and both were found by asking what a
reader could derive rather than whether the sentence was false. `bad-record` was
"bytes that were obtained and are not a record", which its own third example
falsifies: something at the name that is not a regular file is never opened, so
no bytes are obtained. It is now what bot established is not a record — the one
thing all three of its cases share, and the same axis Revision 11 had already
moved `unreadable` onto, which is why the defect survived that revision. Second,
prune's reason for refusing an `unreadable` run claimed such a run is one "a
repair outside prune would have recovered", a universal that fails where nothing
readable is at the name at all; it now says such a run could still have been put
right by something other than prune, which is the modal claim the refusal
actually rests on. Finally the chapter said inspection "only reads" three lines
above a table listing `bot prune`, which deletes run directories; the opening
now names that one exception instead of denying it.

## Revision 11 — 2026-08-04

`unreadable` is defined by what the reader established rather than by whether it
obtained the bytes, ruled by ticket 0105 off 0102's first finding.
[Inspection](elements/inspection.md) said at Revision 10 that the mark is "bytes
that were never obtained at all — the name would not weigh, the file would not
open", and that one sentence was wrong in both directions. It is false for a
record too large for this reader to hold: the read succeeds, every byte is in
hand, and only the string cannot be made — the mark is still `unreadable`, and
the bytes were plainly obtained. It is also true of two states the same
paragraph gives to other words, because nothing at the record's name obtains no
bytes and neither does a FIFO at that name, which are `no-record` and
`bad-record`. A definition that excluded one of its own cases and claimed two
belonging elsewhere is the whole of what is corrected here. How it got there is
the part worth keeping: 0101 wrote the mark as three clauses and dropped the
third, because a 512 MB file is not a fixture any suite should build and an
unwitnessed clause is how a specification starts lying — dropping it was right,
and what it left behind was a universal, "never obtained at all", which became
false only once the clause that had covered the exception was gone. So the
chapter stops enumerating. The mark names the state and nothing else: a record
this reader could not turn into lines at all, about whose contents nothing was
learned. That holds however the reading failed, needs no clause per cause, and
still carries what the mark exists for — nothing is known about the content, so
the repair is not `bot prune`. The reason given for that refusal loses its one
cause with it: a whole record may be sitting behind whatever stopped the
reading, where Revision 10 said "behind a permission bit", which was true of one
arm and of no other. Restoring the third clause was refused — it has no test,
none is worth buying at that price, and a sentence with nothing to falsify it
does not go in. A rule that the mark turns on whether anything was read rather
than on whether bytes were obtained was refused too: true of every arm, but it
equally describes a FIFO, which this same paragraph gives to `bad-record`, so it
would have bought precision with a contradiction. And a sentence saying the
stderr diagnostic now names the cause, which it has since 0102, was refused as a
different sentence in a different lane, needing its own witness. Witnessed for
two of its three arms by tests already standing:
`bot/tests/inspection-record-shapes.test.ts` marks a mode-000 record and a
self-pointing link `unreadable` and prunes neither, and
`bot/tests/prune-refuses-unreadable.test.ts` holds the refusal. The third arm is
UNWITNESSED and deliberately unnamed — the sentence covers it by not
enumerating, and nothing in the suite would fail if a runtime marked an
over-large record something else. The same error had been written twice, and
both copies are corrected here: [`bot prune`](elements/inspection.md#bot-prune)
explained its refusal by saying those bytes "were never obtained", that the run
had failed "to open", and that a `chmod` would have recovered it — three claims,
each true of one arm and of no other. That rationale now says what the
definition says: nothing was learned about what the record holds, a whole record
may be sitting behind whatever stopped the reading, and a run deleted for a
reading that failed is a run destroyed that a repair outside prune would have
recovered. Correcting one copy and leaving the other would have been worse than
correcting neither, because a chapter that restates its own superseded sentence
two sections down leaves a reader no way to tell which of the two is current.
Prune's `bad-record` sentence was deliberately left untouched, to the word: it
states what prune takes without offering a criterion, and a criterion is
precisely what would settle by implication what prune does to a `bad-version`
run. Reported and not written, for that same reason: `bad-record`'s own
definition still opens "bytes that were obtained", which is false for its own
third clause, since something at the name that is not a regular file is never
opened and yields no bytes — the same defect in the adjacent sentence, whose
honest general form runs close to "what the reader did read is prunable", the
form Revision 10 refused. That question and the silent exit on a missing home
both stay open, and neither is written here in either direction.

## Revision 10 — 2026-08-04

[Inspection](elements/inspection.md) learns what its own record reader has been
doing, ruled by Ian off ticket 0101. Six tickets — 0075, 0079, 0080, 0083, 0087
and 0096, then 0098 — taught the reader to tell apart states the chapter had
never heard of, and not one word of it had reached the specification: `bot runs`
said a run "reads `running` or `crashed`" while the runtime had four more words
for that column, `bot prune` specified exactly one refusal — a run still going —
while the runtime had a second, and nothing anywhere said that a path taken out
of a record is read as a name under the run. The chapter now names the four
states the ending column holds when the record could not be read — `no-record`,
`bad-record`, `bad-version`, `unreadable` — and says why each is its own word
instead of one word for four repairs; says that the listing is one line per run
whatever it met, so no broken record drops its own run or the healthy ones
beside it; gives `refused-unreadable` the sentence it has lacked since 0098
landed without one, and says that prune's last column reports what prune did
rather than how a run ended, which is why that word looks like two vocabularies
and is one meeting the other; and says once, in the preamble rather than three
times over `show`, `tools` and `session`, that a command asked about one run
answers for that run or not at all. Enumerating the marks was the judgment call
and the alternative was live: specify only the requirement — the column names
the state, blank is a true answer, never guess — and leave every runtime its own
words. Refused, because it specifies less than Ian has already ruled. The whole
of 0096 was that an operator seeing the mark must be able to tell which repair
is theirs, `chmod` or `bot prune`, and a word that varies between runtimes
cannot carry that; the column is read by the `grep` and `cut` this chapter's
first paragraph promises, and a vocabulary that is not fixed is not greppable
across two runtimes. A table of the marks was refused too — the chapter argues
in prose and a table would have made it reference documentation. Also refused: a
promise that the reader never reads outside the run. That confinement is a rule
about where a name lands, deliberately, and a symlink inside a run pointing out
of it is followed; the chapter states what is tested and says in the same breath
that it is a rule about the name and not a sandbox, which is the narrowest true
form of it. Witnessed throughout by tests that already existed and were waiting
for sentences — `bot/tests/inspection-record-shapes.test.ts` for the state
table, `inspection-corrupt-run.test.ts` for the listing standing beside a
broken record, `inspection-record-dialect.test.ts` for the refused dialect,
`inspection-record-contract.test.ts` for confinement and for the symlink
decision it pins on purpose, and `prune-refuses-unreadable.test.ts` for the
refusal and for `bad-record` still being taken. No corpus case: the corpus is
offline invocations over an assembly tree, and every sentence here is a reading
of a home that already holds runs, which no case can express. Left open and
reported rather than decided, both of them live and neither written in either
direction: `bot runs` on a home that does not exist exits `1` with nothing on
stdout and nothing on stderr, and whether a missing home is a failure or the
empty case is unruled — the existing exit sentence was left exactly as it stood
rather than settle it; and a `bad-version` run is destroyed by prune today,
fully readable bytes from a dialect this runtime refuses, which is why the new
prune passage names `bad-record` as the case prune takes instead of stating the
general form, "what the reader did read is prunable", that would have settled it
by implication. One further sentence was wanted and not written: that the stderr
sentence tells a reader which cause it was. It does not — an `unreadable` run
says only that it cannot be read, whatever the errno, and one `bad-record`
sentence names no run at all.

## Revision 9 — 2026-08-04

A markdown output's frontmatter must be valid UTF-8 and its body need not be,
ruled by Ian off ticket 0097. [The schema](elements/schema.md) said what a
markdown output's frontmatter must contain and never said what bytes it may be
written in, so a runtime decoding it the obvious way — `toString("utf8")`,
which substitutes U+FFFD rather than failing — let a mis-encoded value satisfy
a `str` slim type and pass. The boundary is drawn exactly where validation is
drawn and nowhere else: the frontmatter is data and is validated, so its bytes
are held to the format; the body is prose that the chapter already says is not
validated, so its bytes are held to nothing. The whole-file rule was considered
and refused — it would refuse outputs whose only bad bytes sit in prose nobody
reads as data, a stricter contract than `schema.json` gets, and it would
contradict [the stage](elements/stage.md#the-prompt-and-the-configuration),
which rules the same substitution IN for a prompt body deliberately, so that an
assembly can honestly run and the author's garbage reaches its reader visibly.
An output body is the mirror of that, and a stage with no schema already writes
whatever the agent produced. The sentence sits between the send-back sentence
and "The body is not validated", which is where a reader is standing when they
would otherwise generalize it to the file. Witnessed by
`bot/tests/schema-check-utf8.test.ts`, whose 0097 section holds both halves and
would fail in opposite directions if either drifted: "the reproduction — a bare
0xff in the FRONTMATTER no longer passes" and "the same 0xff in the BODY still
passes — the body is prose, not data", with legitimate accented, CJK, emoji and
*legitimately written* U+FFFD documents passing in both halves — that last is
the case no fix reading the decoded string can tell from the corruption, which
is why the split is made on bytes before anything decodes. No corpus case: the
corpus is offline invocations of `bot check` and a `bot run` refused before
resolution, and this refusal is a send-back judged on a finished output, which
no offline case can produce. Left open and reported rather than decided: the
`schema.md` TEMPLATE file is still read with a replacing decode at both check
time and run time, which the specification does not currently speak to.

## Revision 8 — 2026-08-04

Two absolute guarantees qualified, ruled by Ian off ticket 0089. Revision 7
named a case the format had never admitted — a gate that writes to its output,
judges what it wrote, and restores the original is caught by nothing — and two
sentences elsewhere promised the opposite without qualification: [invariant
18](elements/invariants.md) and the hashes paragraph in [the
record](elements/record.md#hashes), whose "always" was false in exactly that
case. Both now carry the premise the guarantee always rested on, and neither
restates the case: [the gate](elements/gate.md) owns that fact and the two
passages link to it. Invariant 18 takes a clause rather than a second sentence —
the list carries multi-sentence items, but every one of them elaborates a
promise and none carves an exception out of it, and a list of promises that
starts arguing with itself stops being readable as one. The record's paragraph
keeps its own subject, which is the window between passing and sealing and is
still absolute: nothing may change bytes there, not a `success` hook and not a
loop's question round. What it no longer claims is that the window covers what
happened before it opened. The alternative — narrowing both to "persistent drift
is detected", which is what a runtime actually enforces — was considered and
refused: the promise is not that the runtime checks, it is what an assembly gets
provided its gate is a gate. Invariant 19, "bytes are preserved exactly, end to
end", was examined and is not implicated: it is about the runtime not
transforming bytes in its custody, and the gate's bytes never enter that
custody. No new witness landed. The qualification and `bot/tests/gating.test.ts`
"a gate that writes, judges what it wrote, and restores the original seals
undetected" describe one case from two sides, and a second test would be two
places holding one fact. That test's bite was measured rather than assumed, and
the Revision 7 entry below overclaims it: handing the gate a copy of the output
leaves all fourteen tests in the file green, so the test does **not** redden the
day a runtime starts enforcing the rule. It reddens when the runtime stops
handing a gate a writable output — denying write access to the output for the
duration of the gate reddens that test and only that test. It is a witness that
the rule is unenforced, which is what invariant 18's new clause needs, and not a
tripwire on enforcement.

## Revision 7 — 2026-08-04

A gate reads its output and does not write to it, ruled by Ian off ticket 0086.
[The gate](elements/gate.md) opened by calling a gate a program that *reads* a
stage's output and then never said it as a rule, so the one thing a gate is
handed — a writable path — carried no statement about what it is for. The
chapter now says it, next to the two paragraphs that grant the path, which is
where a reader is standing when they write the mistake. The paragraph also says
what a runtime does about a gate that writes and then restores: nothing. A write
that survives is drift and ends the run, but a transient one leaves the seal
matching and the record silent, so the verdict was reached on a file nobody will
ever see. Naming it does not detect it, and that is the ruling rather than an
omission — a gate is the assembly author's own code judging the author's own
run, so this is honesty of the record and not a privilege boundary. The word
"malformed" is deliberately absent: [refusals](elements/refusals.md) and
[the runtime](elements/runtime.md#refusing-an-assembly) define a malformed
assembly as one refused before anything runs, which this is not and cannot be.
Witnessed, as the limit rather than the rule, by `bot/tests/gating.test.ts` "a
gate that writes, judges what it wrote, and restores the original seals
undetected" — the test reddens the day a runtime starts enforcing this, which is
the day its reader wants to be told.

## Revision 6 — 2026-08-04

An upper bound on `timeout`, ruled by Ian off ticket 0077.
[Invocation](elements/invocation.md) bounded the option from below and said
nothing above, so a runtime could accept a value it had no way to hold. This
one did: past the largest delay its timer could represent the wait was cut to
almost nothing, and the longest timeout an author could write became the
shortest one they got — after the run was born, never at validation. The
chapter now requires the refusal and deliberately does not name the value,
which is the runtime's and not the format's. Witnessed by the preflight tests
that landed with 0077 in `5599fff`, one commit ahead of this sentence because
the ruling came after the build.

## Revision 5 — 2026-08-03

One clause narrowed to the paragraph it describes (ticket 0063 item 1).
[Inspection](elements/inspection.md) said of liveness that "nothing acts on it
on its own", which was written about `bot prune` and was true while pruning was
the only reader. Item 1 gave `update` and `remove` a refusal that acts on the
same answer with no flag, so the sentence had to say which claim it was making.
It now says nothing *here* acts on it, and points at
[management](elements/management.md#while-a-run-of-it-is-going) for the place
that does. No behavior changed; this is the second chapter of one fact catching
up with the first.

## Revision 4 — 2026-08-03

`update` and `remove` refuse while a run of that assembly is live (ticket 0063
item 1). [Management](elements/management.md) said nothing about the case, and
both verbs proceeded: a fetch would replace the tree a running agent was
reading, and a removal would take it away. Liveness is the run's own lock, the
same reading `bot runs` and `bot prune` already use, so a crashed run blocks
nothing. This changes behavior — two invocations that used to succeed now
refuse `request-invalid`, and `update` with no name reports the assembly it
skipped rather than refusing, because a batch that refuses partway has already
done the work whose report it would be discarding. It is also the first thing
in the format to act on the liveness answer without a person's flag, which the
new section says plainly: the answer is a timestamp comparison, a slept machine
can make it briefly wrong, and refusing is the safe direction of a wrong answer.

## Revision 3 — 2026-08-03

The recorded `stage` now spells a `.md`-named folder the way it sits on disk
(ticket 0063 item 11). [The record](elements/record.md) justifies the field by
saying it is what a reader can find on disk, but the extension came off any
path that ended in one, so a container folder named `01-wrap.md/` was recorded
as `01-wrap` while a stage inside it stayed `01-wrap.md/01-inner` — two
spellings of one folder in a single record. Only a stage written as one `.md`
file drops the extension now; a folder keeps the name it was given. This one
does change behavior: the `stage` field moves for such folders, and with it
the names `bot show`, `bot session` and `bot runs` are given. The
[md-named-folder](conformance/accept/md-named-folder) case moved with it.

## Revision 2 — 2026-08-03

Three sentences that were narrower than the rule they described (ticket 0063
item 6). [The home](elements/home.md) and
[management](elements/management.md) both said a link sits "directly under"
`assemblies/`, which reads as a ban on the nested names the same chapter
introduces two paragraphs earlier: a name is a relative path, so `team/review`
makes `team/` a real directory and stands the link at the leaf. Both now say
that. [Choose](elements/choose.md) described a chooser that will not choose as
being "held", a word gating does not use, when what happens is the send-back a
failing check earns, in the same session. No behavior changed with any of the
three; the runtime already did what they now say.

## Revision 1 — 2026-08-03

The first numbered revision (ticket 0060). Nothing in the specification
changed with it: this is the point the counting starts from, so that "conforms
to the Bot Assembly specification" names something a second runtime, or a
teammate holding a printout, can actually check. What came before this line is
not reconstructed here — the git history is the history, and inventing a
retroactive sequence of revisions would be claiming rulings that were never
made.
