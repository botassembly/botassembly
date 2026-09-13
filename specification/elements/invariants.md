# Invariants

> **Stability: stable.**

These hold in every assembly, every flow, and every run. A runtime that breaks
one of them is not a runtime for this format.

They exist to make file-over-app work: the folder is the program, the agent is a
worker inside one box of it, and everything true about the whole is true because
of where files sit rather than because something at run time arranged it.

## What the agent is not told

1. Where the assembly is on disk.
2. Where the run record is, or that a home holding assemblies and runs exists.
3. That a gate exists, or what it checks. The agent is told its schema and its
   checklist, because those are instructions. The gate is a judgment, and an
   agent writing for a judge writes for the judge.
4. Its intelligence name, provider, model, reasoning level, timeout, or how many retries remain.
5. Which repeat of a loop it is in, or how many remain.
6. **That any of this exists.** The agent is given a prompt, an input directory,
   and a place to write. It is not told what an assembly is, that flows exist,
   or that it is inside a stage. The names in `$INPUT` are names; the prompt is
   what says they mean anything. From the model's side there is no Bot Assembly,
   only a task.

## What the agent cannot do

7. Change the graph. Placement is the author's, written in folders.
8. Cause a stage to run by naming it. A stage runs because the flow reached it.
   Calling a subflow is not an exception the author didn't write: the flows a
   stage can call were placed in its scope, and placement is still the author's
   ([subflows](subflow.md)).
