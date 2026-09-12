---
base: 02fe2e1e5af314bbbc542145b6bf60bfafd8a5a4
head: dc02559d0134b096883ad394f66c5b0ba7106ae8
---

# Enforce self-contained maintained prose

The public-tree check now covers 139 tracked files across eight maintained prose classes. It preserves six historical exclusions. The checker uses bounded project-name rules, allows the exact security contact only in `SECURITY.md`, reads a covered symlink as stored link text, rejects non-text maintained prose, and fails closed when a covered tracked path cannot be read. Fourteen adversarial tests cover the path and lexical contract.

Sixteen maintained prose files now describe external consumers, project lifecycle scripts, dispatchers, and dashboards in generic terms. All 453 excluded record and archive files remained unchanged. The measured baseline, legacy-command ledger, five lifecycle scripts, provenance, and separate living-source guard also remained unchanged.

The first primary check encountered an ignored test directory left by an earlier agent run. No process owned it. The primary agent moved it to `/tmp/botassembly-0236-stale-test-lnMxQb` and did not delete it. The repeated complete check passed and removed its own temporary directory, so the abandoned directory did not reproduce as a product defect.

The final local `make check` passed with 80 repository tests, 1,525 runtime tests, and 143 conformance cases. GitHub Actions runtime run `34536192613` passed.
