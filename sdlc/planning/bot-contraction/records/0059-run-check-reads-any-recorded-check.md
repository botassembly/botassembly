---
flow: build
priority: 10
completed: 2026-09-08
---
# `bot run check` reads any recorded check

## Result

`bot run check RUN NAME` now lists every well-formed recording for an exact check name. Human output uses inert Markdown. JSON uses the version-1 `bot.run.check` result. The rows retain stage, repeat, retry, exit, capture, executable file, and executable digest facts in record order.

The `--file` filter distinguishes several executable gates within one attempt. The stage, retry, and optional repeat selector narrows one attempt. Raw mode returns exact held bytes for one selected recording, including a failed recording. Without an attempt selector, it requires agreeing successful recordings after the optional file filter. The reader safely buffers captures through 16 MiB before delivery. Shape-1 records do not authenticate capture contents. Their optional digest identifies the executable gate.

The reader accepts completed check facts from a valid incomplete run. It refuses malformed matching facts, invalid or oversized records, unsafe or unstable capture paths, and oversized captures without partial pre-delivery output. Capability discovery, help, the specification, conformance coverage, and the command matrix publish the same contract. The legacy `bot show --check` reader remains unchanged.

## Design review

Independent Sol Medium design review rejected three drafts before accepting ticket 0059. The first draft treated the executable digest as a capture digest, left the JSON shape and malformed-event behavior open, and mislabeled incomplete records as corrupt. The second lacked a file selector for gate folders and inherited a 1 MiB reader limit even though the writer permits 16 MiB captures. The third made file-only raw reads require one recording, which could not serve a lifecycle caller across retries. The accepted design adds `--file`, uses successful agreement whenever no attempt selector exists, names every result field and exit class, and keeps the writer and record schema unchanged.

## Model comparison

The pushed annotated baseline tag `experiment/0201-baseline-20260908` identifies `0ad39f77df7ef794b69b1d2d696c694fdbc937d1`. A mechanical random byte returned 99. The parity mapping assigned odd values to Candidate A as Sol Medium and even values to Candidate A as Luna High. Candidate A therefore used Sol Medium. Candidate B used Luna High. Both candidates received the same ticket and prompt in separate neutral worktrees.

Sol Medium's initial candidate was `070e1baf0a9883b4c5dd628a17632835a68533f2`, preserved by `experiment/0201-sol-medium-20260908`. It changed 491 lines across nine files and added 205 test lines. Luna High's initial candidate was `e6710769726d13d9d60c3b8d4334f0c0a7b15a43`, preserved by `experiment/0201-luna-high-20260908`. It changed 433 lines across eight files and added 42 test lines. Luna did not run Vitest because it used the machine's default Node 18 instead of the available Node 22 path.

Both blind reviewers disqualified both initial candidates. Reviewer 1 scored Sol 80 and Luna 49. Reviewer 2 scored Sol 80 and Luna 46. Sol failed invalid-home handling and raw-output delivery. Luna failed omitted-exit handling, repeat selection, and raw-output delivery. One reviewer also proved that Luna's held-file change missed final path replacement.

Each candidate received only its own findings and one remediation. Sol produced `5654d3819933aadcc0734b0bd1bb3975ebd0be0f`, preserved by `experiment/0201-sol-medium-remediated-20260908`. Luna produced `6d58b7be4e974b71d98a4311faf262e54f230c2b`, preserved by `experiment/0201-luna-high-remediated-20260908`. Sol changed 565 lines and added 244 test lines. Luna changed 581 lines and added 171 test lines.

Reviewer 1 then scored Sol 90 and Luna 68. Reviewer 2 scored Sol 93 and Luna 74. Sol averaged 91.5. Luna averaged 71. Sol led by 20.5 points, and both reviewers preferred it. Sol had no remaining disqualification. Luna remained disqualified. One reviewer proved an uncaught synchronous raw-destination failure. The other proved that Luna changed the shared held-file behavior used by the legacy reader and other commands. Sol kept the stronger stability rule local to the new reader.

Sol Medium won noticeably under the recorded rule. The result moves 0218, 0207, 0209, 0204, and 0216 to Sol Medium. Sol keeps 0203, 0205, and 0219. Luna High keeps the permission issue, 0181, 0206, and 0215. Ian can overturn this routing with one planning edit.

The final worktree started clean from the baseline tag and replayed the accepted Sol patch. The replay is `0a671e76fb598b495573a5e2acc3b64b9f33591e`, preserved by `experiment/0201-final-replay-20260908`. The consolidated ticket commit adds only the completion and planning updates to that replay.

## Checks

The Sol candidate's first five command tests failed before implementation because `run check` still reached legacy run parsing and capability discovery had no operation. Before remediation, its focused command suite passed 11 tests and the related legacy, capability, help, and specification suites passed. After remediation, 38 focused tests across five files passed in blind review. Type checking, focused lint, specification generation, specification checks, dependency checks, cycle checks, and `git diff --check` passed.

The primary complete offline check passed on the consolidated commit. It ran 19 project tests, 209 runtime test files with 1,433 tests, and 143 of 143 conformance cases. Coverage reported 96.41 percent of production lines. The source ratchet passed at 15,910 of 15,910 nonblank lines.

No live-provider test ran.

## Size decision

- Starting production size: 15647 nonblank lines
- Ending production size: 15910 nonblank lines
- Net increase: 263 nonblank lines
- Simpler approach tried: reuse the legacy `inspectCheck` reader and the existing 1 MiB held-file helper.
- Why insufficient alternatives were rejected: the legacy reader selects executable files instead of check names, drops failed recordings, exposes no recording list, and cannot read every valid 16 MiB check capture. Changing its shared file boundary would also alter retained legacy behavior.
- Production code deleted: no obsolete reader can leave before ticket 0217's caller-migration trigger.
- Reason: one local command parser and reader own exact selection, structured output, integrity errors, and raw delivery. A separate bounded held-file helper keeps the 16 MiB and final-path checks local to this command.
- Accepted cost: 263 production lines, one more public command, one `--file` selector, and up to 16 MiB of memory for a raw capture read.

## Source

This manual ticket came from draft 0201. The draft is consumed by this record.
