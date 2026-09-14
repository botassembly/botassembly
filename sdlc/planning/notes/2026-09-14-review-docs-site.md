# botassembly.org: first-time-user review

Reviewed 2026-09-14 against `repos/botassembly` at working-tree state, the specification in `specification/`, the installed `bot` on this machine, and the plan in `sdlc/planning/plan.md` plus the 2026-09-13 trusted-execution decision. Every runtime claim below was checked by running the command, not by reading the code.

The site builds. It is accurate about the hard things (not a sandbox, no run budget, pre-1.0). It is not approachable. 69% of its words are generated specification, the reading path is four dense pages before a newcomer sees anything run, and one sample command output on the first page of the journey does not match what the runtime prints today.

---

## 1. Page-by-page inventory

31 pages build. 18 are authored, 11 are generated from `specification/`, one is the blog index, one is the 404. Total ~55,100 words; 38,100 of them (69%) are the generated specification.

### Entry and path pages

| Page | Words | Purpose | Serves | Score | Why |
| --- | --- | --- | --- | --- | --- |
| `/` (`index.mdx`) | 560 + 463 walkthrough | Pitch, three-card story, 12-step Walkthrough, three "where next" cards, four disclaimers | Everyone | **4** | The Walkthrough is the best asset on the site and the three-card story lands in forty seconds; the page then splits the reader four ways at once and closes on a caution box. |
| `/guides/first-assembly/` | 1,553 | Install, make the home, pick an intelligence, write four files, check, run, read the record | New user, day one | **2** | It is the only real onboarding page and it carries five unrelated jobs; a reader hits install prerequisites, a `chmod` fault, a YAML config file, and a provider catalog before writing a single line of an assembly — and the `bot assembly check` refusal it shows is not what the runtime prints. |
| `/format-and-runtime/` | 722 | Separates the portable format from the `bot` implementation | Evaluator, second-implementation author | **3** | Clear and short, but it is positioned as page two of Start and answers a question a first-time user has not asked yet. |
| `/guides/authoring-assemblies/` | 2,115 | The working tour: shape, stages, checks, hooks, containers, fan-out, skills, dev loop | Assembly author | **3** | Genuinely good material, wrongly sized — nine topics in one scroll, and the fan-out section is a specification excerpt in the middle of a tutorial. |
| `/guides/install-and-use/` | 2,398 | Setup, credentials, getting an assembly, running, exit codes, reading records, refusals | Operator running someone else's assembly | **2** | Opens with a 200-word single-paragraph manifesto before the reader learns anything, then re-teaches install, credentials, homes, and record reading that `first-assembly` already taught. |

### Interactive pages

| Page | Words | Purpose | Serves | Score | Why |
| --- | --- | --- | --- | --- | --- |
| `/format/explore/` | 149 + `AssemblyExplorer` | Click through the 35 accept cases beside the exact `bot assembly check` lines each produces | Evaluator, author debugging | **4** | Shows the rung each resolved option came from, which no prose page manages; the intro paragraph argues about conformance instead of saying "click a case". |
| `/format/refusals-explorer/` | 127 + `RefusalExplorer` | Browse the 108 refuse cases by code, with the tree at fault and the repair | Author hitting a refusal | **5** | The single most useful page for a stuck user: it answers "what does this code mean" in one click and needs no prose. Currently buried at position four of the Format group. |

### Runtime reference

