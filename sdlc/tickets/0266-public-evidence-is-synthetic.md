---
flow: build
priority: 1
deps: []
---
# Public evidence is synthetic

## Outcome

No retained provider run or session supplies bytes, identifiers, timings, hashes, model usage, or prose to the public repository. Any record-shaped documentation fixture is visibly synthetic, independently reviewed, and confined to one named fixture boundary.

## Current facts

`examples/triage-record.jsonl` is a transformed 89-event provider run. `examples/triage-output.txt` retains prose produced by the same run and supplies headings to the walkthrough. The root README quotes a shortened record excerpt and links the full file. The draft blog quotes twelve lines and calls them verbatim. The home-page walkthrough generator reads both retained artifacts, exports run-derived facts into `docs/src/data/walkthrough.json`, and tests pin those values. The current public-tree check rejects `examples/runs/` but permits these renamed artifacts, any `record.jsonl` or `session.jsonl` elsewhere, and recognizable record or session structures in public content. The conformance record at `specification/conformance/records/v1/record.jsonl` contains plainly invented values, but the conformance prose calls it only a frozen current-shape fixture. The durable `public-run-records.md` decision still authorizes curated provider records and names the transformed example record.

## Scope

Delete the transformed example record and the provider-produced triage output. Remove the derived README and blog excerpts and every claim or link that presents them as real run evidence. Remove the walkthrough generator's dependency on retained-run bytes and replace only the visual facts it still needs with one clearly named synthetic fixture or directly authored synthetic data. Do not present synthetic values as measured runtime behavior. Keep the runnable triage assembly and its checked static assembly output. Supersede `public-run-records.md`: public examples use authored synthetic evidence, while retained provider records and sessions remain local. State explicitly that the existing conformance record is synthetic.

Strengthen the tracked-tree check across maintained public content. Reject known retained-run path shapes and `record.jsonl` or `session.jsonl` basenames outside exact reviewed fixtures. Structurally reject a byte stream containing a `run_start` or `stage_start` event plus another current Bot event, including JSON, JSONL, generated data, and fenced Markdown under neutral filenames. Structurally reject both Pi session forms: a direct object or transaction-array member with `type: "message"` and a nested `message` object carrying a role and content, including tool-result messages. Parse or scan JSON code fences as data rather than relying on their filename or extension.

Allow the existing conformance record only by exact path and a checker-pinned SHA-256. If the walkthrough retains record-shaped data, allow one exact documentation fixture by exact path and a checker-pinned SHA-256 whose source and rendered output label it synthetic. Replacing either allowed fixture without updating its reviewed digest must fail, including replacement with recognizable retained-run bytes. Do not exempt a directory, arbitrary JSON, generated output, tests, or historical records broadly.

Independent code review must inspect every admitted documentation fixture fact and confirm from its construction and values that it was authored for this repository rather than copied or transformed from a provider run. The completion record preserves that review verdict. Mechanical checks establish location and shape; they do not claim to prove provenance from bytes.

## Acceptance

`git ls-files` contains no `examples/triage-record.jsonl`, no `examples/triage-output.txt`, and no other non-fixture retained run or session artifact. The README, blog, walkthrough source, generated walkthrough data, and tests contain none of the removed run id, event count, timestamps, hashes, model usage totals, output prose, or claims of verbatim real-run evidence. The site builds and the walkthrough still explains that a run leaves a local record, while labeling any illustrative record or output display synthetic. The public-record decision rejects provider-derived publication, and conformance prose labels its frozen record synthetic.

Public-tree mutations reject a retained path under an alternate public directory, either forbidden basename, a compact Bot record sequence, a direct-entry Pi session, and a transaction-array Pi session containing ordinary or tool-result messages. Exact reviewed synthetic fixtures pass only at their pinned digests. Replacing an allowed fixture, renaming a forbidden artifact, wrapping record objects across Markdown lines, or embedding either structure in a JSON code fence does not bypass the check. The public-tree checker remains offline, reads tracked stored bytes without following links, and fails closed on non-text content in every content class it inspects. Focused public-tree, walkthrough, documentation, and tutorial tests pass, followed by `git diff --check` and root `make check`.

## Dependencies

None. Roadmap order places this after ticket 0265 so the strengthened public-tree check becomes part of the restored complete gate.

## Risk facts

Names alone miss copied records. Broad token matching can reject ordinary documentation and test source. Generated walkthrough data can silently retain derived facts after its source disappears. A fixture label cannot prove provenance, so independent inspection remains part of acceptance. Removing the ticker entirely is acceptable if a smaller truthful walkthrough explains the same local-record concept.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 7
- Minimum level floor: 4, because the change defines a security-sensitive public-content admission boundary and provenance review.
- Final level: 4
- Reasons: The change spans repository admission, generated documentation, public claims, and an exception whose incorrect scope could republish sensitive run material.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted after one rejection. The first design missed the provider-produced output, left the old publication decision in force, did not explicitly establish conformance-fixture provenance, and allowed weak fixture and structural boundaries. The accepted design deletes both provider artifacts, supersedes the decision, pins exact fixture digests, and defines Bot plus both Pi session shapes with bypass mutations.
- Code review: pending
