# The offline gate is expensive on a shared machine

Observed 2026-09-14 on the Linux box (16 cores, 27 GiB) while five tickets ran through review chains in parallel worktrees.

One runtime test rung at commit 74e7598 took 121.67 s of wall time with 707.52 s of summed test time and 229.37 s of summed import time, so about eight workers stayed busy for two minutes. `make -C bot test` runs `npm run test:coverage`, so every local gate pays V8 coverage instrumentation. The 235 test files contain 160 child-process spawn sites, and each spawned `node bot/src/cli.ts` pays a fresh TypeScript transform. Two documentation tests added by ticket 0284 each build the Astro site from a temporary copy.

The larger cost was process, not the suite. Today's chain ran the full gate roughly twenty times: each implementer ran it at least once per review round, each code reviewer reran the full suite, and at the peak three worktrees ran gates at once. The 15-minute load average sat near 6.5. Implementers reported `hostile-gating` and `cli-auth-import-contract` timing out only under cross-worktree load. The workspace rule allows one broad gate per repository at a time; the day's schedule broke it.

Levers, in order of expected return:

1. Run one broad gate per repository at a time, by the primary agent, after code review accepts. Reviewers run focused suites only. This needs no code.
2. Cap vitest workers for local runs (for example `maxWorkers` at half the cores) and leave the hosted runner uncapped.
3. Make coverage a separate target that the hosted check and the completion gate run, and let `make check` run `vitest run` without instrumentation. Confirm first what the coverage summary gate enforces so the ratchet keeps its proof.
4. Share one Astro build across the sidebar and redirect tests.

Disposition belongs to Ian: levers 2 through 4 change the gate contract that records cite.
