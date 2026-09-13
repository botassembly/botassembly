---
base: 09bff3a86741da931690070259d286b0e5fccaa1
head: 577d8a2c3a1509f3479bd83edda366c6fc9a616b
---

# Isolate tests from operator authentication

Every test now starts with private home, configuration, data, temporary, and Pi agent paths beneath the suite-owned checkout directory. Native Pi runtime construction lives behind one typed helper that requires an explicit authentication path or credential store. A checked source boundary rejects value-level access to Pi's `ModelRuntime` elsewhere across every test-source extension that Vitest accepts.

Independent code review twice found ways around the first call-pattern scanner. The accepted design rejects runtime-class acquisition instead of trying to recognize every possible alias and call. Hostile fixtures cover imports, re-exports, assignment, destructuring, computed access, binding, reflection, CommonJS loading, dynamic loading, and TypeScript import-equals. Type-only use remains available.

The focused ticket suite passed 165 tests outside the process sandbox. The complete local gate passed 118 project tests, 1,526 runtime tests across 200 files, 143 conformance cases, static checks, and coverage. Hosted runtime run `34701663492` passed on the implementation commit. One credential-lock test timed out only inside the command sandbox and passed outside it; disabling the new isolation reproduced the sandbox failure, so no product defect was attributed to this ticket.
