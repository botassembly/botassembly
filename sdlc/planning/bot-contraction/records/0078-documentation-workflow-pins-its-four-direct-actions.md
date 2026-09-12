---
flow: build
priority: 5
completed: 2026-09-10
---
# The documentation workflow pins its four direct actions

## Result

The documentation workflow now pins checkout v7.0.1, setup-node v7.0.0, upload-pages-artifact v5.0.0, and deploy-pages v5.0.1 to their reviewed 40-character commits. Each complete action line carries its release comment. Workflow shape, commands, Node 22 selection, and permissions remain exact.

Checkout, setup-node, and deploy-pages declare Node 24. Upload-pages-artifact is a composite action. Its pinned commit freezes upload-artifact v7.0.0 at `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`. This result governs the four direct actions. Manual ticket 0079 will govern the complete workflow-file inventory, every direct action or reusable-workflow ref, and every permission declaration. Draft 0229 remains active until 0079 completes.

## Complexity and review

The design scored 7 and level 4. The deploy job can request an identity token and write a Pages deployment. A wrong pin can retain moving privileged code or stop publication. Sol Medium implemented the ticket. Separate Sol Medium agents reviewed the design and code.

Design review split the privileged action pins from the local repository-wide policy. It also narrowed the direct-action claim, required complete-line comment proof, added both baseline warning annotations, and required paginated annotation inspection. Code review accepted the two-file implementation without findings.

## Checks

The focused red proof rejected all four prior mutable refs. The implementer, code reviewer, and primary agent ran `node --test scripts/docs-workflow.test.mjs` under Node 22.22.3. All four tests passed. Hostile cases reject the old refs, another full SHA, a missing release comment, a changed release comment, weakened permissions, and changed workflow work.

The implementer, code reviewer, and primary agent built all 24 documentation pages and ran root `make check`. The primary complete check passed 46 project tests, 212 runtime test files with 1,466 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.05%. The production source ratchet remains 15,995 of 15,995 nonblank lines.

The first completion-state rerun passed lint and all 46 project tests, then the operating system killed coverage with exit 137. The immediate check found no remaining test process, 18 GiB of available memory, full swap, and no kernel journal entry. That evidence does not prove the cause. A clean retry passed the complete gate. The earlier independent and hosted passes also succeeded. One unproved transient does not justify a new product ticket; this record preserves it if it repeats.

Hosted runtime run `34443726749` passed on exact implementation commit `2190eda73111421ff47bb0b36fa4a291fb2a712f`. Hosted docs run `34443726761` passed build and upload and produced one non-expired `github-pages` artifact. Every annotation page for build check `102763896359` and deploy check `102763982307` contained no deprecated or forced Node 20 action-runtime warning. Deploy found the artifact and failed while creating the deployment with status 404 and `Ensure GitHub Pages has been enabled`. The existing issue now records that observation and remains open.

## Source

This manual ticket started from published commit `06655dbb5ec57b68607c9252a8554315e5fe8bc0`. Commits `444b0ed0` through `ef4c3487` record the drafted, corrected, and accepted design. Commit `2190eda7` implements it. Draft 0229 remains next through manual ticket 0079.
