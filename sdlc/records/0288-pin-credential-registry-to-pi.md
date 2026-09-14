---
base: a7527b9b82e1e61d723d194601bb7473fac0b82a
head: 14cdcdc26db2f1f757ceaee82c0102c900c2dd34
---

# A test pins the credential registry to Pi's own sources

`bot/tests/pi-credential-names.test.ts` scans `dist/**/*.js` of the pinned `pi-ai` 0.85.1 package with the ticket's extraction rule: names passed to `env(...)`, `getProviderEnvValue(...)`, or `resolveValue(...)`, names inside an `envApiKeyAuth(label, [...])` array, and the constants in `env-api-keys.js`, resolving module-level string constants so `providers/cloudflare-auth.js` reads through them, and taking no bare uppercase literal. The scan yields 63 names, compared against `CREDENTIAL_ENVIRONMENT_NAMES` both ways. Two declared exception lists are asserted non-stale both ways: the two AWS container authorization token names the AWS SDK reads beneath Pi, and five behavior flags carrying no credential.

Eight authentication inputs Pi reads that Bot scrubbed nowhere join the non-secret list in `credential-environment.ts` and the non-secret fenced list in `slots.md`: `AWS_REGION`, `AWS_DEFAULT_REGION`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, `KIMI_OAUTH_HOST`, `KIMI_CODE_OAUTH_HOST`, and `PI_OAUTH_CALLBACK_HOST`. `slots.md` gains one sentence saying a test pins the registry to Pi's source. The ratchet moved from 18874 to 18882 nonblank lines. `specification/CHANGELOG.md` gained a 2026-09-14 entry.

Independent design review rejected the first draft for a narrow scan root, a missed `AWS_SESSION_TOKEN` read, the missed region names, no extraction rule, and a needless dependency. It rejected the second draft for wrongly exempting six authentication inputs as behavior flags. The corrected draft, moving all six to the non-secret list alongside the other two, was accepted. Independent code review wanted one fix: a constant scan widened for a lint rule was narrowed back to position-anchored matches, comments were corrected, and the count assertion now names the drift instead of only failing silently. Accepted at `a1f8196`; verified accepted at `2f1c87a` after a rebase onto `669b7a2`. Red demonstrations: planting `getProviderEnvValue("BOT_FAKE_KEY")` in a scratch provider file was named by the failure, and removing `AWS_PROFILE` from the registry was named the other way.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, all 143 conformance cases passed, vitest ran 215 files and 1746 tests passed, and `node --test` ran 160 tests passed. `make -C bot coverage` printed `coverage-summary: 124 production modules across four dimensions.`. Hosted runtime run `34867834423` and hosted docs run `34867834637` both passed on commit `14cdcdc`.

Four limits stay open. The scan reads `node_modules`, so it fails on an uninstalled tree. A computed name escapes the extraction rule. The comma alternative in the `env-api-keys.js` constant scan could still take an unrelated comma-preceded uppercase literal in that one file; it fails loud in the safe direction rather than silently. Both exception lists need a look at each Pi upgrade.

**Decision Ian can overturn:** the eight names are scrubbed from stages as non-secret inputs and never redacted. A stage that reads `AWS_REGION` or an Azure endpoint name stops seeing it in a report.
</content>
