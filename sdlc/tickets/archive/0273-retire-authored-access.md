---
flow: build
priority: 2
deps: []
---
# Retire authored access

## Outcome

Bot runs every trusted stage with the ordinary Pi file and Bash tools under the operator's operating-system authority. Assembly authors no longer declare `access`, Bot no longer filters command names or writes denial events, and current documentation makes no containment claim. Readers continue to accept the exact `access` and `tool_denied` forms written by older record-1 runs.

## Current facts

- A stage may currently declare `access` lists for read, write, edit, and Bash. Bot parses a shell command to admit one named executable and checks file-tool paths against managed slots. These checks do not contain an allowed command, its subprocesses, its network use, or another process with the same operating-system account.
- Ian chose trusted assembly execution and external containment. An operator who needs isolation supplies a restricted account, container, virtual machine, or equivalent operating-system boundary.
- The access policy reaches production parsing, assembly validation, tool construction, event writing, operational readers, the specification, and public guidance. The current producer and reader share one event-name registry. Deleting `tool_denied` from that registry would make older records unreadable.
- Assembly-process environment construction separately removes `BOT_HOME` and recognized provider credential variables. That accidental-disclosure protection remains selected and does not depend on authored access.

## Scope

- Delete the authored `access` grammar, `StageAccess` and operation types, command-name parser, managed-slot access validation, file-path admission checks, denial-result mapping, and access-specific tool construction. Delete `bot/src/access.ts`.
- Give every model stage the ordinary `createFileTools` result plus the control tools required by its graph position. Preserve slot expansion, temporary-file handling, leading-`~` refusal, working-directory behavior, Bash execution, hooks, gates, scoped subflows, retries, signals, sessions, and tool-call evidence. Do not describe these behaviors as containment.
- Remove access propagation from current stage configuration and `stage_start` writing. New runs emit neither `stage_start.access` nor `tool_denied`. Remove the denial callback and any harness adapter used only to transform denied calls.
- Remove `access` from both single-file and folder-stage frontmatter. Any authored `access` key, including an empty mapping, receives the ordinary `key-unknown` assembly refusal before model or provider work. Resume refuses a captured old assembly that still contains retired syntax. Bot does not silently ignore the key and does not migrate assemblies automatically.
- Separate the record-1 reader vocabulary from current event producers where necessary. Keep `tool_denied` as an exact read-only legacy event with its existing timestamp, stage identity, attempt ordering, and shape checks. Keep tolerant reading of additive historical `stage_start.access` data. Do not admit arbitrary unknown events or weaken record terminal validation.
- Preserve old-event human and JSON rendering, raw record bytes, `bot run show`, `bot run events`, the exported record-lines reader, and the exported explanation reader. The explanation reader retains its historical `access` and denied-call output for older records even though new records cannot produce those facts.
- Preserve credential-environment discovery and removal. Preserve unrelated OAuth access-token fields and Node filesystem `access()` calls.
- Remove current access authoring, enforcement, and denial claims from the normative specification, generated specification pages, README, public guides, trust guidance, examples, public blog material, help, and active planning summaries. State directly that Bot runs trusted assembly code with operator authority and that the operating system owns containment.
- Keep historical completion records, archived tickets, superseded decisions, and old changelog entries unchanged as historical truth. Add a specification changelog entry for the removal. Keep invariant numbers stable while rewriting their current statements and witnesses.
- Do not change subflow input ordering, Pi code, credential file permissions, environment inheritance, platform support, CHOOSE session design, or later plan outcomes.

## Acceptance

Start with failing focused tests. Both single-file and folder stages that author `access`, including `access: {}`, refuse with `key-unknown` before any model call. A captured old assembly with that syntax cannot resume unrestricted.

A real faux-provider run proves an ordinary stage can use file tools outside `$PWD`, run an ordinary compound Bash command without an executable allowlist, and retain normal tool evidence. Its new `stage_start` has no `access`, and the run has no `tool_denied`. Existing environment tests prove recognized provider credential variables and `BOT_HOME` still do not reach assembly processes.

One valid legacy record contains both `stage_start.access` and an in-attempt `tool_denied`. It passes the complete operational record reader, `bot run events` in human and JSON modes, `bot run show`, the exported record-lines reader, and the exported explanation reader. Raw reading preserves its exact bytes. Negative cases still reject unknown events, malformed legacy fields, and a denial event outside its stage attempt.

Update producer-shape, publication, file-tool, environment, help, examples, and specification tests. Regenerate derived specification pages. Run focused suites continuously, then the complete local gate. Independent code review must search active source and public text for enforcement claims without treating historical records or unrelated uses of the word `access` as defects. The exact implementation and completion commits pass hosted checks.

## Dependencies

None. Ticket 0272 completed the publication scanner. The trusted-execution decision supplies the product boundary. Pi remains reference-only.

## Risk facts

This deliberately breaks pre-release assemblies that declare `access`. A clear refusal is safer than silently running them with greater authority. Record compatibility needs a narrow legacy reader path after the current writer path disappears. Broad text deletion could damage credential, filesystem, or historical content that uses `access` for another meaning.

## Size decision

- Starting production size: 18171 nonblank lines
- Ending production size: 17962 nonblank lines
- Simpler approach tried: Keep the parser and enforcement code but stop documenting it, or silently ignore old declarations.
- Why insufficient alternatives were rejected: Hidden enforcement would preserve a misleading partial boundary. Silent removal would run an old assembly with more authority than its author expected.
- Production code deleted: The access-policy module, authored grammar, assembly validation, command-name filtering, denial writer, denial-result adapter, and propagation fields leave current runtime code.
- Accepted cost: One small legacy record vocabulary and focused compatibility tests remain so retained record-1 evidence stays readable.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 8
- Minimum level floor: 4, because a compatibility mistake can make retained records unreadable and a migration mistake can silently increase an assembly's authority.
- Final level: 4
- Reasons: The implementation deletes one misleading feature, but the break spans authoring, runtime composition, record writing, record compatibility, public APIs, specification text, generated documentation, and trust claims.
- Selected model: `gpt-5.6-sol` with medium reasoning for implementation

## Review

- Origin: Ian rejected executable allowlists and built-in containment and accepted trusted execution with operating-system isolation on 2026-09-13.
- Design review: accepted after two rounds. The first formal review corrected Reach from 2 to 1, the total from 9 to 8, and the irreducible level-4 implementation route from high to medium reasoning. Supplemental Astra extra-eyes review accepted the product design. Three prior surveys agreed that the outcome remains one deletion ticket and identified the legacy record vocabulary, fail-closed author migration, and credential-environment preservation boundaries.
- Code review: accepted after two rounds. The first review found a bypassed model-work tripwire, a malformed positive legacy record, a denial-order test that reached only the generic post-run rule, and one stranded sentence fragment. The repair removed supplied models, proved a valid stage reaches the tripwire, supplied an exact retained output, exercised the open-attempt rule, and repaired the prose.
- Completion: implementation commit `ed1bdd511fa6e14b092afcf914d4d3e2a9fc4dc6` passed the complete local gate and both hosted workflows before archival.
