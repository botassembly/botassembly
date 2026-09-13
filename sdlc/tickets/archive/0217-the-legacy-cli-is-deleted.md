---
flow: build
priority: 2
deps: [0261, 0262]
---
# The legacy CLI is deleted

ADR 0026 rules one CLI. Today `bot --help` lists old verbs beside noun commands. The retirement ledger's 302-line floor and 68-test-file inventory are stale historical evidence. The 2026-09-11 final design audit found 78 test files and 289 old-root `main` invocations. Many prove shared runtime behavior and must migrate rather than disappear.

Trigger, settled by Ian on 2026-09-06 and clarified by the 2026-09-11 ticket split: ticket 0247 migrated every caller with an equivalent replacement. Tickets 0261 and 0262 added current complete-record and session readings. The legacy command disposition decision retires every other flat-only operation. The final external audit found that the current dispatcher uses only `capabilities --json`, `home show --json`, and `run start --json`. Archived sources are history. They do not justify replacement commands. The public-alpha repair decision retired the disabled old read-only dashboard checkout for Bot compatibility. There is no release deadline.

## Exact retirement inventory

Retire flat `bot run TARGET`, `resume`, `check`, `runs`, every `show` mode, `output`, `draft`, `rejected`, `request`, `capture`, `logs`, `session`, `explain`, `find`, `status`, `busy`, `prune`, `config`, `models`, bare `assembly`, and bare `auth`. Preserve all 25 current descriptors and routes in `cli-contract.ts` and `new-command-dispatch.ts`.

Delete old routing, handlers, and imports from `cli.ts`. Preserve `runMutation`, `runStart`, `runResume`, and the shared human result writer because current human start and resume use them. Remove only legacy parsers from `flags.ts`. Preserve `takeHome`, `withoutFlag`, `runOnlyOptions`, and every helper with a current owner. Remove legacy help screens, rows, and the mixed overview. Generate a current-only root overview. Exact command help remains supported. Bare noun-group help for `run`, `assembly`, and `auth` takes the ordinary typed unknown-action path because no current group-help contract exists.

Keep every shared reader used by current commands. `run events` keeps `showRecord`, `childReference`, and child agreement. `run session` keeps `inspectSession` and session pagination. Current output, record, request, check, checklist, show, list, home, assembly, authentication, and model commands keep their readers. Preserve the four importable reader exports in `bot/package.json` and keep their tests green. Dead-code proof may remove legacy-only files such as `auth.ts`, `catalog.ts`, `config.ts`, `find-index.ts`, `prune-inspection.ts`, and `prune-measurement.ts` only when no current owner remains.

Done, observably:

- `bot --help` lists only noun commands and `capabilities`.
- Every retired flat root, flat `run TARGET`, bare `assembly`, bare `auth`, and their old help paths take the same generic typed unknown path as an analogous unknown request: exit 2, empty standard output, one bounded `request-invalid` diagnostic, and no home, provider, credential, or runtime access. Bare `run --help`, `assembly --help`, and `auth --help` are unknown actions. Exact current command help remains available.
- The production ratchet falls by at least the ledger's floor. Move shared behavior proofs to supported commands before removing old routing. Delete only tests that solely prove the retired interface. Preserve runtime, record, and artifact guarantees.
- The specification, help, docs, and conformance corpus carry no old spelling outside append-only history. The completion record preserves the final replacement and retirement table. The temporary ledger and the matrix's dispatch section are deleted with the code they describe.

## Test and publication migration

Inventory every old-root invocation in the 78 current test files before deletion. Move runtime assertions to the equivalent current command or the owning reader. Current commands have different error contracts, so migrate the asserted meaning instead of replacing words blindly. Delete only assertions that solely prove the bridge. Preserve the current halves of parity tests.

Replace the temporary caller check with one permanent maintained-source and test guard for every statically literal retired form. Exclude only append-only history and explicit negative unknown-command fixtures. The guard covers command-position shell text, direct and assigned JavaScript argument arrays, tests, active documentation, and lookalike assembly targets. Argument arrays assembled through variable flow, mutation, spread, or computation are outside this lexical check. Runtime unknown-command tests remain their behavior backstop. The guard remains after the ledger is deleted.

