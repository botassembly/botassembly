# Public run records

Decision: publish curated event records when documentation needs concrete evidence. Do not track complete run folders or raw provider session files.

Reason: an agent can print its inherited environment. The session recorder preserves that tool output exactly. A published session exposed revoked credentials after a stage ran `printenv` while debugging. An older session also retained biomedical example text after the maintained example changed.

Enforcement: `.gitignore` excludes `examples/runs/`. The public-tree check rejects any tracked path beneath that directory. The documentation build reads `examples/triage-record.jsonl`, which contains event facts without raw provider messages or tool output.

Ian can overturn this decision by defining and mechanically checking a safe export format for complete runs.