9. Edit its checklist. It marks items; it does not write them.
10. Affect control flow except through the seven control tools — mark, refuse,
    fault, continue, select, subflow, clean-temp
    ([control tools](runtime.md#control-tools)).
11. Carry anything into the next stage except its output.

## What the runtime guarantees

12. The whole assembly is validated before any of it runs.
13. Every entry in an assembly is either understood or refused. Hidden
    dot-entries are outside the assembly: not part of the graph, not hashed,
    never executed.
14. Every file in the assembly is hashed before the run, and every executable
    is hashed again each time it runs. Changed gate, `before`, or `success`
    hook bytes end the run; failure-hook hash drift is recorded as diagnostic
    evidence and keeps the failed stage's existing ending. The assembly may
    not change under a run.
15. The record is append-only. Summaries are computed from the events.
16. Everything the format writes as a log is JSONL: one JSON object per
    line, appended, never rewritten.
17. The record never claims more than what happened.
18. An output that passed its checks is sealed — and, for [a gate that does
    not write to it](gate.md), the bytes that passed are the bytes that leave
    ([the record](record.md#hashes)).
19. Bytes are preserved exactly, end to end.
20. Identity comes from what the author wrote.
21. Resuming is not re-running. A held agent keeps its session.
22. Everything that runs gets its own clock. A stage's `timeout` covers the
    agent's work across every send-back; every gate and hook starts a
    fresh budget of the same size, and time spent in one never counts against
    another.
23. The exit code says whether; the record says why. `1` is the work failing,
    `2` is the run being impossible — the assembly, the invocation, or the
    machinery beneath the run being wrong, whenever that is discovered — and
    the record carries the cause.

## Structure

24. Every stage produces exactly one output. A container produces nothing of
    its own; it passes along what the stages inside it produced.
25. `$INPUT` is a directory. `$OUTPUT` is one file.
26. One file per source in `$INPUT`, named after its source — a name visible
    from where the stage stands: the previous stage, a branch, a chosen
    alternative, a loop. Never the name of something buried inside a neighbor.
27. A hook runs once per stage, however many times the agent is sent back.
28. A non-zero exit stops the flow, and the code propagates stage → flow → run.
29. A sentinel's body, where one is permitted, is a prompt.
30. Stopping is asking to leave. An agent exits a stage by stopping; the
    runtime intercepts the stop, runs the checks, and either lets the agent go
    or answers into its session, where the agent picks back up.
31. Every rung may set every resolvable key. A container's frontmatter is
    defaults for everything inside it, and nothing more.
32. Every repetition the graph declares is bounded by a number the author
    wrote — `repeat`, `max-depth`. Separately, the runtime caps every mixed-flow
    subflow call chain at ten calls; delegation within that safety ceiling is
    recorded ([subflows](subflow.md)).
33. Nothing is skipped silently. A skip without a reason is not a mark.

## What is claimed, and what is not

34. Bot does not provide operating-system containment. A stage `access` declaration can refuse direct model-facing calls. It does not contain an allowed process.
35. Without an access declaration, a stage receives all four direct tools: read, write, edit, and Bash. Direct file tools accept absolute paths.
36. An agent, hook, gate, allowed command, configuration, alias, or subprocess may reach anything the operating system permits.
37. Bot retains reported direct tool calls and denied direct calls. It does not watch the filesystem or claim a complete list of changes.
38. A subflow call is an invocation. The input goes down as the child run's
    request, the flow's output comes back, and no session crosses in either
    direction ([subflows](subflow.md)).

## Simplicity

39. One fault, one fix, one code. A refusal code names the fault a person must
    fix, never the rule that caught it. Two faults with the same fix share a
    code ([refusals](refusals.md)).
40. A loop holds no loop. `repeat` is one number, and identity never nests.
    Iteration inside iteration is a flow calling a flow
    ([subflows](subflow.md), [descend](descend.md)).
41. Where order is not numbered, it is name order. Parallel branches start,
    scopes flatten, and listings print in the order their names sort,
    everywhere — and the sort is bytewise over UTF-8: one comparator, no
    locale.
42. Every stage file and sentinel is frontmatter and body, everywhere.
    Fenced `---`, even when the body is empty. One grammar, one parser.
43. The environment passes through; the slots overwrite it. An agent, hook, or
    gate sees the caller's environment beneath the runtime's slots — that is how
    a script finds `PATH` — and a slot still always means what this specification
    says it means ([slots](slots.md)). Provider credential environment names
    consumed by the parent and `BOT_HOME`, the runtime's own bot-named variable,
    are scrubbed before anything agent-side runs ([the home](home.md)), and
    `$BOT_RUN_ID` and `TMPDIR` are set by the run — the run's name and the
    stage's scratch — over any caller value ([the runtime](runtime.md),
    [slots](slots.md)).
44. A dead run is dead. Holding an agent happens within a stage within a live
    run; once the process ends, neither it nor its session resumes. A caller may
    start a new, caller-selected run from independently verified sealed stages
    of a prior run.

## The record's contract

45. Every way a run or a stage can end has exactly one cause word, and no two
    meanings share a word ([the record](record.md)).
46. A record's shape never depends on configuration. Within a record format
    version — the one its first line names (invariant 48) — the same events
    carry the same fields; a field is absent only when the thing it names
    never existed — which claims nothing (invariant 17) — never because a
    runtime chose to leave it out. Across runtimes, the contract is what a
    record answers ([the eight questions](record.md#what-a-record-answers)),
    not its bytes.
47. A truncated turn is never read as the agent having finished.
48. A record names the version of the record format that wrote it, in its
    first line.

## Refusing and proving

49. Faced with two readings, a runtime refuses, naming both. It never picks —
    an ambiguous target, an ambiguous provider, two things behind one name
    ([refusals](refusals.md)).
50. Every refusal a runtime gives when it reads an assembly is a case in the
    corpus ([conformance](../conformance.md)). A rule with no case is not yet
    a rule. [Managing the home](refusals.md#managing-the-home) refuses what no
    case can hold — a live run, an absent program — and those codes are named
    there and pinned by a runtime's own tests instead.

Number 6 is the one the others hang from. An agent with no model of the system
it is inside has nothing to reason about except its task, which is the whole of
what is wanted from it.

Numbers 3, 34, 35, 36, and 37 belong together. The format makes the machinery non-obvious. It does not make the machinery unreachable. Invariant 14 detects a change to checked machinery and stops the run. It does not prevent the change.

The operator, the assembly author, and the machine are trusted. Gates, schemas, and checklists test the agent's work. Bot does not defend the operating system from the agent. A model tool, hook, gate, or subprocess uses the operator's authority. The retained sessions and record report only calls that their writers receive. An operator who needs a stronger boundary must supply a sandbox (invariant 34).
