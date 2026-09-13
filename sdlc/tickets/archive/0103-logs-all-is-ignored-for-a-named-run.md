---
flow: build
priority: 5
---
# Logs refuses `--all` with a named run

Promoted 2026-08-21 from
`sdlc/issues/0103-logs-all-is-ignored-for-a-named-run.md`
(severity minor, filed by the 2026-08-20 observability review).

The parser accepts `bot logs RUN --all`
(`bot/src/flags.ts:60-72`), but the named-run branch never consults
`all` (`bot/src/one-run.ts:183-193`), while help says `--all`
selects every run. The accepted combination silently does something
other than what help promises.

The triage ruling, settled here: refuse the combination. A flag
that is accepted and does nothing teaches readers that flags may be
meaningless. Done, observably: `bot logs RUN --all` is refused with
a diagnostic naming the conflict, help says so, and `--all` without
a run prefix behaves exactly as today.
