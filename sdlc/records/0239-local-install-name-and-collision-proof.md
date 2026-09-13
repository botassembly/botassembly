---
base: 36210638c88ff1798e44d85e2c9b101c65099dcd
head: b32d506d2ca2edaa81b5c70a98728fdbb668048d
---

# Name local dot installs from their directory

`bot assembly install .`, `bot assembly install ./`, and `bot assembly link .` now use the resolved current directory basename. Explicit names, `#subdir` names, ordinary local paths, Git locators, and `.git` stripping keep their prior behavior. The specification, changelog, generated management reference, and install guide publish the rule. The guide distinguishes a live link from a fixed install and its later update.

A real-process regression test installs a local assembly, changes its source, and repeats the install. The second process exits `2`, writes the exact refusal to stderr, writes nothing to stdout, preserves the first copy and provenance, and leaves no staging residue. The test does not claim simultaneous-install safety.

Independent design review rejected the first draft because its resolved-path wording could have renamed unrelated valid sources. The accepted level-2 design limits the change to exact `.` and `./` spellings. Luna High implemented the ticket. Independent Sol Medium code review rejected the first process test because a hung child had no deadline or cleanup owner. Luna added the shared child deadline. Review then found a broad type annotation that broke TypeScript compilation. Luna had incorrectly reported that typecheck passed. Luna removed the annotation and reran the exact command. Final review accepted the result.

The primary local `make check` passed with 81 repository tests, 1,561 runtime tests across 218 files, 143 conformance cases, all static checks, and the exact source ratchet. GitHub Actions documentation run `34544092321` and runtime run `34544092334` passed on commit `b32d506`.

## Size decision

- Starting production size: 16580 nonblank lines
- Ending production size: 16581 nonblank lines
- Simpler approach tried: Keep the existing default-name function unchanged and special-case `.` in each install and link caller.
- Why insufficient alternatives were rejected: Two caller changes would duplicate the shared naming rule and could make install and link disagree. The single shared helper keeps the behavior in one place.
- Production code deleted: None.
- Accepted cost: 1 nonblank production line for the narrow shared `.` and `./` naming rule.
