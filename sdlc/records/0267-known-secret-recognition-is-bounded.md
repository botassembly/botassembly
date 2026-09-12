---
base: e153c40c3a11b651ddb059cbd77d71d1a16bb0c6
head: f9fa306c3b1b9220721311904b218980d1547e9d
---

# Known secret recognition is bounded

Bot now owns one dependency-free secret detector. It recognizes the selected OpenAI, Anthropic, Google, GitHub, AWS, Groq, and xAI token shapes; six private-key block forms; and assignments to Pi's secret-bearing credential environment names. Authentication, child credential scrubbing, and assignment recognition share one environment-name registry.

The detector accepts at most 2 MiB, refuses binary and invalid UTF-8 input, stops at match 101, and returns at most 100 facts. Each fact contains only a stable rule, line, byte offset, and SHA-256 digest. The formatter accepts only safe repository-relative labels and never receives candidate bytes. Assignment matches suppress nested provider-prefix matches without suppressing ordinary scanning of malformed or excluded assignments.

Table-driven tests cover every admitted boundary, rejected near miss, environment name, assignment form, private-key label, resource ceiling, overlap, ordering rule, and disclosure limit. The focused detector suite passed 106 tests. The complete implementation gate passed 127 repository and documentation tests, 1,624 runtime tests across 201 files, all 143 conformance cases, static checks, and the production-size check. Production size moved from 18,086 to 18,344 nonblank lines.

Independent design review rejected three incomplete designs before accepting the split detector contract. Independent code review rejected one missing negative matrix before accepting the implementation. The first hosted implementation run then exposed an unrelated concurrent installation race. Ticket 0268 reproduced and repaired that race under its own independently reviewed contract. Hosted runtime runs `34717268615` and `34717616052` passed the current tree containing the accepted detector and completed prerequisite.

This ticket deliberately does not scan repository or Git state, define exceptions, inspect proposed history, or join the release gate. Four subsequent tickets own those boundaries.
