---
flow: build
priority: 10
completed: 2026-09-06
---
# One Bot home keeps one installation identity

## Goal

One explicitly selected Bot home has one stable installation identity. Bot creates that identity only through an explicit initialization command. Every later reading and run reports the stored identity rather than deriving a replacement.

## Evidence

At `d8169e23`, a Bot home has no installation record. `run_start` identifies the runtime version and checkout but does not identify the Bot installation that owns the run. `bot capabilities` advertises no home initialization or identity reading. A caller therefore cannot distinguish two Bot installations that run the same checkout or prove that a later run came from the same installation.

## Success

`bot home init --home DIR [-j|--json]` creates one private versioned `installation.json` in the explicitly named home. The command requires `--home`. It ignores `BOT_HOME` and the platform default. Repeating initialization returns the stored identity without changing the file. Concurrent initializers converge on the one identity stored in the home. Each successful caller returns that same identity.

`bot home show --home DIR [-j|--json]` is read-only and also requires `--home`. An absent home or absent installation record returns success with `initialized: false` when the requested result fits, and it creates nothing. A valid initialized home returns `initialized: true` and the exact stored identity only when every initialized result mode fits.

Both commands produce bounded Markdown by default. `--json` and `-j` produce the same newline-terminated version-1 result envelope. Capability discovery remains home-free and network-free. It advertises both implemented commands, their explicit-home requirement, their mutation behavior, their output contracts, and their enforced bounds.

The resolved lexical absolute home string reported in `data.home` must permit every initialized `home init` and `home show` result in both Markdown and JSON within the 4,096-byte limit. Bot computes the exact serialized UTF-8 sizes before initialization creates a home, synchronizes a directory, creates a candidate, or publishes a record. The calculation uses the exact reported string, the complete fixed-shape identity, JSON escaping, Markdown escaping and clipping, operation-specific kinds, and the terminating newline. The command passes that same string to the pure feasibility callback and final renderer. Storage separately canonicalizes paths for safe operations. A reported string that cannot support every result fails with `result-oversized` and leaves the filesystem unchanged. The same feasibility rule applies when Bot reads an existing identity. One accepted initialized result therefore guarantees that both commands can report that identity in either mode. Moving or copying a home preserves its accepted identity only while its reported destination string also passes this bound. Canonicalizing `data.home` would change the public result, so this ticket retains the resolved lexical value.

The installation record is valid only when its directory, file type, permissions, version, shape, and identity satisfy the published storage contract. A malformed, linked, non-private, unsupported, unreadable, or unstable state fails without replacement, permission repair, or partial interpretation. Before initialization publishes into any valid home that lacks the record, it safely synchronizes the held parent directory and awaits success. This rule applies when the invocation created the home or found it already present. A failed attempt publishes no record, and a retry repeats the synchronization prerequisite. Initialization then publishes complete bytes atomically. It leaves no visible partial destination. Failure cannot silently replace an existing identity. A concurrent creator that loses either create-if-absent race validates and returns the secure winner.

Bot resolves the real parent once and uses canonical pathnames for later operations. It compares each final home or record pathname with an `O_NOFOLLOW` descriptor and revalidates the parent and home before and after reads and mutations. An absent show returns absence only after the established containing objects still validate. An `ENOENT` at the first observation of the final home or record may establish absence. An `ENOENT` after Bot observed that same object present reports changed state. Bot runs under the existing local same-Unix-account trust model. It detects races that its checks observe. It does not defend against a same-account actor that replaces an ancestor during a remaining pathname-operation window.

A non-`EEXIST` rejection from the atomic link means that call did not publish its candidate. Successful cleanup, home synchronization, and descriptor closing preserve the retryable dependency failure at exit 4 without a publication warning. A failure in that finalization changes the result to an integrity failure but does not invent a publication warning. A successful link followed by interruption or finalization failure retains the publication-may-have-completed warning and exits 5.

Moving a valid home preserves its installation identity. A copy preserves the identity only when it preserves the stored bytes, ownership, and modes. Bot rejects a copy that weakens those facts. The identity does not depend on the current path, runtime version, runtime checkout, or runtime digest. This ticket adds no uniqueness registry across copied homes.

Every newly started root or subflow run records the home installation identity in `run_start`. `bot run start` and `bot run resume` structured results return the exact identity from the `run_start` object after the initial write succeeds. The runtime does not reread the installation record to construct the result. A missing or invalid installation record refuses a new run before run birth. Historical shape-1 records without the additive field remain readable under the pre-release compatibility policy. The record shape and all finite result envelopes remain version 1.

