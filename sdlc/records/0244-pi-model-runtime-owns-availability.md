---
base: dda72d29075ab4ad3b98074a401781b738daecdf
head: a12249cc6a34fe4201cb3b093ea85e90704a3026
---

# Let Pi own provider and model availability

Run, resume, and model listing now share one memoized Pi ModelRuntime. Bot no longer copies Pi's provider and model catalog. Local Pi providers, models, custom headers, environment references, file-backed authentication, and command-backed values flow through Pi's public API.

Bot validates the local agent directory and resolved model file before constructing the runtime. Owner-controlled model-file symlinks remain supported. Foreign-owned, world-writable, corrupt, unreadable, or invalid configuration fails before provider contact. Startup remains offline. An explicit `--live` listing may refresh provider catalogs unless `PI_OFFLINE` forbids it.

Independent review found that the first live-refresh path ignored Pi's typed settlement. A failed or aborted refresh could print retained local rows and exit successfully. The repaired path exits 2, prints no stale rows, and emits one bounded provider-name diagnostic. The review also required direct proofs for file-backed authentication, foreign resolved-file ownership, exact unknown-model refusal, and actual resume execution through the shared runtime.

The first foreign-owner proof depended on `/etc/hosts` belonging to another user. That assumption fails under root. The final proof uses temporary paths and injected filesystem metadata. It passes under simulated effective user IDs 0 and 1000 without changing production trust checks.

Bot keeps retry ownership at the selected-model stream boundary. Pi's runtime owns provider construction. Provider attribution remains correct. Stage environments remove every built-in Pi credential name known through the public package. Custom providers can invent environment names that Bot cannot discover. The documentation states that limit and treats command-backed local configuration as trusted operator input.

The final local check passed 104 repository checks, 143 conformance checks, and 1,610 runtime tests across 223 files. Coverage reached 92.26 percent of statements, 86.07 percent of branches, 94.31 percent of functions, and 97.20 percent of lines. GitHub Actions documentation run `34627594606` and runtime run `34627594625` passed on the published implementation commit.

One local full run exceeded four unrelated timing guards while another workspace test deliberately occupied all 24 CPU cores. The exact three owner files passed all 50 tests under coverage after that stress process ended. A later complete run passed under normal load. No Bot timing change was made from the saturated run.