| Page | Words | Purpose | Serves | Score | Why |
| --- | --- | --- | --- | --- | --- |
| `/reference/invocation/` | 190 | Pointer page to six specification anchors about `bot run` | Reference seeker | **2** | Eleven lines, six of them links out; it answers nothing itself and is the first page under Runtime. |
| `/reference/resume/` | 143 | Pointer page for `bot run resume` | Operator | **2** | Same shape: three sentences and a link. |
| `/reference/inspection/` | 2,150 | Every reading command, its limits, exit codes, JSON shapes | Operator, script author | **2** | Correct and exhaustive; written in limit-and-exit-code prose ("Cursor conflicts exit 3. Missing selections exit 1.") that reads as a changelog, not a reference. |
| `/reference/management/` | 2,351 | `bot assembly install/link/list/update/remove` and what the home holds | Operator | **3** | The command table at the top is the best thing on it; everything after is duplicated by `install-and-use`. |
| `/reference/models/` | 903 | `bot model list`, intelligences, the resolution ladder | New user configuring a run | **3** | Answers the question `first-assembly` raises and cannot resolve, but the reader arrives there only by accident. |
| `/reference/auth/` | 533 | `bot auth list/login/logout/import` | Operator | **2** | Three quarters of it is release-note detail about logout transactions and Pi synchronization that no user needs. |
| `/reference/agent-tools/` | 633 | What tools a stage's agent gets, its reach, control tools, what it is not told | Author, security reviewer | **4** | Concrete, well-scoped, honest; the only page that says plainly what the agent sees. |
| `/reference/trust-boundary/` | 261 | The authority handed to an assembly | Anyone piloting it | **5** | Short, blunt, correct, and the one page that should be linked from everywhere. |
| `/reference/limits/` | 379 | What is bounded, what is not, cost | Anyone running unattended work | **5** | One table, one honest admission, no filler. |

### Explanation and project

| Page | Words | Purpose | Serves | Score | Why |
| --- | --- | --- | --- | --- | --- |
| `/principles/` | 1,354 | Thirteen design principles behind the format | Evaluator deciding whether to adopt | **3** | The strongest writing on the site, correctly placed last, but it is thirteen headings of roughly equal weight so nothing stands out. |
| `/project/development/` | 461 | Checks, hosted CI, where work is tracked | Contributor | **3** | Clear; contains version claims that the current plan retired (§3). |

### Blog

| Page | Words | Purpose | Serves | Score | Why |
| --- | --- | --- | --- | --- | --- |
| `/blog/` | index only | Blog index | Nobody, today | **1** | `navigation: 'none'` hides every link to it, its one post `a-folder-in-a-record-out.md` is `draft: true`, so the built page lists no posts and `blog/rss.xml` contains zero items. A live URL that shows an empty blog. |
| `blog/a-folder-in-a-record-out.md` | 649 | Essay: the folder that goes in, the record that comes out | First-time reader | **4** | Unpublished, and it is the clearest 650 words on the whole site. The home page's three-card story is a weaker version of it. |

### Generated specification (`docs/scripts/generate-specification.mjs`, rewritten each build)

| Page | Words | Purpose | Serves | Score | Why |
| --- | --- | --- | --- | --- | --- |
| `/specification/overview/` | 433 | What the specification is, version, how to read it | Implementer | **3** | Short and navigable after the table condensation, but opens on version and compatibility. |
| `/specification/example/` | 869 | One real assembly walked end to end | New user, implementer | **4** | The most approachable specification page, and it teaches a third assembly (`review/`) after the site already taught `reading-list` and `triage`. |
| `/specification/structure/` | 5,192 | Stage, flow, assembly, home concatenated | Implementer | **2** | Four documents at one URL; the home rules a new user actually needs are 4,000 words in. |
| `/specification/slots-and-skills/` | 2,752 | Slot vocabulary and skills | Author, implementer | **3** | Reachable, and the one specification page an author genuinely needs. |
| `/specification/graph/` | 5,635 | Graph plus all six sentinels and subflows | Implementer | **2** | Seven documents at one URL; the 2026-09-11 IA study already recommended splitting it and the split never happened. |
| `/specification/gating/` | 4,186 | Checklist, schema, gates, hooks | Author, implementer | **3** | Dense but coherent — gating is one topic. |
| `/specification/running/` | 8,801 | Invocation, prompt, runtime, auth concatenated | Implementer | **1** | The largest page on the site, four unrelated documents, and eight runtime reference pages link *into* it as their source of truth. |
| `/specification/refusals/` | 1,675 | The refusal code vocabulary | Author hitting an error | **4** | A lookup table, which is exactly right; the explorer beats it for a human. |
| `/specification/record/` | 5,273 | Record format, every event | Implementer, auditor | **2** | Essential for one audience and impenetrable for every other. |
| `/specification/invariants/` | 1,590 | Normative invariants | Implementer | **3** | Numbered and citable, which is what it is for. |
| `/specification/conformance/` | 1,696 | The corpus, the two claims | Second-implementation author | **3** | Precise; the two-claims distinction is well drawn. |

