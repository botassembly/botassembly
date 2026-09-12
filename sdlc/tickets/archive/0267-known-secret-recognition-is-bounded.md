---
flow: build
priority: 1
deps: []
---
# Known secret recognition is bounded

## Outcome

One repository-owned detection library recognizes the selected provider credential families in supplied bytes, skips binary input deterministically, and reports bounded locations without reproducing credential text.

## Current facts

The repository has no credential-value scanner. `bot/src/credentials.ts` carries the Pi-derived ambient environment registry used for authentication and stage scrubbing. Its secret-bearing subset is every name ending in `_API_KEY`, `_AUTH_TOKEN`, or `_OAUTH_TOKEN`, plus `AWS_ACCESS_KEY_ID`, `AWS_BEARER_TOKEN_BEDROCK`, `AWS_CONTAINER_AUTHORIZATION_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `COPILOT_GITHUB_TOKEN`, and `HF_TOKEN`. File, URI, profile, project, location, account, and gateway identifiers are configuration rather than secret values. Current tests include short harmless placeholders that must keep passing.

## Scope

Add a dependency-free, version-1 detection library and focused tests. This ticket does not enumerate Git state, read the repository, apply exceptions, alter workflows, or join the complete gate. Later tickets own those boundaries.

Recognize the following prefix rules. Length is the total ASCII byte length including the prefix. A match must not have `[A-Za-z0-9_-]` immediately before or after it. A same-alphabet run longer than the maximum is one rejected near miss, not a shorter match.

| Rule id | Prefix | Total bytes | Remaining alphabet |
| --- | --- | ---: | --- |
| `openai-project` | `sk-proj-` | 40–256 | `[A-Za-z0-9_-]` |
| `openai-service` | `sk-svcacct-` | 40–256 | `[A-Za-z0-9_-]` |
| `anthropic-key` | `sk-ant-` | 40–256 | `[A-Za-z0-9_-]` |
| `google-api-key` | `AIza` | exactly 39 | `[A-Za-z0-9_-]` |
| `github-fine-grained` | `github_pat_` | 30–255 | `[A-Za-z0-9_]` |
| `github-classic` | `ghp_`, `gho_`, `ghu_`, `ghs_`, or `ghr_` | exactly 40 | `[A-Za-z0-9]` |
| `aws-access-key` | `AKIA` or `ASIA` | exactly 20 | `[A-Z0-9]` |
| `groq-key` | `gsk_` | 40–128 | `[A-Za-z0-9_-]` |
| `xai-key` | `xai-` | 40–256 | `[A-Za-z0-9_-]` |

Recognize PEM blocks with exactly matching `PRIVATE KEY`, `ENCRYPTED PRIVATE KEY`, `RSA PRIVATE KEY`, `EC PRIVATE KEY`, `DSA PRIVATE KEY`, or `OPENSSH PRIVATE KEY` labels. Delimiters occupy their own lines. The body permits only base64 characters, `=`, spaces, tabs, LF, and CRLF. It must contain 64 through 15,000 non-whitespace body bytes, and the complete block including delimiters must not exceed 16,384 bytes. Digest the complete raw block with its delimiters and original line endings.

Recognize assignments only for the exact secret-bearing environment subset above. Move the current Pi-derived environment registry to one internal shared module. Runtime authentication, scrubbing, and scanner selection must derive from that same exported value; do not parse TypeScript source text.

An assignment occupies one physical line and begins after optional spaces or tabs. Shell and dotenv accept optional `export`, the exact unquoted name, `=`, and one value. YAML accepts the exact unquoted name, `:`, and one value. JSON or JavaScript object properties accept the exact name unquoted or in single or double quotes, `:`, and a single- or double-quoted value. Template literals and any quoted value containing a backslash do not qualify. A quoted value is the raw bytes between its quotes without decoding. An unquoted value is the uninterrupted printable ASCII token after `=` and ends at ASCII whitespace. After a value, shell and YAML admit horizontal whitespace followed by an optional `#` comment; object properties admit horizontal whitespace, an optional comma or closing brace, then an optional `//` comment. Any other trailing byte rejects the whole assignment.

Values must contain 20 through 4,096 printable non-space ASCII bytes after quote removal. Exclude the exact case-insensitive values `redacted`, `example`, `placeholder`, and `not-a-secret`; a value made only of `x`, `*`, or `.`; and one complete `<...>` placeholder. Environment names are case-sensitive. Every recognized assignment produces the stable rule id `environment-assignment` and digests the exact raw value bytes after quote removal. A successful assignment match takes priority and suppresses prefix matches inside its value. An excluded, malformed, short, or overlong assignment produces no assignment match and receives ordinary prefix scanning, so wrapping or embedding a recognized provider token still fails.

The library accepts one byte candidate. A candidate of at most 2,097,152 bytes is admitted; one byte more returns `{kind: "candidate-too-large"}`. A candidate containing NUL or invalid UTF-8 returns `{kind: "binary"}` and no match. Zero through 100 matches return `{kind: "matches", matches}`. Discovery of match 101 returns only `{kind: "too-many-matches"}` with no partial match data. Match order is byte offset then rule id. Each match exposes only rule id, one-based line, zero-based byte offset, and lowercase SHA-256 of the exact bytes defined above. It exposes no matched text, prefix, suffix, length, or source line.

