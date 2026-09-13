# Public-alpha repair boundaries

Decided 2026-09-10. Ian accepted the complete known-issue repair plan after the repository moved to its new root commit. These decisions replace earlier assumptions where they conflict. Each remains cheap to overturn before its implementation ticket lands.

## Pi provider, model, and auth boundary

Bot will use the exact-pinned public `ModelRuntime` from Pi's coding-agent package. Bot will read Pi's supported local model and auth configuration. Bot will not load Pi extensions.

The rejected options were keeping Bot's lower-level SDK catalog and importing only data, or retaining Bot's separate catalog and credential store. Those options preserve a smaller dependency. They also preserve the observed disagreement between Bot and Pi. The chosen boundary removes duplicated provider and auth policy. Its cost is a larger dependency and coordinated Pi package upgrades. Ticket 0242 records the full ADR and supersedes the conflicting parts of ADRs 0002, 0013, 0017, and 0021.

## Retained callers

The current Bot repository and its public operator guidance define the retained caller set for legacy command deletion. Archived dispatcher and lifecycle repositories create no demand. The disabled old dashboard checkout is retired for Bot compatibility purposes. Restarting that checkout after deletion would require migration first.

The public getting-started path creates present demand for assembly checking, credential listing, and model listing. It does not create demand for every historical inspection command. Ticket 0247 re-audits every current executable Bot caller, migrates callers with supported replacements, and records exact dispositions. Held ticket 0217 owns deletion after every remaining caller gains a replacement or a durable retirement decision.

The cost is a longer-lived duplicate command surface. Final deletion can still break a disabled or archived caller if someone restores it without migration. Ian can overturn this decision by naming a caller as retained before ticket 0217 lands.

## Documentation publication

The documentation build remains required. Pages deployment stays disabled unless the repository variable `PUBLISH_PAGES` equals `true`. The cost is no public documentation site until Ian deliberately enables it.

## File boundary

Bot remains a trusted-process runtime and not a sandbox. It reports observed file changes. It does not prevent an assembly from writing outside its working directory. The cost is that an operator must trust the procedures and tools they run.
