# Public run records

Decision: never publish records or sessions produced by a provider run. Public documentation may use authored synthetic evidence that it labels as synthetic. The conformance record and walkthrough fixture are the only reviewed record-shaped exceptions. The public-tree check pins each exact path and SHA-256.

Reason: an agent can print its inherited environment. The session recorder preserves that tool output exactly. A previously published session exposed revoked credentials after a stage printed its environment during debugging. Retained artifacts can also preserve requests and responses after maintained examples change.

Enforcement: `.gitignore` excludes `examples/runs/`. The public-tree check rejects retained-run paths, record and session basenames outside the exact exceptions, Bot record structures, and Pi session structures across maintained public content. The documentation build reads only `docs/src/data/synthetic-walkthrough-record.json`. Its source and rendered display identify it as synthetic. The checker pins its bytes and the authored conformance record's bytes.

This decision supersedes the earlier policy that allowed curated provider records. Ian can overturn it by approving a safe export contract and its mechanical enforcement.
