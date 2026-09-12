---
project: botassembly
date: 2026-09-11
source: ChatGPT review of the public repo and site at 0.0.1, pasted by Ian
status: unfolded
---

Yes — conceptually this is pretty promising. I would describe BotAssembly as “Makefiles / GitHub Actions for LLM agents, but the workflow itself is Markdown.” It is much more interesting as an agent workflow format than as another agent SDK.

The repo is brand-new publicly: version 0.0.1, explicitly labeled “very early alpha,” with 13 commits and effectively no adoption yet. So I’d separate architecture quality from project maturity: architecture looks unusually thoughtful; maturity is extremely low. 

What it actually does

An assembly is just a directory of Markdown files and small scripts. Something like:

trial-screening/
  ASSEMBLY.md
  flows/
    screen/
      FLOW.md
      01-extract.md
      02-assess/
        STAGE.md
        gate
      03-report.md

ASSEMBLY.md says what the overall procedure is. FLOW.md defines a named workflow. Each numbered Markdown file is an agent stage.

There isn’t a Python/TypeScript graph you have to construct. The filesystem is the graph. Stage ordering comes from filenames and folder structure. YAML frontmatter controls things like model choice, reasoning level, timeout, retries, work directory, and context behavior. 

A minimal stage is almost literally:

---
---
Read the article in $INPUT.
Write a 3–5 sentence summary to $OUTPUT.
## Checklist
- The summary is three to five sentences
- Every claim appears in the original article

Then:

bot check ./reading-list/digest
cat article.txt | bot run ./reading-list/digest

bot check statically validates the workflow without spending model tokens. bot run executes it. 

The clever bit: stages have gates

BotAssembly treats generating an answer and accepting an answer as separate concerns.

A stage can have three checks: a Markdown checklist, a JSON/Markdown schema, and an executable gate program. If the answer fails, the failure reason gets sent back into the same model session, and the agent gets another attempt up to the configured retry limit. 

So you could have:

02-write-code/
  STAGE.md
  gate

with:

#!/bin/sh
pytest "$1"

Conceptually:

agent generates result
       ↓
checklist
       ↓
schema validation
       ↓
deterministic gate
       ↓
 PASS ─────→ next stage
       \
        FAIL → feedback → same agent session → retry

That is a strong architecture for agentic systems. The model isn’t being asked to decide whether its own output is correct unless that’s all you have; ordinary programs can provide the acceptance criteria.

It goes substantially beyond linear pipelines

The format already specifies CHOOSE, PARALLEL, LOOP, FANOUT, subflows and recursive/descending flows. It also supports before, success, and failure executable hooks and reusable skills/ content. 

That means this:

01-research
02-analyze
03-write

can evolve into something closer to:

             ┌─ specialist-A ─┐
input → plan ┼─ specialist-B ─┼→ synthesize → gate → output
             └─ specialist-C ─┘
                       ↑
                     retry

without the workflow turning into bespoke orchestration code.

There is also an interesting model abstraction called an intelligence. The assembly can say something portable like:

intelligence: coder-hard

while your local config maps that to:

coder-hard:
  provider: ...
  model: ...
  reasoning: high

So the procedure isn’t necessarily coupled to gpt-whatever or claude-whatever. 

Another unusually good idea: runs are artifacts

Every run produces a durable record containing the request, a snapshot of the assembly that actually ran, stage outputs, checks, sessions/transcripts, and usage information. The record itself is append-oriented JSONL, and they pay attention to file hashing and provenance. 

That’s important because agent workflows usually become impossible to debug once you ask:

“Why did the agent produce this three days ago?”

Here you have something much closer to build provenance:

request
  +
exact workflow snapshot
  +
model/session evidence
  +
intermediate outputs
  +
gate results
  =
reproducible-ish run record

Not deterministic reproduction—the LLM obviously isn’t deterministic—but forensic reproduction: you can inspect exactly what procedure and context produced the result.

That’s valuable.

The strongest signal I see

The impressive thing isn’t actually the Markdown syntax.

It’s that they built a specification and conformance suite alongside the implementation.