Focused regressions prove absent and initialized readings, exact result-size admission, exact `ENOENT` classification, canonical-path revalidation, final-object no-follow checks, private atomic storage, strong newly created-home durability, repeated and concurrent initialization from an absent home, exact link-failure classification, interruption outcomes, invalid and insecure states, secure move and copy preservation, capability agreement, root and subflow record facts, start and resume result agreement, and refusal before run creation. Direct tests separately prove invalid UTF-8, a byte-order mark, wrong ownership where the platform supports it, insecure copied-home modes, missing and invalid identity refusal on resume before birth, and one deterministically synchronized real two-process initialization race. A mechanical check rejects procfs and `/dev/fd` path dependencies in the production implementation. It also rejects an identity comment that assigns this work to ticket 0032. Existing home resolution remains unchanged for commands outside this new initialization requirement.

Integration with the upstream run-request help left `help.ts` at 402 nonblank lines against its unchanged 400-line gate. The implementation moves the three-line `namedLimit` formatting helper into the existing 24-line `cli-help-format.ts` owner and imports it back. This smallest coherent split restores `help.ts` to 399 nonblank lines without changing help bytes or weakening the gate. The complete static gate must prove the result.

## Boundaries

Keep this ticket to one stored installation identity, the two home commands, capability metadata, and identity propagation into new run records and structured mutation results. Do not add a reset, rotation, repair, import, export, registry, machine fingerprint, runtime digest, replay key, correlation meaning, or migration rewrite. Do not change run identity, correlation, legacy output bytes, provider behavior, or record shape number.

## Size decision

- Starting production size: 15591 nonblank lines
- Ending production size: 15535 nonblank lines
- Ticket baseline before identity work: 15106 nonblank lines
- Simpler approach tried: use canonical pathnames, final-object `O_NOFOLLOW` checks, and before-and-after revalidation under Bot's existing same-account trust model
- Why insufficient alternatives were rejected: making every new run Linux-only breaks Bot's Unix posture. A native or external `openat` and `linkat` transaction helper adds a build, packaging, protocol, and maintenance boundary to defend against an actor that Bot's trust model already excludes.
- Production code deleted: the implementation must delete the complete 80-nonblank-line held-ancestor module, its generic path-construction and ancestor-race seams, and the production hooks that only support them. It must also move the three-line `namedLimit` helper out of the over-limit `help.ts` file. Exact result-feasibility logic must reuse the real renderers with the same resolved lexical home string instead of adding a second size formula or sizing a canonical substitute.
- Accepted cost: 15591 is the corrected integrated baseline. The implementation must finish at or below 15535 nonblank production lines and lower `sdlc/ratchet.json` to that measured ending value. The ratchet may not remain above 15535. The ending may carry at most 429 lines above the 15106-line pre-identity baseline. Those lines buy one strict durable record, two bounded commands, pre-mutation result feasibility, atomic concurrent initialization, observable pathname revalidation, and root-to-child identity propagation. They do not defend against concurrent ancestor replacement by a same-account actor.

## Result

Bot now gives each explicitly initialized home one private stable installation identity. `bot home init` creates or returns it. `bot home show` reads it. New root and child runs record it, and structured start and resume results return the identity from the written run-start fact.

The implementation uses canonical pathname storage checks under Bot's existing local-account trust model. It rejects linked or insecure final objects, compares pathname and descriptor identity, and revalidates containing objects before and after reads and mutations. Atomic publication makes concurrent initializers converge. A failed link never gains a false publication warning. A successful link retains that warning when later finalization becomes uncertain.

Bot checks every possible initialized result through the real renderers before initialization mutates the filesystem. The preflight and final renderer use the same resolved lexical home string. Canonical paths remain private to storage. Long direct paths and stable symlink paths therefore fail before publication when any result mode would exceed its bound.

## Review and red-green evidence

Independent SOL 5.6 medium Design Review rejected the first Linux-specific descriptor traversal because `/dev/fd` depended on procfs and the product promises a Unix interface. The accepted design deleted that helper and used portable pathname checks within Bot's existing same-account trust boundary.

Independent Code Review found and verified two post-publication result-bound defects. A 4,025-byte direct home path first published an identity and then failed final JSON rendering. The first repair still admitted a 4,025-byte lexical path through stable symlinks because storage measured its shorter canonical path. Both cases became permanent red-green regressions. The final implementation uses the exact reported string for admission and rendering and leaves the filesystem unchanged on rejection.

The permanent suite also proves invalid UTF-8 and byte-order marks, wrong ownership where supported, insecure copied-home and copied-record modes, missing and malformed identity refusal before run birth, deterministic create and link races, a barrier-synchronized real two-process race, secure move and copy behavior, capability agreement, run identity propagation, and the absence of procfs or `/dev/fd` production dependencies.

## Checks

The final implementation commit `841e00c1` passed independent Code Review. The exact implementation candidate passed the complete root check with 18 project tests, 204 Bot test files, 1,382 Bot tests, 143 of 143 conformance cases, lint, catch-budget, strict type, unused-code, cycle, exact-dependency, and diff checks. Production finishes at the enforced 15,535 nonblank-line ceiling. `help.ts` finishes at 399 nonblank lines under its unchanged 400-line limit.