---

## 2. The first-time-user journey, walked

The reader wants: what is it → why do I want it → install → run something → write my own → what to do when it breaks. Here is what actually happens.

**What is it — works.** `index.mdx:18-28`, the three cards, land the idea in forty seconds. "A folder of plain files. The runtime walks the folder, runs the checks you wrote, and writes down what happened." No complaint.

**Why would I want it — the site never says.** There is no "compared to what" anywhere on the site. The README has it (`README.md` "Four questions": why not a script, how does it differ from LangGraph, what work does it suit). Those four paragraphs are the best sales copy the project owns and the website does not contain them. The 2026-09-11 fresh-eyes review listed "how it compares" as a wanted page; the IA study proposed it; it was never written.

**Then the reader hits the caution box.** `index.mdx:61-70` is the last thing on the home page: not a sandbox, no budget, pre-1.0, native Windows refuses. Every line is true and every line belongs on the site. Ending the landing page on four disclaimers, before the reader has seen a reason to want it, sells against the product.

**Install — the first hard break.** The Walkthrough's "Install and run one" button goes to `/guides/first-assembly/`. That page then asks for, in order: a checked platform (`:12`), `git`, a POSIX shell, `~/.local/bin` on PATH, a clone, two build commands (`:14-19`), a manually created home directory at mode 0700 with a fault message to memorize (`:23-39`), a provider catalog lookup, a hand-edited `config.yaml` with four keys and an enumerated list of six reasoning values (`:41-60`), and a credential (`:64`). That is nine prerequisites and roughly 700 words **before line 66, where the reader finally writes the first file of an assembly.** Nothing has run yet. Nothing has been seen to work yet.

**Jargon before definition.** "Intelligence" is used as a noun at `first-assembly.md:41` ("Choose an intelligence") and is never defined on that page — the closest thing to a definition arrives at `:43` as "A run needs one intelligence named `default`", which is circular. It is properly defined only on `/reference/models/`, four clicks away in a different sidebar group. Same pattern for "Pi", introduced mid-sentence at `first-assembly.md:43` as a parenthetical; "slot", used at `authoring-assemblies.md:149` and defined only in the specification; and "rung", used at `explore.mdx:11` and `authoring-assemblies.md:97` with no definition anywhere outside the specification.

**Run the first example — the journey breaks here, and it breaks hard.**

`index.mdx:55`, `first-assembly.md:193`, and `format-and-runtime.md:46` all send the reader to the four shipped examples. `install-and-use.md:114-121` teaches the target grammar: "An assembly holds one or more flows. Name both", and every example on the site uses `triage/triage`, where the two names happen to be identical. **In three of the four shipped examples they are not.** `examples/hello/flows/greet`, `examples/outline/flows/plan`, `examples/brief/flows/brief`. The site names no flow but `triage`.

A reader who follows the site to `hello` types the obvious thing and gets this, verified on this machine:

```
$ bot assembly check ./hello/hello
The assembly is not valid.
$ echo $?
2
```

One line. No code, no path, no repair. And `first-assembly.md:137-142` promised the opposite:

> Exit is `2` and prints a code, the file at fault, and the repair. Delete the `description` line from `FLOW.md` and you get this:
> ```
> key-missing  flows/digest/FLOW.md
>   Add the required key description.
> ```

I reproduced that exact scenario in a scratch directory. `bot assembly check` printed `The assembly is not valid.` and nothing else. The code, path, and sentence exist only behind `--json`. **This is the single biggest break in the journey:** the newcomer's very first command against a shipped example fails, fails silently, fails at a target grammar the site never taught, and the page that sent them there shows a sample output the runtime does not produce. (`bot run start` *does* print the promised two-line form — the inconsistency is inside the runtime, not only the docs.)

**Write my own — reachable but mistimed.** `authoring-assemblies.md` is solid. It is reached from the home page's "Build your own" button, which sits beside "Install and run one", so a reader can land on it having run nothing. Its first code block (`:19-41`) is the full 15-file `triage` tree with skills, schemas, hooks, gates, and a CHOOSE — the most complex object on the site — presented as "the shape". `examples/hello`, the one-stage minimum, is mentioned in a subordinate clause at `:43-44`.

