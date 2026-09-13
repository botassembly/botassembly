---
flow: build
priority: 1
deps: []
---
# Tests never read operator authentication

## Outcome

All ordinary test home, configuration, and Pi authentication resolution stays beneath the suite-owned temporary root, and every native Pi runtime constructed by a test names an explicit test credential boundary.

## Current facts

`bot/tests/model-runtime.test.ts` creates one native Pi `ModelRuntime` without an authentication path or injected credential store. Pi therefore resolves its default from `PI_CODING_AGENT_DIR` or the process home and may read the operator's `~/.pi/agent/auth.json`. The test needs only a native runtime to observe refresh and streaming calls. It does not need real authentication. No mutation was observed.

The Vitest global setup already creates one private checkout-local temporary root and directs `TMPDIR`, `TMP`, and `TEMP` there. It does not isolate `HOME`, `XDG_CONFIG_HOME`, or `PI_CODING_AGENT_DIR`.

## Scope

Extend the suite-owned environment boundary so Pi's default agent directory and ordinary home/configuration fallbacks resolve beneath the private test root. Give the directly constructed runtime an explicit empty test authentication path or store as a local defense. Audit every direct `ModelRuntime.create` test call and remove any other ambient authentication resolution found.

Put native test runtime construction behind one test helper whose input type requires either `authPath` or `credentials`. Add a checked source rule that rejects `ModelRuntime.create` anywhere else in test code. Keep any test of default path resolution separate from native runtime construction. The rule belongs in the existing test-source or lint boundary and carries positive and negative fixtures.

Preserve `cli-home-resolution.test.ts`, `cli-scratch-session-prompt.test.ts`, `auth-snapshot.test.ts`, and the authentication command tests that deliberately exercise injected home and configuration precedence. Change no production behavior, public contract, credential format, or authentication command.

## Acceptance

A focused test plants a canary credential outside the suite root and proves that no native runtime derives credential state from it. A separate direct assertion proves Pi's default agent directory, home, and Bot configuration paths resolve inside the suite-owned root. The helper's type rejects an omitted credential boundary. The checked source rule rejects direct native construction outside that helper. Explicit `authPath` and `credentials` forms pass.

`model-runtime.test.ts`, `auth-transition.test.ts`, `auth-snapshot.test.ts`, `credentials.test.ts`, `cli-auth-list-contract.test.ts`, `cli-auth-login-contract.test.ts`, `cli-auth-logout-contract.test.ts`, `cli-auth-import-contract.test.ts`, and `cli-auth-import-durability.test.ts` pass together. The canonical root `make check` passes.

## Dependencies

None.

## Risk facts

The current test can read plaintext provider credentials into a test process. The repair changes process-wide test environment defaults, so it must preserve tests that deliberately change those values and restore them after each case.

## Complexity

- Contract score: 0
- State and timing score: 1
- Reach score: 1
- Proof score: 1
- Cost of error score: 2
- Total: 5
- Minimum level floor: level 4 for credible credential and command-backed authentication exposure
- Final level: 4
- Reasons: The change is test-only, but it changes the suite-wide environment and must prove that later native Pi runtime tests cannot silently return to the operator's plaintext store.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted after one rejection. The accepted design uses one typed helper that requires `authPath` or `credentials`, rejects direct and aliased native construction elsewhere, isolates default resolution under the suite root, and proves credential state rather than an unobservable absence of file opens.
- Code review: accepted after two rejection rounds. The first review found assignment, computed-property, bound-call, dynamic-import, and unscanned-extension escapes. The second found more value-acquisition forms and a scope false positive. The accepted guard forbids value-level acquisition of Pi's `ModelRuntime` outside one typed helper, covers all eight Vitest source extensions, permits type-only use, and proves hostile imports, re-exports, aliases, and loaders. A final review accepted the Node-only harness rename after the complete gate exposed Vitest collecting its former `.test.mjs` name.