The 0.0.1 spec currently defines 143 deterministic model-free conformance cases. They explicitly distinguish static conformance from live-model invariant compliance. The corpus exercises accepted/refused assembly structures, option resolution, slots, malformed configurations, graph semantics, etc., entirely offline. 

And the TypeScript test tree is enormous relative to the project’s age: CLI boundary cases, gate rehashing, atomic installation, worktree locks, fanout, continuation/resume, fuzzing, file-tool behavior, output ceilings, credential handling, graph sequencing, hook environments, conformance tests, and so forth. 

For a 0.0.1 agent framework, that’s a much better signal than a flashy demo.

There’s evidence the authors are thinking in terms of invariants, byte limits, atomicity, provenance, failure modes and compatibility rather than just:

while True:
    response = llm(prompt)
    if response.tool_calls:
        ...

That materially increases my confidence in the design.

They’re also not reinventing the LLM layer

The runtime is TypeScript and currently pins @earendil-works/pi-agent-core and @earendil-works/pi-ai 0.83.0, rather than implementing all the provider/tool/session mechanics itself. Other dependencies are fairly minimal: AJV, YAML and filesystem locking. 

Pi provides the underlying general-purpose agent runtime and multi-provider LLM abstraction. It’s an active project: the current pi-agent-core package is already at 0.85.1 and reports hundreds of dependents. 

I like that layering:

┌─────────────────────────────┐
│ Your assembly               │  Markdown + scripts
├─────────────────────────────┤
│ BotAssembly                 │  orchestration / gates / records
├─────────────────────────────┤
│ Pi Agent Core / pi-ai       │  agent loop / models / tools
├─────────────────────────────┤
│ OpenAI / Anthropic / etc.   │
└─────────────────────────────┘

BotAssembly can concentrate on procedures rather than provider adapters.

Why I think the idea has legs

There are several things I like about the underlying thesis:

* Git-native. Workflows diff cleanly in PRs. Prompts aren’t hidden inside some workflow database.
* LLM-readable and human-readable. An agent can inspect another assembly without learning an SDK.
* Low ceremony. A three-stage workflow really can be three Markdown files.
* Deterministic boundaries around nondeterministic components. Gates and schemas are exactly where reliability should come from.
* Model portability. Workflow intent and model deployment configuration are separated.
* Auditability. Capturing the actual workflow snapshot and stage evidence is the right model.
* Progressive disclosure. Agents don’t automatically receive every skill/subflow/context document; they discover additional material as necessary. 

There’s a nice Unix philosophy lurking in it:

files are the durable interface; the runtime is replaceable.

Their specification explicitly calls this “file over app”: placement is the graph, frontmatter is configuration, JSONL is the run record. They even call it an “anti-framework.” 

That part resonates with me much more than another proprietary AgentGraphBuilder().addNode(...) API.

Where I’d be cautious

Security is the big one. BotAssembly explicitly says it is not a sandbox. Agent stages can receive read, write, edit and Bash capabilities, and commands execute with your OS authority. Its access declarations limit model-visible tools but aren’t containment. 

So you absolutely should not interpret:

access:
  read: [...]
  bash: [...]

as a security boundary.

For serious use I’d want the entire runtime underneath something like a container/VM/namespace sandbox with controlled filesystem mounts and egress.

The second risk is that “filesystem as graph” eventually hits complexity limits. It’s beautiful for:

extract → reason → validate → report

and probably still pleasant for branches and parallelism.

But once you have dynamic joins, long-running external events, human approvals, timers, distributed workers, transactional state, idempotency, queue semantics, compensation, etc., Temporal/Durable Functions-style orchestration starts having real advantages. BotAssembly shouldn’t try to become Temporal.

The third issue is its extreme immaturity. Today it’s Linux + Node 22.22; macOS is unverified and Windows isn’t supported. The authors explicitly reserve the right to break assembly and record compatibility until 1.0. 

And nobody is using this public repo yet in any meaningful observable way. Zero stars/forks/issues on day one tells us nothing about product-market fit. 

Where I think it fits

I would not reach for BotAssembly to implement a SaaS request/response agent service.

I would be quite interested in it for things like:

PR review
requirements → implementation → test → repair
research → evidence extraction → synthesis
document processing
clinical/literature review pipelines
data QA
migration/code-mod workflows
repeatable analyst procedures
CI agent jobs

In other words, bounded jobs where artifacts flow through several intelligent transformations and each transformation can be checked.

That is exactly where filesystem-native procedures become attractive.

Compared with something like LangGraph

The philosophical difference is almost more important than the feature difference.

LangGraph-ish:

graph = StateGraph(State)
graph.add_node("research", research)
graph.add_node("write", write)
graph.add_edge(...)
...

BotAssembly-ish:

flows/report/
  01-research.md
  02-write.md
  03-verify/
      STAGE.md
      gate

The first says the application owns the agent workflow.

BotAssembly says the workflow is an artifact that the runtime happens to execute.

I think the latter is a genuinely useful abstraction.

My rating right now

I’d roughly score it:

Idea / abstraction: 8.5/10

The file-native format, deterministic gates, records and model/config separation fit agent workflows extremely well.

Engineering signals: 8/10

Specification-first development, 143-case conformance corpus, fuzz/boundary testing, provenance work and constrained dependency set are unusually encouraging for an alpha. 

Current usability/maturity: 3/10

0.0.1, Linux-only officially, no compatibility guarantee yet, effectively no external adoption. 

Chance the core concept survives even if this particular project doesn’t: high.

That last distinction is important. I don’t know whether BotAssembly becomes popular, but I think “agent procedures as inspectable, version-controlled Markdown/files plus deterministic executable gates” is a very good direction.

For someone building agentic software today, I’d absolutely prototype one nontrivial workflow with it. I would not make it foundational production infrastructure yet.

If you want, I can next do a more technical teardown of one actual BotAssembly flow end-to-end—what gets put into the model context, how $INPUT/$OUTPUT work, how retries/gates operate, and what the resulting run record looks like. That’s probably the fastest way to tell whether the abstraction is genuinely clean or just looks clean from the docs.


These are the 20 questions I’d expect prospective users to ask, from “Why does this exist?” to “Can I trust it in production?” The answers reflect the current 0.0.1 documentation and relevant source code—not a live-model performance benchmark. 

1. What is BotAssembly, exactly?

A file-based workflow language and command-line runtime for procedures performed by AI agents.

You describe the procedure using Markdown files, directories, configuration, and optional executable checks. BotAssembly runs the stages, passes their outputs forward, evaluates the checks, and records what happened. It is not a new model; it coordinates models and tools. 

The useful mental model is:

Request → agent stage → checks → agent stage → checks → accepted output

The defining idea is that the procedure is an inspectable artifact, rather than something buried inside application code or a workflow service’s database. 

2. Isn’t this just a folder of prompts? Why not write a script?

A script could do the same work. BotAssembly standardizes the execution contracts you would otherwise have to invent.

Those contracts include stage ordering, input/output handoffs, acceptance checks, retry behavior, and retained evidence. A collection of prompts does not inherently specify any of those things. BotAssembly’s files do. 

Its advantage is therefore not “Markdown can call an LLM.” It is that multiple workflows can share the same operational conventions.

There is still a language to learn: required filenames, fenced frontmatter, permitted keys, and placement rules. “Plain text” does not mean “arbitrary prose becomes executable,” or “no programming required.” Gates and integrations can still involve ordinary code. 

My threshold would be simple: use a script for a straightforward one-off; consider BotAssembly when the procedure needs to be reviewed, reused, checked, and diagnosed repeatedly.

3. How is it different from LangGraph?

BotAssembly emphasizes a portable procedure defined in files; LangGraph emphasizes programmable orchestration for stateful applications.

LangGraph lets developers define graphs and state transitions in code, with infrastructure for persistence, durable execution, streaming, memory, and human intervention. BotAssembly derives its graph from the directory structure and transfers stage results through files. 

This is not a distinction between “deterministic BotAssembly” and “uncontrolled LangGraph.” LangGraph explicitly supports mixing deterministic and model-driven steps. 

My selection rule would be:

BotAssembly: “I want a repeatable agent procedure my team can inspect and maintain as a directory.”

LangGraph: “I am building an application whose agent state, interruptions, and lifecycle need substantial programmatic control.”