Remove active legacy sections from the README, help, specification, generated documentation, conformance text, and invariants. Preserve `specification/CHANGELOG.md`, completed records, archived tickets, and archived planning. Remove the ledger and the command-matrix dispatch section. Remove their special public-tree exclusions and update the public-tree tests. The completion record preserves the final replacement and retirement table plus the exact external audit commits.

## Size boundary

Build no noun command in this ticket. Production starts at 19,991 nonblank TypeScript lines. Re-measure the still-deletable floor before editing and record the exact regions. The final production total must fall by at least that measured floor. Lower `sdlc/ratchet.json` to the measured result. The historical 302-line floor does not satisfy this measurement.

The pre-edit measurement at `169b08e47f6348da3c9eae07d03aad0ff00bfae7` found a conservative 778-nonblank-line deletion floor. The exact old-only regions were `bot/src/cli.ts` lines 146–167, 184–188, 249–446, and 448–451 at 205 lines; `bot/src/flags.ts` lines 8–11, 17–105, and 128–338 at 270 lines; and `bot/src/help.ts` lines 75–94, 99–118, 278–292, and 321–654 at 303 lines. Imports, screen-map entries, dead modules, and old-only renderers outside those regions do not count toward the floor. The accepted cost is a deliberately conservative boundary that may leave more deletion for dead-code proof.

The implementation ends at 18,086 nonblank production TypeScript lines, down 1,905 from 19,991 and 1,127 beyond the conservative floor. The source diff adds 31 lines and deletes 2,197 lines. Dead-code proof also removed six bridge-only modules, the flat resume handler, and unused old-command helpers and exports. Keeping old routing behind a compatibility switch was rejected because ADR 0026 rules one surface and the permanent guard must make reintroduction fail. The accepted cost is the immediate break for callers that ignored the completed migration and retirement decisions.

The deleted-test audit groups every removed file by its surviving proof. Current authentication contract tests replace `auth-interaction`, `cli-auth`, and `cli-models`. Current run reader tests replace the old `cli-runs`, child show, inspection, output, request, raw-record, status-rendering, and show suites. Runtime capture and scratch tests keep execution and home-isolation guarantees. The removed prune, config, find, logs, explain, and old-help tests proved only retired operations. Direct semantic assembly checks replace old check routing. The audit restored `model-runtime.test.ts` when its trust-boundary tests had no other owner, and it kept `run-events.test.ts` as the owner of child authorization and agreement.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 2
- Proof score: 2
- Cost of error score: 2
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: Final deletion has a closed replacement and retirement inventory after caller migration. Broad proof still protects shared runtime behavior from accidental deletion.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted 2026-09-11 at `91281333729d3b9a13ef23cbc634cdb9ebc997dd`. The first review found missing complete-record and session replacements. The second review released the dependency hold but found a stale deletion inventory, missing shared-reader and module-API boundaries, no complete test-migration plan, a temporary guard, undefined unknown-command and noun-help behavior, incomplete history rules, and a stale size floor. The accepted revision closes those findings and preserves all 25 current descriptors.
- Code review: rejected 2026-09-12 at `ef5f33e`. The implementation left retired instructions in active specification and smoke documents, under-scanned shell and JavaScript command construction, cited deleted witnesses, lost direct two-home scratch-path proof, retained dead S6 parsing and ledger exceptions, and did not exercise two current adapters in the shared-refusal test.
- Remediation review: rejected 2026-09-12 at `d86e9c1`. The permanent guard missed indented and grouped shell commands, negation and `command`, template-string and optional-call arrays, and assigned arrays whose variable had an arbitrary name. It also retained an unused S6 oldest/newest reader and test.
- Final remediation review: rejected 2026-09-12 at `aa800f8`. The shell guard still depended on an incomplete list of command positions and missed quoted command words, leading environment assignments, braces, `case`, `elif`, and `exec`.
- Final code review: rejected 2026-09-12 at `1670b4d`. The conservative token pair treated `my-bot runs` and `other.bot runs` as Bot commands.
- Final code review after boundary repair: accepted 2026-09-12 at `a0a44dfe8fccf8154323331e4add889dc9cb1ea5`. The shell token's left edge excludes hyphenated and dotted larger words while preserving every retired command form. Hostile fixtures pin both false positives. The reviewer ran the complete local gate and 25 direct lexical probes before acceptance.