**When something refuses — the answer exists and nothing points at it.** `/format/refusals-explorer/` is the best troubleshooting tool on the site: pick a code, see the tree, see the repair. It is sidebar position four of thirteen inside the **Format** group, which a reader entered to read the specification. No guide links to it. `install-and-use.md:206-217` ("When something refuses") does not link to it. `first-assembly.md`, which shows a refusal at `:139`, does not link to it. There is no troubleshooting page and no page answering the four questions every new user has: my run exits 1, my run exits 2, my home is wrong mode, my intelligence will not resolve.

**Premature specification links.** `first-assembly.md` sends the reader into the specification five times before the guide ends (`:163` to `/specification/structure/#the-home`, `:189` three times, `:194` once). `/specification/structure/` is 5,192 words of four concatenated documents; `/specification/running/` is 8,801. Eight of the ten runtime reference pages are pointer stubs whose body is a link list into `/specification/running/` — `reference/invocation.md` is 190 words of which six lines are links out, and `reference/resume.md` is 143. A reader following the Runtime group for an answer is bounced into the specification on the first click.

---

## 3. Accuracy

Eleven problems. Four contradict the runtime as installed, four contradict the current direction, three are internal contradictions. None are leftover access-declaration or command-filtering claims — ticket 0273's cleanup held; the only `access` mention left is `/specification/record/:161`, correctly describing it as retired and read-only.

**Contradicts the runtime (verified by command)**

1. **`guides/first-assembly.md:137-142`** — claims `bot assembly check` "exits `2` and prints a code, the file at fault, and the repair", with a `key-missing flows/digest/FLOW.md` sample. Reproduced: it prints `The assembly is not valid.` and nothing else. The fault detail is `--json`-only. Same claim restated at `guides/install-and-use.md:206-211` ("A refusal is two lines").
2. **`guides/install-and-use.md:114-121` and everywhere the examples are named** — the site teaches `<assembly>/<flow>` using only `triage/triage` and never names the flows of the other three shipped examples (`greet`, `plan`, `brief`). Following the site to `hello` or `outline` produces the silent refusal above.
3. **`guides/first-assembly.md:154` and `guides/install-and-use.md:137`** — "A successful run writes nothing to stderr… stderr carries the terminal diagnostics only: `blocked:`, `exhausted:`, `fault:`, and refusal lines." `bot run start` on this machine also emits `The retired Bot credential store is inactive; this command uses Pi's auth.json.` on stderr. `install-and-use.md:46` acknowledges the warn-once elsewhere on the same page, so the page contradicts itself.
4. **`guides/first-assembly.md:129` and `guides/install-and-use.md:180`** — "It prints one definition row followed by one row per reachable node." `bot assembly check --help` shows `--limit` defaulting to **20** rows with an `--after` cursor. Human output silently truncates a larger assembly. No page mentions pagination for this command.