Neither abstraction is universally better.

4. What kinds of work is it best suited for?

My strongest candidates are bounded jobs with inspectable intermediate artifacts and meaningful acceptance criteria.

Examples I would prototype include document extraction, research synthesis, code migrations, repository review, and report production.

A coding procedure might be:

Interpret requirement → implement change → run tests → review result

A document procedure might be:

Extract evidence → validate structured data → draft report → verify citations

These are suggested applications of its stage-and-check model, not claims that the repository has demonstrated production performance on them. Its ordinary stages run agent loops; scripts fit around those loops through hooks and gates. 

I would be less enthusiastic about using it for a trivial one-call task, or making it the central coordinator for a complex, customer-facing service before testing its operational limits.

5. How hard is it to get started?

The basic setup is modest, but it is still a developer-oriented alpha.

The documented installation is:

git clone https://github.com/botassembly/botassembly.git
cd botassembly
npm ci --prefix bot
make install

You then configure a model choice, authenticate, and create an assembly containing an ASSEMBLY.md, a named flow with FLOW.md, and stage files. The introductory example uses four files for a two-stage workflow. 

The development loop is:

bot check ./reading-list/digest
cat article.txt | bot run ./reading-list/digest

bot check performs static validation without contacting a model provider. It does not demonstrate that the workflow’s answers will be correct. 

Linux is the supported platform. The package requires Node >=22.22; macOS is unverified, and Windows is unsupported. 

6. Which models can it use? Can different stages use different models?

Yes: stages can select different named model configurations, called “intelligences.”

An assembly might request:

intelligence: coder-hard

The operator’s home configuration maps that name to a complete provider, model, and reasoning configuration. Another stage can select a cheaper or faster intelligence. This keeps deployment-specific model choices separate from the procedure. 

The runtime uses Pi’s agent and model libraries. Its bot models command normally reads the pinned provider catalog; the implementation also supports a live catalog comparison. Catalog presence should not be confused with a successful authenticated inference call. 

I would verify a specific provider or local-model requirement rather than assume that everything supported somewhere in the underlying ecosystem is exposed by BotAssembly’s current configuration.

7. Do I have to write TypeScript? Can I use Python and pytest?

You do not have to write TypeScript to author an assembly.

The runtime is TypeScript, but hooks and gates are ordinary executables. Python, shell scripts, and compiled programs can participate, provided the executable and its dependencies are available. 

For a Python repository, a gate could run:

#!/bin/sh
set -eu
python -m pytest -q

That would run in the stage’s selected working directory. An important correction to my earlier sketch: the gate’s $1 argument is the stage’s output file—not automatically the project directory or test suite. A report-validation gate would inspect $1; a repository-testing gate would usually inspect the workspace. 

I would test the gate itself with ordinary unit tests before trusting it to judge an agent.

8. How do stages pass data to each other?

Through files, not a shared conversation or a shared in-memory state object.

$INPUT is a directory containing named input files. $OUTPUT identifies the single file the stage must write as its result. A sequential successor normally receives the preceding stage’s output; after parallel work, it receives multiple separately named files. BotAssembly does not automatically merge them. 

A JSON schema produces a validated JSON handoff. A Markdown schema produces a Markdown handoff. Without a schema, the output is treated as text. 

There is an important distinction for coding workflows: files modified in the workspace are not automatically the stage’s retained output. The workspace and $OUTPUT are different locations with different ownership and retention rules. 

I would make the output explicitly identify the change, evidence, and artifacts that downstream stages should trust.

9. Does it have memory? What context does each agent see?

Each stage starts a fresh model session. Earlier stages contribute outputs, not their entire conversations.

A failed check is different: its feedback goes back into the current stage’s existing session, preserving what that agent has already learned. 

The prompt includes the stage instructions, assembly purpose, relevant procedure information, and names of available inputs, skills, and subflows. Skills are generally announced by name and description, then read on demand rather than injected wholesale. 

Workspace instructions are controlled separately. local-context can ignore them, announce their presence, or incorporate them; the default is ignore. 

I would describe this as explicit artifact-based context, not an automatically persistent assistant memory. Information that must survive needs an intentional place to live and a way for later stages to access it.

