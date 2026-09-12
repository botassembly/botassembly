# Full-suite clone-install cleanup can fail intermittently

A full `bot` check run once timed out in
`bot/tests/install-source-confinement.test.ts`, while removing the cloned
source left an `ENOTEMPTY` directory. The test passes in isolation and on a
later full run, so its cleanup or concurrency behavior needs investigation.

2026-09-05: left open. Two full `make check` runs observed on 2026-09-05 between `443ce956` and `c496dd31` passed without recurrence. Close on a cause or after a month without recurrence.
