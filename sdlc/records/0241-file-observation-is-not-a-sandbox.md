---
base: d39c72781e4b8a4e543176f3050385303b53db73
head: 465693778a6187dfcaa73093b6636117e92e11e5
---

# State the non-sandbox boundary

Public guidance now states the runtime's actual safety boundary. Without `access`, a model receives read, write, edit, and Bash tools. Direct file tools accept absolute paths. A declared access policy refuses direct model-facing calls at Bot's dispatch. It does not contain allowed commands, configuration, aliases, subprocesses, hooks, or gates. Those processes retain the operator's filesystem and network authority.

The specification and guides now distinguish retained evidence from complete observation. Bot retains direct tool calls reported by the model harness and denied direct calls recorded by Bot. It does not watch the filesystem or claim a complete list of changes. Operators must supply operating-system or container containment before running an untrusted assembly or model.

The runtime behavior did not change. One focused test now proves that an unrestricted direct write accepts an absolute path outside `$PWD`. Its cleanup owns the outside directory from creation. The existing allowed-Git proof still shows that an admitted executable can reach a file denied to direct file tools. Publication tests now pin the safety wording across the README, specification, generated reference, principles, and getting-started guide.

Independent design review rejected the first draft because it described filesystem observation that Bot does not perform. The accepted level-4 design names reported calls, denied calls, process authority, the documentation owners, and the required proof. Sol Medium implemented the ticket. Independent code review rejected the first patch because the README implied that `access` removes tool definitions and the new test began cleanup ownership too late. The implementation corrected both points. The second review accepted the complete patch.

The primary local `make check` passed with 81 repository tests, 1,563 runtime tests across 218 files, 143 conformance cases, all static checks, and the unchanged 16,582-line source ratchet. GitHub Actions runtime run `34547776893` and documentation run `34547776722` passed on commit `4656937`. The earlier design-only runtime run `34546453606` also passed.
