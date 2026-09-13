---
flow: build
priority: 1
deps: [0269]
---
# Stored Git protocol fails closed

## Outcome

The ticket 0269 collector interprets supported repository state, Git metadata, batch object responses, limits, and counters completely and deterministically. Malformed or excessive settled Git output produces one bounded refusal with no partial findings.

## Current facts

Ticket 0269 proved ordinary SHA-1 HEAD and index behavior but deliberately withheld a hostile-boundary claim. Survey of the accepted code found unproved linked-worktree, SHA-256, gitlink, replacement, alternate-object, path, metadata, batch, limit, and counter behavior. It also found likely errors in framing accounting, request-limit attribution, partial-byte counting, logical-limit ordering, empty scans, and invalid test-boundary handling.

Git 2.43 on the supported Linux platform can create SHA-256 repositories. Refusing them would leave a silent release limitation, so this ticket supports them and proves both 40-byte SHA-1 and 64-byte SHA-256 identifiers. Ticket 0272 separately owns the real child-process lifecycle. This ticket tests Git interpretation through real repositories and an injected already-settled process adapter.

## Scope

Modify `bot/src/stored-git-secrets.ts` and its focused tests. Preserve `scanStoredGitSecrets(root, boundary?)`, its result union, fixed production limits, fixed executable, and minimal environment. Do not add working or untracked filesystem reads, ignored-file policy, exceptions, history ranges, remotes, trusted bases, commands, workflows, documentation, or gate integration.

The injected process adapter is a trusted test seam in this ticket. It must validate exact command arguments and environment and return already-settled bounded stream facts. Every 0271 collector test uses that adapter, including real-repository cases. The real-repository adapter may invoke Git synchronously as fixture mechanism, then deliver controlled settled chunks to the collector. This ticket does not modify or directly test the production child launcher. Ticket 0272 moves injection below process launch and proves that production can create those facts safely. This ticket makes no claim about spawn, stdin, backpressure, deadlines, signals, stream errors, forced cleanup, or late events.

### Repository interpretation

Support ordinary and linked non-bare worktrees whose real supplied root equals their real top level. Resolve the absolute worktree Git directory and pin it plus the worktree on every later command. Accept only Git-reported `sha1` and `sha256`, then accept only lowercase hexadecimal identifiers of exactly 40 or 64 bytes for that selected format.

Every Git invocation places `--no-pager` and command-line `-c core.fsmonitor=false` before the subcommand. Every command after discovery also keeps replacement objects disabled and pins the resolved Git directory and worktree. Caller `PATH`, `HOME`, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_NAMESPACE`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*`, `GIT_CONFIG_VALUE_*`, and replacement-ref variables cannot redirect selection. Repository-owned common objects and `objects/info/alternates` remain valid because Git owns their interpretation. A malicious repository-local `core.fsmonitor` command cannot execute, and paging remains disabled. This ticket makes no broader claim about Git commands outside the exact plumbing invocations it tests.

Resolve `HEAD^{commit}` once. A detached HEAD works. An unborn HEAD requires one stable `refs/heads/...` symbolic name, successful `check-ref-format`, expected absent commit and exact ref statuses with empty stdout, and identical repeated symbolic and absent-ref observations. Malformed names, another symbolic namespace, a ref that appears or disappears, a changed symbolic name, unexpected status, or malformed output refuses. A trusted injected process failure remains `process-failed`; semantic absence or inconsistency becomes `head-invalid`.

Real fixtures prove a commit and blob replacement ref cannot change the selected bytes, a repository-owned alternate object store works, and a gitlink is skipped without descent while `.gitmodules` scans as an ordinary blob.

### Metadata protocol

Parse complete NUL-delimited `ls-tree -rz --full-tree --long` and `ls-files --stage -z` records without newline splitting. Accept only exact field counts and separators. HEAD blob modes are `100644`, `100755`, and `120000`, type is `blob`, size is canonical unsigned decimal, and identifier matches the selected format. An exact HEAD gitlink is mode `160000`, type `commit`, valid identifier, and size marker `-`. Index blob modes match HEAD and stages are zero through three. An exact index gitlink is mode `160000` with a valid identifier and stage.

Validate every raw path before building a label. It fatal-decodes as UTF-8, occupies 1 through 4,096 bytes, is relative, uses `/`, contains no empty, `.` or `..` component or backslash, and contains no U+0000 through U+001F, U+007F through U+009F, U+2028, or U+2029. A path refusal exposes only source and raw-byte SHA-256.

Reject truncated records, empty embedded records, extra or missing fields, noncanonical sizes, unsafe integer sizes, unknown or mismatched modes and types, stages outside zero through three, and short, long, uppercase, or nonhex identifiers. Track duplicate HEAD paths and duplicate index stage/path pairs before deciding whether an entry is a blob or skipped gitlink. A duplicate therefore cannot hide through mixed blob and gitlink metadata. Metadata order does not affect the final deterministic semantic sort.

### Object protocol and projection

