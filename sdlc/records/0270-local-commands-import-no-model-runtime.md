---
base: 34b83f195ba2f91fb4e35eb070f638c22b0b4dbf
head: 2b032713ecefd9aef2f43b5575df3bb403a28f8c
---

# Local commands import no model runtime

Bot now chooses from one closed command table before loading any model-backed handler. Help, capabilities, home management, assembly management, and run inspection load no `@earendil-works` module. Authentication, model listing, run start, and run resume load their handlers only after selection. The Pi package root remains Bot's only model-runtime import and now loads once on demand. Pi source remained reference material and received no changes.

The implementation moved run mutation out of the CLI composition file and moved slot expansion into a pure module. Those moves removed two indirect paths from local commands to the Pi-backed tool graph. Authentication-path resolution also became asynchronous. Login and logout still recognize Pi's synchronization error after the lazy module settles. Authentication import keeps resolver failures inside its bounded command error contract and does not print internal failure text.

Independent design review rejected the first ticket because it did not close the Pi-capable operation set or prove the full process graph. The revised ticket named all seven Pi-capable operations and required the complete inventory as their exact complement. Independent code review rejected the first implementation because resolver failures escaped the authentication-import contract and malformed probes did not exercise supported commands. The repair added valid fixtures, asserted every command result, and received independent acceptance.

Fresh Node 22.22.3 measurements ran `bot --help` five times before and after the change. The prior implementation measured 1.91 seconds on its first process and 1.05 to 1.07 seconds afterward. The lazy implementation measured 0.29 seconds first and 0.23 seconds afterward. These measurements describe the observed checkout. The enforced contract checks loaded modules instead of timing.

The complete local gate passed 127 repository and documentation tests, 1,715 runtime tests across 204 files, all 143 conformance cases, static checks, and the production-size check. Hosted runtime run `34760117918` passed on the exact implementation commit. Production size moved from 18,679 to 18,728 nonblank lines. The accepted 49-line cost establishes the closed lazy dispatcher, cached Pi resolution, asynchronous authentication path, and pure slot-path carrier without duplicating run mutation or path expansion.
