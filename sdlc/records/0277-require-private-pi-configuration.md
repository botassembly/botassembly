---
base: 7025fa121422ae849f24a435718550bbd25e72ce
head: 41f1f515acb822edeaf8d9253a7b05cb9f52a0d4
---

# Pi configuration is private before use

Bot now requires each existing Pi configuration path used by an operation to have a private POSIX shape. The agent directory must be a real directory owned by the effective user with mode `0700`. `auth.json` and command-capable `models.json` must be real regular files owned by the effective user with mode `0600`; symbolic links are refused. Missing paths remain valid. Each command checks only the files its selected runtime uses.

This is a filesystem account boundary. It does not restrict Pi tools, shell commands, hooks, gates, subprocesses, or ordinary environment inheritance. Pi's environment-backed and command-backed configuration remains trusted operator input and retains the operator's filesystem and network authority. Bot still removes recognized provider credential variables before agent-side work. Same-account replacement and pathname races remain accepted limits.

The public model reference gives a tested shell procedure that replaces a linked model file with a private regular copy without overwriting an existing temporary path. Bot never repairs operator configuration. The offline examples gate now supplies its own private Pi directory and cannot inherit the operator's Pi configuration. No implementation or test changed Pi, read live Pi configuration content, contacted a provider, or made a paid call.

Independent design review rejected two drafts until they used effective-user ownership, preserved route-specific file checks, distinguished the full logout command from its mutation runtime, and retained bounded public error projections. Independent code review rejected the first implementation because `fs.access` checks the real user on POSIX and because the first migration shell could continue after a failed prerequisite. The accepted implementation uses a read-only open and awaited close, and tests the exact published shell against success, a regular source, an existing copy, and a dangling copy link.

The complete local gate passed 143 repository and documentation tests, 1,631 runtime tests across 207 files, all 143 conformance cases, static checks, the repository scanner, four isolated public examples, and the 18,142-line production-size check under Node 22.22.3. Hosted runtime run `34783444920` passed on the implementation commit. Hosted documentation run `34783445072` built the site and passed its nested same-commit complete check.
