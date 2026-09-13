---
base: 19912ef5c0cfa24b36dce1d5d62146529cfdefc9
head: e317ae7c42721e3b43178775147dc2a73d39fbe9
---

# Update Vitest to the patched release

The two direct Vitest development pins and all nine installed Vitest-family packages moved from 4.1.10 to 4.1.11. The lockfile retained the same 439 record keys. Every production dependency and non-development lock record remained unchanged. No transitive package became a direct dependency.

The design review expanded the ticket to require whole-family alignment, stable production lock records, a normal clean install, and a check for the named advisory. npm 10.9.8 crashed during an ordinary lock-only refresh in its optional-peer resolver. The accepted command used `--legacy-peer-deps` for the lock refresh. A later ordinary `npm ci` passed.

The primary `npm audit --json` reported zero vulnerabilities after the update. Local `make check` passed with 71 repository tests, 1,525 runtime tests, and 143 conformance cases under Vitest 4.1.11. GitHub Actions runtime run `34532705649` passed.