10. Can it branch, loop, run agents in parallel, and delegate?

Yes, although the controls have specific structural limits.

CHOOSE.md selects a branch, LOOP.md repeats work, and PARALLEL.md runs authored branches concurrently. Subflows let an agent delegate requests to reusable procedures with their own stages and checks. 

There is also a provisional FANOUT.md control: the runtime takes a checked JSON list and runs a selected subflow once per item. In the current contract, it is restricted to the root sequence of a named entry flow, requires an ordinary JSON-producing predecessor and an ordinary successor, and permits at most 32 items. It does not deliver a partial result set as a successful handoff. 

However, concurrent agents do not automatically get isolated workspaces. Branches can share the same working tree, so concurrent-write safety remains the author’s responsibility. 

11. Does it actually make agent outputs reliable—or prevent hallucinations?

It provides mechanisms for enforcing acceptance criteria. It does not guarantee truth.

The three checks have different strengths:

Check	What it establishes
Checklist	The agent accounted for each item, providing evidence text and a reason for any skip.
Schema	The output satisfies structural requirements.
Executable gate	A program accepted the result according to its implemented checks.

Checklist evidence is an agent-supplied string whose quality the runtime does not independently judge. A skipped item can pass when properly accounted for. “The agent marked the tests as passing” is not equivalent to “the test runner passed.” 

Similarly, schema.md validates frontmatter, not the prose body. JSON validity does not establish factual accuracy. 

The strongest reliability comes from well-designed executable checks. All three mechanisms are optional, so authors must actually use them. A weak gate can consistently accept bad work. 

12. What happens when a stage fails a check?

An ordinary check failure sends feedback into the same agent session and gives it a bounded opportunity to repair the result.

The default is two retries, meaning at most three attempts at passing the checks. The stage’s agent-time budget covers its work across those attempts rather than resetting after every failure. 

Not every failure triggers that repair loop. An explicit agent refusal ends the stage. An executable gate can report an external blocker by exiting 75 with nonempty captured output; that stops the stage with a blocked outcome instead of spending retries. 

This distinction matters. A missing report section may be repairable by the agent. An unavailable external dependency or required authorization usually is not.

My recommendation would be to make gate failures precise enough that the agent can distinguish “change your answer” from “this task cannot proceed.”

13. Can it resume after a failure or crash?

It supports limited continuation, not general checkpoint restoration.

bot resume RUN starts a new run. It can carry forward verified successful outputs from an initial sequence of ordinary root stages. It stops carrying work at the first control construct; containers and subsequent work run afresh. Carried stages do not rerun their checks or hooks. 

There is a further implementation limitation worth emphasizing: the donor loader currently requires a record classified as valid. An abrupt crash leaving an incomplete record is therefore not automatically resumable through this path. The previous model session is not restored. 

The current assembly must also match the donor’s recorded assembly hash; editing the procedure and continuing under the same assumptions is refused. 

Do not infer workspace rollback or exactly-once external actions from the existence of resume. I would design publishing and other side effects to tolerate repetition.

14. Can a human approve work before the agent takes an important action?

That can be designed around the framework, but I would not treat it as a built-in durable approval system.

The documented control-tool inventory does not include a general pause-and-wait-for-human mechanism. A gate can return an externally blocked outcome, but that ends the stage rather than parking a durable interactive session. 

For consequential operations, my preferred design would be:

Produce candidate artifact → external human approval → separate execution flow

The execution flow’s gate would verify approval for the exact artifact being executed, rather than accepting a generic “approved” flag.

That is a proposed integration pattern, not a turnkey BotAssembly feature. It also avoids confusing approval of one generated result with approval of a newly generated result after a retry.

15. How do I debug it? Can I reproduce a previous run?

Its retained execution evidence is one of its strongest features. Exact replay is a different matter.

A run retains the request, an assembly snapshot, stage outputs, check captures, prompts, and references to model sessions. The event record is append-oriented JSONL, with identities and hashes that help establish what ran and what was accepted. 

Useful inspection commands include:

bot run list
bot run show RUN -j
bot run output RUN --raw

