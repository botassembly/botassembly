---
base: 718ff15ecf5c726c47a8ec1dd40a8afe5e7fea06
head: 60f1838bf1ea05252d852386f38faa9d0d385376
---

# Linux and macOS have one permanent platform qualification

`make platformcheck` now qualifies Bot's supported command-line boundary on Linux and macOS. The POSIX shell owner runs scratch installation, all shipped examples, and 16 named runtime test files in fresh Vitest processes. It then repeats the two earlier cleanup owners ten times each. The existing complete Ubuntu gate remains separate. A dedicated hosted matrix runs the focused owner on `ubuntu-latest` and `macos-latest` with Node 22.22.0.

Bot now admits Node's `linux` and `darwin` platforms at CLI entry. Native `win32` refuses before Bot command work with direct WSL guidance. Other unsupported platforms receive a generic Linux-or-macOS refusal. Process-boundary construction still precedes admission, and WSL continues through Node's Linux spelling. The implementation adds no native Windows layer, containment, executable allowlist, provider call, or Pi change.

The portable process proofs use direct Node pipes. They cover bounded standard input, ordinary and raw output, early reader closure, signals, locks, owned child cleanup, installation collisions, and retained evidence. Linux retains the `/dev/full` proof; macOS makes no claim about a device it lacks. The two historical cleanup shapes remain their only repeated owners, and neither reproduced a product defect.

Independent design review rejected the first design because it overstated injected lock and process witnesses, omitted request-limit coverage, and claimed too much before the process boundary existed. The accepted design separated those claims, named the exact owners, preserved Linux-only evidence, and kept the check offline. Independent code review rejected the first implementation because its command contract was incomplete, two child harnesses were unmanaged, one portable writer owner was absent, and the production-size gate was stale. The repair pinned the complete ordered invocation contract, reused the guarded child helper, added the portable output proof, and aligned the 18,483-line ratchet. Independent review then accepted the implementation.

Hosted macOS exposed three test-harness portability classes before completion. First, macOS canonicalized temporary paths through `/private/var`; installcheck now compares the complete physical checkout path. Second, macOS returned `EPERM` where Linux returned `EISDIR` for the same preserved-directory unlink failure; the assertion admits only those two exact codes. Third, hosted Vitest exhausted its 2 GiB heap. Each named file now gets a fresh process, and the 8 MiB paused-output proof uses exact length and per-byte scalar checks that cannot ask Vitest to format a giant buffer diff. These repairs changed no product behavior.

The implementation commit is `60f1838bf1ea05252d852386f38faa9d0d385376`. The complete local gate passed 150 repository and documentation tests, 1,698 runtime tests across 210 files, all 143 conformance cases, static checks, and the production-size check. The focused platform owner passed its 16 named files with 125 tests, then both cleanup owners passed ten fresh repetitions each for another 100 test executions.

Hosted runtime run `34798219558` passed on the same implementation commit. Its complete Ubuntu job and its focused Linux and macOS platform jobs all succeeded.
