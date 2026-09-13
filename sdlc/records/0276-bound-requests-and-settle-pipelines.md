---
base: 57c9e001d8985f066fd67154a5e268c9fa555ad4
head: c193f93c6e97dbab5b79b5b5c69bcc8efe231a6a
---

# Requests are bounded and pipelines settle

Bot now admits at most 4,194,304 request bytes from an argument, complete task source, retained parsed task body, standard input, or resumed donor. It refuses byte 4,194,305 before run birth. Direct and task-file size refusals occur before home access. Standard input stops at the first excess byte without waiting for end-of-file. Historical larger requests remain available through raw inspection but cannot seed a resumed run.

Ordinary command output now uses one ordered process-owned delivery queue. Explicit exit waits for queued writes and their callbacks. An early-closing reader remains quiet success for a successful command. Another stdout failure makes a successful command nonzero and emits one bounded inert diagnostic. Failed and signalled commands retain their existing status. The raw reader keeps its separate fixed-extent streaming path and original failure ownership.

The specification now states concrete Linux, macOS, and WSL command-line behavior instead of claiming formal POSIX compliance. It also states that ordinary commands can materialize or queue output before delivery, while raw inspection retains bounded-memory streaming. Pi source and behavior did not change.

Independent design review rejected the first draft until it defined task transformations, byte boundaries, delivery precedence, race coverage, and the ordinary-output memory limit. Independent extra-high code review rejected the first implementation because delayed writable destruction could still emit an uncaught error, raw `/dev/full` produced a duplicate diagnostic, and several end-to-end witnesses were missing. A second review required direct proofs for oversized resume artifacts, task read extent, pre-home refusal, and already-queued writes. The repaired implementation passed the final review. The complete gate then found and repaired an overly broad invocation early return. Existing malformed extension and timeout behavior remains intact.

The complete local gate passed 139 repository and documentation tests, 1,613 runtime tests across 207 files, all 143 conformance cases, static checks, the repository scanner, and the production-size check. One unchanged hostile-provider timing guard failed once under full-suite load, then passed eight focused repetitions and the complete rerun. Production TypeScript is 18,142 nonblank lines. Hosted runtime run `34779985976` passed on the implementation commit. Hosted documentation run `34779986165` built the site and passed its nested same-commit complete check.