Stage transcripts are available through the session inspection commands. 

The important qualification is that the retained directory is self-contained for inspection, not for re-execution: it does not package the provider, runtime, and external workspace into a reproducible environment. 

Also, the current semantic record reader has a 1 MiB and 10,000-segment bound; raw inspection bypasses those whole-record limits. Large-run behavior deserves testing before deployment. 

16. What does it cost, and can I enforce a budget?

The code is MIT-licensed; running models still incurs whatever costs your provider arrangement entails.

BotAssembly records token usage, and its model catalog exposes input/output pricing metadata. That is useful for estimation, not a substitute for provider billing records. 

The key operational limitation is explicit: there is no run-wide cost budget or overall deadline. Individual stages have limits, and concurrency controls have widths, but supervision of the entire run remains the operator’s job. 

Retries, loops, and delegated work can therefore make the total substantially larger than one model call. I would enforce financial exposure outside the workflow and measure cost per accepted, correct result, not just cost per attempt.

Interrupted provider work can also remain unreconciled, so recorded totals should not automatically be treated as complete billing totals. 

17. Is it safe to run an assembly somebody else published?

Not merely because it is an assembly. Treat it as executable code with agent-driven behavior.

The project explicitly disclaims sandboxing. Stages can use file operations and Bash; commands execute with the operator’s authority, and absolute paths and network access remain reachable. 

The access configuration constrains direct model-facing tool dispatch. It is not an operating-system security boundary: an allowed executable can have configuration, subprocesses, and capabilities beyond that declaration. 

Likewise, not telling an agent where its gate lives is information hiding, not proof that the agent cannot reach it. 

I would run unfamiliar assemblies in externally enforced isolation, with narrowly selected filesystem mounts, credentials, and network permissions. Readable Markdown makes review easier; it does not make execution harmless.

18. Where do my data and credentials go?

Local orchestration does not mean all data stays local.

Run artifacts are retained under the Bot home directory. Model calls use the configured provider, so material included in requests to a remote provider crosses that boundary. Hooks and tools can introduce additional destinations. 

Credentials are deliberately kept outside assemblies and workspace homes, in an operator-level credential file. The authentication interface supports provider login, environment credentials, and explicit import; it is designed not to print credentials. Separate --home directories do not create separate credential stores. 

The implementation also scrubs recognized provider credential environment variables before agent-side execution. That should not be mistaken for a general secret-isolation guarantee. 

My operational assumption would be that retained prompts, outputs, and diagnostic captures may be sensitive. They need their own access, retention, backup, and deletion policy.

19. How do I test an assembly—and how much should I trust the project’s tests?

Separate format correctness, gate correctness, and task performance.

bot check covers static structure and option resolution without a live model. The repository defines 143 model-free conformance cases and separately describes deterministic runtime tests. Crucially, its specification says that static conformance does not establish live-execution invariant compliance. 

For an actual workflow, I would use three testing layers:

Static tests: malformed layouts, missing configuration, and expected stage structure.

Gate tests: known-good and known-bad artifacts, tested without a model.

End-to-end evaluations: representative requests, checking accepted results, rejection quality, cost, latency, and human intervention.

The project’s test investment is a positive engineering signal. It is not evidence that your research report will be accurate or your generated migration will be safe. Those require task-specific evaluation.

20. Is it promising enough to adopt now?

Promising enough for a serious pilot; too early for me to recommend as foundational infrastructure.

The compatibility policy is explicit: pre-1.0 releases may change assembly and record contracts without migrations. Version 1.0 is the first promised cross-version compatibility boundary. Retaining the matching runtime may be necessary to inspect older records. 

My pilot would use one valuable but reversible workflow and compare it with a simpler baseline. I would ask whether it reduces orchestration code, improves rejection of bad outputs, makes failures easier to diagnose, and keeps cost and operator intervention acceptable.

The decisive question is not whether the directory layout looks elegant. It is:

Does this execution model make real agent work easier to verify, maintain, and operate?

My assessment remains favorable, but more qualified than “Markdown agents look neat.” The acceptance checks and retained evidence are the compelling parts. Security, recovery limits, operating budgets, and compatibility are the reasons to proceed carefully.