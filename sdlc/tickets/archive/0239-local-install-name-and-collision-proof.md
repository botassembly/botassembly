---
flow: build
priority: 1
---
# Local installs have useful names and refuse collisions visibly

## Outcome

Installing or linking `.` or `./` uses the current directory's resolved basename. A sequential name collision visibly refuses and preserves the installed copy.

## Current facts

The raw basename of `.` is `.`. That name fails the existing home-boundary check. The same production path owns install and link naming.

Current code already refuses a sequential collision before it copies or links. A two-process reproduction observed exit `0` for the first install and exit `2` for the second. The second process wrote nothing to stdout and reported `request-invalid`. The first installed `ASSEMBLY.md` kept its original bytes after the source changed. The repository lacks a process-level regression test for that guarantee.

## Scope

Change default naming only when a local locator's spelling becomes `.` after trailing slashes are removed. For `.` and `./`, use `basename(resolve(cwd, "."))`. Preserve every other naming rule. A `#subdir` still wins. Git locators and ordinary local locators keep their current names. Existing `.git` stripping stays. An explicit `--name` bypasses default derivation.

Apply the dot rule to both `assembly install` and `assembly link`. Add process-level proof for the existing sequential collision guarantee. Do not add or claim a simultaneous-install guarantee.

Update the naming sentence and development guidance in `specification/elements/management.md`, add one changelog entry, regenerate the mirrored management reference, and update one maintained guide. State that `link` exposes later source edits, `install` makes a fixed copy, `update` refreshes that copy, and repeating `install` refuses.

## Acceptance

Use separate homes to prove these cases:

- `assembly install .` derives the current directory basename, prints that name, creates that target, and records the canonical source.
- `assembly install ./` has the same result.
- `assembly link .` derives the same name and links to the resolved source.
- `assembly install . --name team/review` keeps the explicit name.
- `assembly install ./tumor-board` keeps `tumor-board`.

Use separate real CLI processes for the sequential collision proof. The first process installs the source. Change the source after that process exits. The second process repeats the install. Assert exit `2`, empty stdout, the exact `request-invalid` stderr, unchanged installed content and provenance, and no `.bot-install-*` residue. The dot-name test must fail against the old implementation. The collision test starts green because it preserves an existing guarantee.

The focused tests and the complete repository check pass.

## Dependencies

None.

## Risk facts

This changes one public naming rule shared by install and link. A mistake can select or replace the wrong local assembly. The narrow spelling check avoids changing symlinks, `..`, `foo/..`, filesystem roots, trailing-slash paths other than `./`, and local names ending in `.git`.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 5
- Minimum level floor: none
- Final level: 2
- Reasons: One narrow shared naming rule changes. Separate-process proof covers the existing sequential refusal and preserved bytes without adding a concurrency contract.
- Selected model: `gpt-5.6-luna` with high reasoning

Re-score if implementation exposes a new contract, state, timing, reach, proof, or cost-of-error fact.

## Size decision

- Starting production size: 16580 nonblank lines
- Ending production size: 16581 nonblank lines
- Simpler approach tried: Keep the existing default-name function unchanged and special-case `.` in each install and link caller.
- Why insufficient alternatives were rejected: Two caller changes would duplicate the shared naming rule and could make install and link disagree. The single shared helper keeps the behavior in one place.
- Production code deleted: None.
- Accepted cost: 1 nonblank production line for the narrow shared `.` and `./` naming rule.

## Review

- Design review: accepted after the naming scope, command coverage, collision proof, documentation targets, and complexity score became exact
- Code review: accepted after adding a bounded child-process cleanup path and removing one broad type annotation that broke typecheck; the complete local and hosted checks passed
