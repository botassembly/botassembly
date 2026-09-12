---
flow: build
priority: 9
completed: 2026-09-10
---
# Smoke uses the supported one-run reading

## Result

Bot smoke now reads `bot run show RUN -j` instead of scraping human `bot show` rows. One strict shared parser validates the exact facts consumed by the driver, S5, S6, and S10. The driver derives the scratch root only from reported stage scratch paths. A source check prevents executable smoke files from restoring either legacy invocation form.

## Review and checks

Luna High implemented the accepted level-2 design. Independent Sol Medium review found one duplicate changelog heading. A later primary audit found one active legacy command in smoke guidance. Luna High fixed both. The same reviewer accepted exact implementation head `59f00387b316db1df56e824a0c2e084e58bfe4c9` with no remaining code finding.

The saved-session S6 falsification produced exactly one intended failure and returned to 47 passing assertions after restoration. The final offline gate passed 63 project tests, 215 runtime files with 1,523 tests, all 143 conformance cases, and 97.15 percent line coverage. Production runtime source stayed at 16,350 nonblank lines.

Two live attempts passed credential preflight and then stopped at S1 because this machine's provider subscription reported its usage limit. Both attempts recorded zero tokens. Ian confirmed on 2026-09-10 that OpenAI Codex works on his other machine and accepted this machine-specific omission for landing. The accepted cost is no new-session live proof of the migrated S5 and S10 readers from this checkout. The saved-session proof, focused tests, complete offline gate, and independent review remain the evidence for the migration.

## Source

This manual ticket started from published commit `02e4e3b6c5c961da5674820c6038ff3fef6570ee`. Commits `71c92836` through `478dec5c` record design and acceptance. Commits `12a1dd42` through `59f00387` contain implementation, evidence, and review repairs. Commit `f282358d` records final review. This ticket completes source draft 0230.
