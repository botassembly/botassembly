---
base: 7aa27e31aff32a24ca5b29486840fa66eb00bf8c
head: ed1bdd511fa6e14b092afcf914d4d3e2a9fc4dc6
---

# Authored access is retired

Bot now runs trusted assembly stages with ordinary Pi file and Bash tools under the operator's operating-system authority. Assembly authors no longer declare `access`. Bot no longer parses executable allowlists, filters file-tool paths, or writes new `tool_denied` events. Current documentation states that an operator who needs containment must provide an operating-system boundary such as a restricted account, container, or virtual machine.

Old assemblies that still declare `access`, including an empty mapping, fail assembly checking with `key-unknown` before model work. Resume applies the same refusal to captured old syntax. This prevents silent execution with greater authority than the author requested.

Record-1 compatibility remains narrow and explicit. Readers still validate and render the exact historical `stage_start.access` and `tool_denied` forms. They still reject unknown events, malformed legacy fields, and denial events outside an open stage attempt. Credential environment discovery and removal remain independent of the retired policy.

The implementation deleted `bot/src/access.ts` and the related current-runtime parsing, validation, filtering, propagation, denial writing, and harness adaptation. A small read-only legacy event vocabulary remains. Production TypeScript contracted from 18,171 to 17,962 nonblank lines. Pi source was reference material only and did not change.

Independent design review accepted the outcome after correcting its routing and complexity description. Independent code review rejected the first proof because one tripwire was bypassed, one positive legacy fixture was malformed, one ordering test reached the wrong rule, and one sentence fragment remained. The repaired implementation made the model-work tripwire live, supplied an exact retained output, exercised the open-attempt rule, and repaired the prose. The reviewer then accepted it after 56 tests across eight suites and a clean diff check.

The final local gate passed 139 repository and documentation tests, 1,583 runtime tests across 203 files, all 143 conformance cases, static checks, the repository scanner, and the production-size check. An earlier complete run exposed one isolated provider-retry deadline failure; its focused suite passed all 18 cases, and the final complete run passed cleanly. Hosted documentation run `34771918810` and hosted runtime run `34771918877` passed on the exact implementation commit.
