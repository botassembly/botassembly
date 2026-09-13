# Security policy

Bot Assembly runs model stages with the operator's authority. It is not a sandbox. Do not place credentials in an assembly or commit them to this repository.

The project gate uses pinned Gitleaks defaults to scan working files and Git patches available from local refs. Hosted checks fetch branches and tags. This catches known credential shapes, including ignored and untracked working files, but it cannot prove that a tree is secret-free. It cannot inspect inaccessible or deleted server objects, and the upstream scanner can silently skip some filesystem open failures. Reported warnings and errors fail the gate. Revoke an exposed credential even after removing it from Git.

Report a private security problem to `imaurer@gmail.com`. Please include the smallest reproduction you can share privately and do not publish the details until the problem has been handled.