A formatter accepts only these match facts plus a caller-supplied repository-relative label. A valid label is nonempty UTF-8 text, uses `/` separators, has no empty, `.` or `..` component, does not start with `/`, and contains no U+0000–U+001F, U+007F–U+009F, U+2028, or U+2029 character. Invalid labels return `label-invalid`. Clip a valid label over 512 UTF-8 bytes to the longest code-point prefix of at most 509 bytes followed by `...`. The exact diagnostic is `secret: RULE at LABEL:LINE (byte OFFSET)\n`. It must remain within 1,024 UTF-8 bytes and the formatter never receives candidate bytes. Subprocess and repository collection failures are outside this ticket.

## Acceptance

Table-driven tests cover both boundaries of every prefix alphabet and length, every private-key label and block bound, and every exact secret-bearing environment name in all four assignment forms. Near misses cover token boundaries, same-alphabet overrun, short and overlong assignment values, invalid trailing bytes, quote escapes, template literals, split prefixes, unmatched or mismatched PEM delimiters, invalid PEM body bytes, all excluded configuration names, placeholders, comments that only name a variable, harmless current fixtures, NUL, invalid UTF-8, 2 MiB and 2 MiB plus one byte, 100 and 101 matches, CRLF line counting, and multibyte text before a match. Overlap tests prove one assignment result and no nested prefix result.

No failure or formatted diagnostic contains a planted credential or any substring longer than four characters unique to it. Rule ids and output order are stable. The drift test proves the selected registry still equals the defined subset of `CREDENTIAL_ENVIRONMENT_NAMES`. Focused tests, static checks, `git diff --check`, and the current complete gate pass without integrating this library into lint.

## Dependencies

None. This is the first of five tickets that implement alpha outcome 5. Later tickets collect current Git states, validate exceptions, collect proposed history with trusted hosted bases, and integrate the finished scanner into local and hosted gates with documentation.

## Risk facts

Credential formats change. Generic assignments can reject harmless examples. A detector that returns source text can leak the value through logs. Binary and resource handling can turn a security check into an unbounded gate. This ticket deliberately leaves repository and Git semantics for separate review.

## Size decision

- Starting production size: 18086 nonblank lines
- Ending production size: 18344 nonblank lines
- Simpler approach tried: Keep the environment list inside `credentials.ts`, export it, and add recognition beside existing hashing and UTF-8 helpers.
- Why insufficient alternatives were rejected: Exporting from `credentials.ts` would make the detector load the credential store and provider runtime. The existing hashing helpers belong to record writing or file-copy boundaries, and the existing UTF-8 helpers truncate or parse specialized inputs. None owns bounded secret recognition. The implementation shares the small environment registry and keeps detection local in one dependency-free module.
- Production code deleted: 47 lines that held the private environment-name registry in `credentials.ts`.
- Accepted cost: 258 net nonblank production lines add the shared registry, byte-bounded provider and PEM recognition, exact assignment parsing, bounded disclosure-free results, stable ordering, and safe label formatting. The duplication search covered `credentials.ts`, `record.ts`, `record-line-stream.ts`, `run-start.ts`, `gate-feedback.ts`, `home-installation.ts`, and the other existing SHA-256 call sites. They provide primitives or domain-specific behavior, not this contract.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 7
- Minimum level floor: 4, because a false negative can publish a credential and a diagnostic can reproduce it.
- Final level: 4
- Reasons: The work is local to one library, but detection boundaries, drift, disclosure-free facts, and resource refusals require adversarial proof.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted after three rejection rounds. The first design combined detection, Git states, exceptions, hosted history, and integration and could not prove shallow hosted history. The split design then made rule boundaries, overlap, assignment grammar, PEM bytes, refusal results, formatting, and registry drift exact. Final review corrected one overlap false negative and the reach score before acceptance.
- Implementation evidence: The first complete-gate run exposed that `check-size-decision.mjs` admitted current drafts and completion records but omitted direct accepted tickets. A red regression proved an unchanged active decision and `sdlc/tickets/README.md` cannot authorize a raise while a changed direct active ticket can. The checker now admits only numbered Markdown files directly beneath `sdlc/tickets/`, retains the draft and record paths, and the test harness preserves child diagnostics under Node's test runner.
- Code review: accepted after one rejection. The first test matrix omitted five excluded configuration names. The accepted remediation derives every excluded name from the shared-registry set difference and proves all four assignment forms remain unrecognized. Review found no detector, disclosure, bound, formatter, registry, or size-check defect.
- Hosted prerequisite: runtime run 34711681836 exposed an unrelated concurrent installation race. Ticket 0268 passed independent design and code review, complete local verification, implementation run 34717268615, and publication run 34717616052. The current tree qualifies the accepted detector without folding installation behavior into this ticket.
