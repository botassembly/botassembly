---
base: 7895765
head: 53fd7cb
---

# Export mutating command readings

`bot/mutation-readings` now exports nine command-compatible mutations: assembly install, link, update, and remove; authentication import, login, and logout; and run start and resume. The seven assembly and authentication operations share the CLI's in-process command boundary. Start and resume invoke a direct Bot child, so an importer does not share the run's signal ownership or model-runtime lifetime.

Every function returns the command's exit, standard output, and standard error bytes. Command refusals remain returned results. Transport failures reject only after bounded child cleanup. Caller environment and working directory remain local to the call, login answers do not enter returned bytes, and a positional run request sends zero ignored stdin bytes.

## Verification

Design review rejected two rounds. The accepted design added bounded cleanup after wrapper failures, a real pending-mutation red proof, shared outer CLI rejection settlement, permanent no-resignal behavior after TERM `ESRCH`, and the level-4 classification required by destructive assembly and credential changes.

Implementation followed red-green development. Initial tests named the missing export, child owner, and counterpart transitions. Review remediations reproduced post-spawn error cleanup, synchronous stdin failure, the spawn-time abort race, ignored positional stdin, permissive hosted umask, insufficient parity, and unsafe test-process identity assumptions before their repairs.

The final local gate at `53fd7cb` passed 225 runtime test files with 1,892 tests, 143/143 conformance cases, and 160 repository tests. The focused mutation set passed 181 tests; the combined child, mutation, library-contract, and outside-import set passed 82/82. The real child and cooperative descendant proof passed five isolated repetitions, the held-output proof passed three, and final inventories contained zero owned processes. Typecheck, lint, catch budget, diff, specification, Linux platform, and the 19,902-line production ratchet passed.

Code review rejected three rounds. The accepted repair routes every post-spawn error and synchronous stdin failure through one bounded cleanup owner, closes the spawn-time abort race, suppresses all later signals after TERM `ESRCH`, expands exact command and state parity across all nine operations, and uses revalidated unique process identities in real-process proof cleanup. The same reviewer accepted `53fd7cb` after independent focused and repeated real-process verification.

## Honest limitations

Healthy run children have no wrapper deadline. Abort or transport failure sends only direct-child signals and does not contain arbitrary descendants. A cooperative descendant can close after its owner disappears; an escaped or uncooperative descendant remains outside the promise. Transport rejection does not prove that no mutation occurred and gives no safe-retry promise. Forced death can leave the runtime's existing crash evidence.

## Hosted runs

Branch runtime run `35066519130` passed Ubuntu, macOS, WSL, complete check, and coverage at exact commit `53fd7cb`. Main runtime run `35067017896` passed native platforms, complete check, and coverage. Main documentation run `35067018179` passed the site build, native platforms, complete check, and coverage; push-only WSL and disabled deployment skipped as designed.

Coverage on main was 88.29% statements, 81.96% branches, 90.97% functions, and 93.08% lines.

- Origin: `sdlc/tickets/0300-mutating-command-exports.md`, plan item 23, and requirements L1 through L4 in the 2026-09-14 admin surface requirements note.