Do not start `cat-file` for an empty semantic set. For a nonempty set, request each unique identifier once in first-semantic-candidate order through one `cat-file --batch` operation. Parse incrementally across every possible chunk boundary. Require the requested identifier in exact order, type `blob`, canonical size, exact body length, one response terminator, and no trailing byte. Reject missing objects, response permutation, wrong identifier, wrong type, invalid or mismatched size, truncation, duplicate response, and trailing output. A HEAD declared size must equal the validated batch size.

Run the detector once per unique object and project its result to every sorted semantic candidate. Equal bytes under distinct identifiers remain separate detector calls. Repeated identifiers share one call while HEAD and every index stage retain distinct findings and counters. Binary is a completed intentional skip. Candidate-too-large and too-many-matches refuse the complete collection.

### Limits, counters, and results

Production defaults remain 100,000 semantic candidates, 256 MiB logical bytes, 256 MiB unique blob bytes, 1,000 findings, 6,500,000 request bytes, 16 MiB batch framing, and ticket 0267's 2 MiB candidate size and 100-match bounds. Tests may inject only positive safe integers no greater than each production default. Invalid injected limits refuse as `root-invalid` under a new stable `boundary` operation without starting Git and without a fabricated process fact.

Count request bytes before writing each complete request. `request-byte-limit` identifies the first unique object's first sorted semantic candidate whose request would cross the budget and excludes that request. Framing counts every validated header byte, header newline, and response terminator. `framing-byte-limit` identifies the response candidate that would cross it. Unique received bytes count every body byte delivered, including a partial body before refusal. A header whose declared size would cross candidate or unique limits latches the corresponding reason before accepting body bytes.

Apply per-candidate and unique-byte admission at each unique object's header. The bounded batch may finish reading and detecting later unique objects before semantic projection reaches a logical-byte refusal. After the complete object cache settles, project candidates in deterministic semantic order. Logical bytes count every semantic projection, including cached objects, and exclude the first candidate that would cross the ceiling. A logical refusal can therefore retain unique-object request, received, and processed counters for objects that completed before projection. Finding count excludes the finding that would cross 1,000 and returns no partial findings.

Both complete and refused results retain the exact existing counter object. Tests pin each counter at zero, exact admission, completion, cached projection, binary projection, partial body, and every first-blocked-candidate boundary. Every refusal keeps earlier completed counters, contains no findings, and exposes only its stable operation plus validated source, label, path digest, identifier, or settled process digest facts allowed by the existing result union.

## Acceptance

Real repositories through the trusted settled adapter prove linked worktrees; SHA-1 and SHA-256; gitlinks and `.gitmodules`; commit and blob replacement refs; repository-owned alternate objects; and the full hostile ambient Git environment list. A repository-local filesystem-monitor sentinel remains untouched. The adapter rejects any command that omits `--no-pager`, `-c core.fsmonitor=false`, or the required post-discovery repository pins. A planted synthetic token proves the selected stored bytes without appearing in returned diagnostics or test-process output.

Table tests through the public collector cover every path, mode, type, stage, identifier, field, separator, duplicate, truncation, cache, and object-response case named above. Chunk tables split every batch header, body, and terminator boundary. Unborn tables cover stable absence and every malformed or changing observation.

Downward-limit tables cover invalid, exact, and exceeded candidate, semantic, logical, unique, finding, request, and framing values. Counter assertions cover every admission and refusal rule. Empty scans prove no object operation. No test bypasses `scanStoredGitSecrets` to reach a parser directly.

Focused tests, lint, type checking, unused-code analysis, `git diff --check`, the production-size check, and the complete local and hosted gates pass under a credential-scrubbed environment.

## Risk facts

Incorrect repository interpretation can scan the wrong commit, index, or object store. A parser omission can create a publication bypass. A refusal that retains source or Git error bytes can disclose the value it protects. This ticket closes settled-protocol behavior but cannot make production process facts trustworthy until ticket 0272 proves the launcher and stream lifecycle.

## Size decision

- Starting production size: 18648 nonblank lines
- Ending production size: 18679 nonblank lines
- Simpler approach tried: Trust Git's text rendering, read one object per process, accept SHA-1 only, or treat all malformed records as one generic process failure.
- Why insufficient alternatives were rejected: Those choices can reproduce source, scale poorly, reject a supported repository format, or erase the exact refusal and counter evidence needed to prove complete scanning.
- Production code deleted: Remove or simplify ticket 0269 parsing and accounting wherever the complete tables make it redundant.
- Accepted cost: One repository and settled-protocol hardening pass. The separate process-lifecycle ticket prevents its fake-child state machine from entering this review.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 8
- Minimum level floor: 4, because a false negative can publish a credential.
- Final level: 4
- Reasons: The outcome is one settled Git protocol, but it covers adversarial repository metadata, object framing, resource bounds, and disclosure-safe refusals.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Origin: ticket 0269's independent implementation review split functional stored-state scanning from release-grade hardening. The follow-up survey split repository and settled-protocol correctness from child-process lifecycle so neither ticket repeats 0269's oversized contract.
- Design review: accepted after two rounds. The first review corrected impossible pre-batch logical admission, required every test to stay above a trusted settled adapter, and made filesystem-monitor and pager containment exact. The accepted design leaves all launch and stream lifecycle behavior to ticket 0272.