**Contradicts the current direction (2026-09-13 trusted-execution decision and the plan's release rule)**

5. **`format-and-runtime.md:14`** — "`0.0.1` is the first public alpha." **`:42`** — "Claiming conformance to 0.0.1…". **`project/development.md:16`** — "Version `0.0.1` is the first public alpha. The runtime, the specification, and the examples match within this release." Nothing is published. `plan.md` "Release rule" says the first published version is `v0.1.0` and requires Ian's authorization; the decision says the project "has no date or version pressure" and supersedes the release countdown. The site announces a released alpha that does not exist. `scripts/published-runtime-contracts.test.mjs:187` mechanically enforces the wording, so the check moves with the text.
6. Same claim in the generated pages: `/specification/overview/:39,41`, `/specification/record/:40`, `/specification/conformance/:12-17`. These come from `specification/README.md:32-34` and `specification/elements/record.md:35`, so the fix is upstream in the specification, not in `docs/`.
7. **`index.mdx:69`** — "Use WSL after the final clean-clone qualification." This tells a reader to wait for an internal project milestone before using WSL. The clean-clone qualification is a release-candidate task (`plan.md` outcome 10), not a gate on the user. Same project-internal leakage on four more user-facing pages: `first-assembly.md:12` ("The final release-candidate check still has to qualify a clean WSL clone"), `install-and-use.md:28`, `project/development.md:53`, `/specification/running/:28`.
8. **`principles.md:28`** — "On Linux, macOS, and WSL, Bot preserves bytes, separates output and diagnostics, observes delivery backpressure…". WSL is asserted as checked behavior here while every other page says WSL qualification is outstanding.

**Internal contradictions and stale detail**

9. **`guides/install-and-use.md:36`** — "Credentials… come from your environment, the way the model providers' own tools take them", stated as the route, then contradicted at `:38-44` by `bot auth login` writing `~/.pi/agent/auth.json`. `first-assembly.md:64` teaches `bot auth login` as the primary route. Two adjacent onboarding pages lead with opposite answers, and they use different providers in their examples (`openai-codex` at `first-assembly.md:46`, `anthropic` at `install-and-use.md:41`) while the only `config.yaml` sample names openai-codex.
10. **`reference/auth.md:144`** — "Stored public metadata is the only safe evidence in Pi 0.85.1." A pinned dependency version (correct against `bot/package.json:31`) hard-coded into user-facing prose; it will be wrong at the next bump and nothing checks it.
11. **`reference/auth.md:150-177`** and **`reference/inspection.md:78-86`** — paragraphs written as release notes about the current implementation ("The current `bot auth logout` route invokes Pi's idempotent delete…", "Version-1 and version-2 cursors preserve their continuation meaning") rather than as reference. Not false, but it documents a migration nobody outside the project lived through.

**Checked and clean:** no access declarations, no command-name filtering, no denial events, no custom secret-scanner claims (`first-assembly.md:21` and `project/development.md:28` correctly say "the pinned secret scanner"), no native Windows support claim, no alpha countdown, and every command named on the site exists in `bot --help`.

---

## 4. Structure recommendation

Two principles drive this. **One reading path, five pages, each ending in something the reader ran or saw.** And **the specification is a destination, not a step** — today it is 69% of the site's words and 13 of the sidebar's 30 entries.

The Diátaxis split is worth using for the three groups below it (Learn / Do / Understand map to tutorial / how-to+reference / explanation) and is not worth imposing on the path itself: "Start" is one tutorial that happens to span five pages.

### Proposed sidebar

**Start** — one path, in order, nothing optional.

| Page | Its job | Moves in | Cut |
| --- | --- | --- | --- |
| **What it is** (home, `/`) | Land the idea in forty seconds and show a folder becoming a record | `index.mdx` cards + the Walkthrough, kept as-is | The four-item caution box moves to "Before you pilot it"; the three "where next" cards collapse to one primary button |
| **Why not a script** | Answer "compared to what" — script, LangGraph, prompt folder — and what work this suits | The README's "Four questions", verbatim; it is the best copy the project owns and the site does not have it | — |
| **Install** | Get `bot` working and prove it with one command that calls no model | `first-assembly.md:10-64`, the whole prerequisite stack, ending in `bot assembly check` against a shipped example that **succeeds** | Nothing; this page is allowed to be a checklist |
| **Run the shipped example** | First real run, first record, in under ten commands | `first-assembly.md:146-185` retargeted at `examples/triage`, plus the exit-code table from `install-and-use.md:143-172` | The `reading-list` assembly: it is a third teaching assembly competing with `triage` and the specification's `review/` |
| **Write your own** | Four files, `bot assembly check`, one run | `first-assembly.md:66-144`, starting from `examples/hello` (one stage) rather than a four-file build | The 15-file `triage` tree as an opener |

**Build** — how-to, reached once the path is done.

| Page | Its job | Moves in | Cut |
| --- | --- | --- | --- |
| **Stages and checks** | Write a stage, add a checklist, a schema, a gate, a hook | `authoring-assemblies.md:90-191` | — |
| **Control flow** | Folders as the graph: CHOOSE, PARALLEL, LOOP, FANOUT, subflows | `authoring-assemblies.md:193-234` | The fan-out placement rules — link `/specification/graph/#fanoutmd` instead of restating 200 words of law |
| **Skills and slots** | What an agent is told exists and what it reads on demand | `authoring-assemblies.md:235-241` + the usable half of `/specification/slots-and-skills/` | — |
| **Sharing an assembly** | Install, link, update, remove; hand it to a teammate | `reference/management.md` command table + `install-and-use.md:54-110` + `authoring-assemblies.md:243-287` | The duplicated prose in the back half of `management.md` |
| **Explore an assembly** (`AssemblyExplorer`) | See what `bot assembly check` resolves for 35 real folders, rung by rung | Unchanged | Its conformance-argument intro; replace with two sentences saying what to click |

**Operate** — how-to for someone running work.

| Page | Its job | Moves in | Cut |
| --- | --- | --- | --- |
| **Reading a record** | The four readings and which answers what | `install-and-use.md:182-204` + `reference/inspection.md`'s command list | The limit-and-exit-code paragraphs; move them under a "Limits" heading at the page foot |
| **Providers, models, credentials** | Configure `config.yaml`, define an intelligence, sign in | `reference/models.md` + `reference/auth.md:1-25` + the credential half of `install-and-use.md:34-52` — and **define "intelligence" here, once** | `auth.md:150-177` release-note prose |
| **When it refuses or fails** *(new)* | The troubleshooting page that does not exist: exit 1 vs 2 vs 128+n, the 0700 home fault, `intelligence-unresolved`, the flow-name trap, where to look next | `install-and-use.md:143-172` and `:206-217`, plus the faults verified in §3 | — |
| **Explore a refusal** (`RefusalExplorer`) | Look up any refusal code and see the tree and the repair | Unchanged, **moved here** from Format — it is a troubleshooting tool, not a specification exhibit, and it is the destination "When it refuses" should link to first | Its second paragraph about two runtimes being checked against each other |
| **Before you pilot it** | Trust boundary, what the agent can reach, what is bounded, what is not | `reference/trust-boundary.md` + `reference/agent-tools.md` + `reference/limits.md`, merged — all three are short, all three answer one question | The home page's caution box, which becomes a one-line link here |

**Understand** — explanation.

| Page | Its job | Moves in | Cut |
| --- | --- | --- | --- |
| **A folder in, a record out** | The one essay that explains the bet | The unpublished blog post, published as a page | — |
| **The format and the runtime** | The seam, and why the split matters | `format-and-runtime.md` unchanged | The `0.0.1` version claims (§3.5) |
| **Principles** | Thirteen design arguments | `principles.md` unchanged | — |

**Reference** — lookup, collapsed to two entries.

| Page | Its job | Moves in | Cut |
| --- | --- | --- | --- |
| **Command reference** | Every `bot` command, its flags, its exits, in one table | `reference/invocation.md`, `reference/resume.md`, and the limit paragraphs from `inspection.md`/`management.md` | The five pointer-stub pages disappear; a stub whose body is a link list is a redirect wearing a page's clothes |
| **Specification** | The format's law, one group, collapsed by default | The 11 generated pages, unchanged, with `running` and `graph` split in the generator as the 2026-09-11 IA study already recommended | Nothing in the specification; the change is that no guide sends a first-time reader here |

**Project** — `Development and Testing`, unchanged apart from the version claims.

**Blog** — either publish `a-folder-in-a-record-out.md` (drop `draft: true`, turn navigation back on) or stop building `/blog/`. An empty live blog index with a zero-item feed is worse than no blog.

### Component verdicts

- **Walkthrough** — earns its place, stays on the home page. It is the strongest thing the site has and the only place a newcomer sees a folder become a record without installing anything.
- **RefusalExplorer** — earns its place, **moves to Operate**, and becomes the target of the new troubleshooting page. Today it is the answer to the reader's worst moment, filed under the specification.
- **AssemblyExplorer** — earns its place, **moves to Build**, next to the authoring how-tos. It answers "what will my frontmatter actually resolve to", which is an authoring question, not a conformance one.

### Sidebar count

30 entries today across 5 groups → 19 across 6, with the specification's 11 pages inside one collapsed group instead of occupying a third of the visible nav.

---

## 5. Style: the three most common problems

**1. The long compound sentence that carries four facts.** The dominant failure, and it is worst exactly where a newcomer reads. `install-and-use.md:8-20` opens the page with a **single 148-word sentence chain** across three clauses joined by em-dashes and semicolons, ending on "The bet underneath all of this is that the files outlive the program." Nothing runs, nothing is defined, and the reader has read a paragraph. `install-and-use.md:135` is a 12-sentence paragraph covering `--in`, worktrees, absolute paths, the sandbox warning, `workdir`, four override flags, and three `--local-context` values. `first-assembly.md:144` is nine sentences on one line covering `--json`, edit cadence, cost, static-vs-dynamic, child rungs, and credentials. The fix is mechanical: one fact per sentence, and a new paragraph at every topic change. The workspace rule already says this — subject, verb, object, split into two sentences.

**2. Terms used before they are defined, or defined only in the specification.** "Intelligence" is a page heading at `first-assembly.md:41` and is circular at `:43`; its definition lives on `/reference/models/`. "Pi" arrives as a mid-sentence parenthetical at `first-assembly.md:43`. "Slot" is used at `authoring-assemblies.md:149` and `agent-tools.md:30` and defined nowhere outside `/specification/slots-and-skills/`. "Rung" appears at `explore.mdx:11` and `authoring-assemblies.md:97` with no definition on the site at all. "Sentinel" appears at `authoring-assemblies.md:215`. A first-time reader meets four undefined nouns before running anything. Every one of these needs one defining sentence at first use on the Start path.

**3. Self-referential framing — the site narrating itself instead of telling the reader what to do.** `format-and-runtime.md:6`: "This site documents two things. Tell them apart and the rest reads straight." `first-assembly.md:12`: "This is the one install recipe, and every other page on the site points back at it." `explore.mdx:9`: "The lines are not a demonstration. They are the bytes the conformance corpus asserts…" `refusals-explorer.mdx:11`: "The corpus asserts the code and the path, never the sentence." Ten of the eighteen authored pages open with the italic disclaimer "*This page describes the `bot` runtime's command surface — an implementation reference, not part of the runtime-agnostic format specification.*" — a 21-word caveat about documentation taxonomy, in the reader's first line, on ten pages. The format-versus-runtime distinction is real and it deserves one page (it has one). It does not deserve a header on every page.

*Runners-up, worth a pass but not systemic:* hedged self-qualification that reads as defensiveness (`format-and-runtime.md:18` "Passing the corpus is not the whole claim", `principles.md:28` "It does not claim formal POSIX certification"), and project-internal process leaking into user prose (every "final release-candidate check" mention in §3.7).

---

## 6. Build status

**Clean.** `npm ci` then `npm run build` in `docs/`, exit 0, 31 pages in 2.85s, 0 npm vulnerabilities, 0 deprecation warnings.

Generators ran and reported their own counts, which match the repository: `corpus.json: 143 cases (35 accept, 108 refuse), 790 files` — verified against `specification/conformance/accept` (35) and `refuse` (108), so the "143 cases" claim repeated across six pages is correct. `walkthrough.json: 12 steps, 14 files, 6 check rows, 22 record lines`. Pagefind indexed 31 HTML files; the sitemap built.

**Two warnings, both benign and both Starlight defaults:**

```
[WARN] [content] The collection "i18n" does not exist or is empty.
[WARN] [content] Entry docs → 404 was not found.
```

The first is Starlight looking for translation overrides the site does not use. The second is Starlight looking for an authored `404.md`; it falls back and `dist/404.html` builds correctly. Neither needs fixing, though an authored 404 that points at the Start path would silence the second and serve a lost reader.

One build-behavior note for whoever does the rewrite: `docs/scripts/generate-specification.mjs` **wipes and rewrites `src/content/docs/specification/` on every build**. Never edit those eleven pages; the fix for §3.6 is in `specification/README.md` and `specification/elements/record.md`. Four generator tests (`navigation.test.mjs`, `published-runtime-contracts.test.mjs`, `no-domain-words.test.mjs`, `root-check.test.mjs`) mechanically enforce sidebar coverage, exact runtime-contract wording, and vocabulary; a sidebar restructure will fail `navigation.test.mjs` until that test is updated alongside it.
