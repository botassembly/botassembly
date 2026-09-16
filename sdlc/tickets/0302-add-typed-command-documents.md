---
flow: build
priority: 1
deps: [0301]
---
# Add typed command documents over the byte readings

## Outcome

An installed TypeScript consumer can call every publicly exported structured command counterpart and receive its exact version-1 success document or error envelope as a typed value. The existing byte readings remain the sole command-execution boundary and remain available unchanged.

## Current facts

Observed at `99fc963`; `bot/src` is 19,908 nonblank lines.

- `CLI_CONTRACTS` holds 27 operations (`bot/src/cli-contract.ts:480`). Twenty-five have public counterparts in `bot/tests/library-contract.test.ts:53-87`; `auth.list` and `model.list` remain in the explicit Pi-runtime allowlist at `:40`.
- Four public operations are raw: `run.output`, `run.record`, `run.request`, and `run.session`. The other 21 declare a versioned structured document.
- The public functions in `bot/src/public-admin-readings.ts`, `public-run-readings.ts`, and `public-mutation-readings.ts` return `CommandResult`: exit code plus exact stdout and stderr buffers. Ticket 0295 recorded the remaining limitation: a consumer still parses JSON itself (`sdlc/records/0295-export-remaining-readings.md:16`). Ticket 0300 kept parsed objects outside the mutation door, and ticket 0301 generated declarations without hand-authoring them.
- Ordinary structured successes write one JSON document to stdout and leave stderr empty. Ordinary structured refusals write the common version-1 `kind: "error"` envelope to stderr with empty stdout (`bot/src/new-command-result.ts:41-47`; `specification/elements/inspection.md:210-236`). `auth.login` is the exception: bounded provider interaction and the retired-store advisory use stderr before the final result, and a post-mutation synchronization failure writes both the credential success document and a final error envelope (`bot/src/auth-login-command.ts:105-145,213-220`; `bot/tests/cli-auth-login-contract.test.ts:147-178,248-269`). A started run may also return `bot.run.result@1` with a nonzero exit, so exit zero and globally empty opposite streams cannot identify every result.
- Most command documents are anonymous object literals beside their renderer. Several row types are private. No exported TypeScript type currently owns the full shapes which the command encodes.
- `docs/src/content/docs/reference/library.md` promises exact byte readings and says parsed-object returns are not promised. The packed-artifact test proves the seven current package paths and generated declarations, but no outside consumer can type a command document without writing its own assertion.

## Public contract

Keep the seven package paths and every existing `*Reading` function unchanged. Add one `*Document` function beside each of the 21 structured counterparts:

- `bot/admin-readings`: `assemblyCheckDocument`, `assemblyListDocument`, `capabilitiesDocument`, `homeBusyDocument`, `homeShowDocument`, and `intelligenceListDocument`.
- `bot/run-readings`: `runCheckDocument`, `runChecklistDocument`, `runEventsDocument`, `runListDocument`, `runSearchDocument`, and `runShowDocument`.
- `bot/mutation-readings`: `assemblyInstallDocument`, `assemblyLinkDocument`, `assemblyRemoveDocument`, `assemblyUpdateDocument`, `authImportDocument`, `authLoginDocument`, `authLogoutDocument`, `runStartDocument`, and `runResumeDocument`.

Each function accepts the same domain arguments as its byte reading but omits presentation choices. It always drives that reading in JSON mode. `homeBusyDocument` omits quiet mode, and `runCheckDocument` omits raw mode. Run start and resume retain their existing child-process, signal, stdin, and transport behavior.

Return `Promise<DocumentReading<D>>`, with this discriminated public shape:

```ts
type DocumentReading<D> =
  | { kind: "document"; exit: number; document: D; command: CommandResult<number> }
  | { kind: "error"; exit: 1 | 2 | 3 | 4 | 5; error: ErrorDocument; command: CommandResult<number> };
```

`command` is the exact result returned by the byte reading. A nonzero exit with a valid run operation document uses the `document` arm. A command refusal uses the `error` arm and never throws. A run-child transport rejection still rejects because ticket 0300 established that no command envelope exists in that case. Invalid JSON, a wrong kind or schema version, or a layout forbidden by that operation's framing policy rejects as a library invariant failure rather than being mislabeled as a command refusal.

The registry assigns every structured operation one of two framing policies:

- **Exclusive JSON:** all operations except `auth.login`. A document is the sole newline-terminated stdout value and requires empty stderr. An error is the sole newline-terminated stderr value and requires empty stdout. The decoder applies the operation's published result bound before parsing a document. It validates an error's sole-line framing, top-level identity, operation, closed code and cause, and 2,048-byte message after parsing.
- **Authentication interaction:** `auth.login` alone. Stdout contains zero or one newline-terminated `bot.auth.login@1` document smaller than `AUTH_LOGIN_CONTRACT.resultBytes`. Stderr may carry an opaque diagnostic prefix followed by no envelope on exit 0 or by exactly one final compact error-envelope line on exits 1 through 5. Split a refusal only at stderr's final newline-terminated line; never search earlier interaction text for JSON. The final line must be a version-1 error for `auth.login` and be smaller than `AUTH_LOGIN_CONTRACT.resultBytes`. The prefix must be smaller than `AUTH_LOGIN_CONTRACT.interactionTotalBytesExclusive + NEW_COMMAND_ERROR_BYTES`, covering the provider's existing strict interaction total plus bounded room for the fixed outer advisory. Total stderr must therefore be smaller than that sum plus `AUTH_LOGIN_CONTRACT.resultBytes`. These are decoder admission bounds and do not widen what the command may print.

On an authentication exit 0, require the stdout document and return the `document` arm while preserving any diagnostic stderr only in `command`. On an authentication refusal, return the final error envelope in the `error` arm and preserve the prefix byte for byte. Stdout must be empty except for `synchronization-failed`, where it must be the valid credential document the command emits after durable storage; that case still returns the `error` arm and retains both streams in `command`. Missing terminal newline, over-bound prefix or envelope, trailing bytes after the envelope, a document on any other authentication refusal, or a synchronization refusal without its document is an invariant failure with a bounded message containing no command bytes.

Export `DocumentReading`, `ErrorDocument`, and the exact success document and nested row types through the same three doors. Give every document a literal `schemaVersion: 1` and literal `kind`. Keep nullable, optional, page, summary, warning, refusal-detail, and event fields honest. The command owner must construct a value checked against that shared type before encoding it. Do not maintain a second document shape only in the public wrapper.

## Scope

1. Add one private structured-result decoder shared by the three public doors. It accepts the registry's expected kind, schema version, bounds, and framing policy; preserves the byte result; and distinguishes the stdout document from the stderr error envelope under that operation's policy.
2. Name the 21 existing success document shapes and the common error document at their owning command or result modules. Use those types in the existing document constructors, then re-export only the public contract types from the three package doors.
3. Add the 21 thin `*Document` functions over their existing `*Reading` functions. Do not call a command handler, mutation boundary, or child process a second time.
4. Extend the operation contract test with one registry derived against `CLI_CONTRACTS`: every structured operation with a public byte counterpart has exactly one typed counterpart and an explicit framing policy; each raw operation has none; `auth.list` and `model.list` remain the only pending counterparts. Only `auth.login` may use authentication-interaction framing.
5. Extend the actual-tarball TypeScript consumer and library reference for the new values and types. Add a changelog entry. Change no specification schema, command output, command side effect, package path, runtime dependency, or version.

Exclude parsing raw artifacts, runtime validation of every nested field, new operations, exporting `auth.list` or `model.list`, a root package export, CommonJS, schema generation, and an in-process run promise. Do not replace `Buffer` results or remove lower-level inspection exports.

## Acceptance

Start red in a focused typed-document test by importing `capabilitiesDocument` and `CapabilitiesDocument` from the built package. The current package must fail because neither export exists. Add a second red mutation import for `runStartDocument`, so the first fix cannot cover only read-only handlers.

Then prove:

1. A mechanical registry covers each of the 21 structured public counterparts exactly once by operation, byte function, typed function, kind, schema version, bounds, and framing policy. Mutated registries fail when one typed entry is removed, duplicated, assigned to a raw operation, given the wrong kind, or loses or misassigns its framing policy. The only operation-level exclusions are the four raw operations and the existing `auth.list` and `model.list` allowlist. Exactly `auth.login` carries authentication-interaction framing.
2. Each typed function invokes its byte reading once in JSON mode and returns the same exit, stdout, and stderr in `command`. Parsing those retained bytes yields exactly the returned `document` or `error`. Exercise all 21 through the existing hermetic command fixtures. Mutations run once; tests do not compare them by repeating a side effect.
3. Cover a structured success at exit zero, a started `run.start` result at nonzero exit, every refusal exit from 1 through 5, and a refusal from each public door. No command refusal rejects. Exclusive-policy cases reject malformed JSON, output on their forbidden stream, wrong kind, wrong schema version, and simultaneous document and error streams. Authentication-policy cases prove a successful login with interaction stderr, an interaction followed by provider refusal, and the dual-stream post-mutation synchronization refusal. Each keeps exact stdout and stderr in `command`; the provider refusal returns only its final compact envelope as `error`; the synchronization refusal returns the error arm and retains its valid stdout document. Also reject an over-bound prefix, an over-bound or nonterminal envelope, JSON-shaped interaction text, a wrong-operation final envelope, a non-synchronization refusal with stdout, and a synchronization refusal without stdout. Every invariant message is bounded and contains no command bytes.
4. The owning constructors type-check their actual encoded objects against the exported exact types. Focused assertions cover representative nested fields from every document kind, including list pages and summaries, nullable paths and timestamps, raw record events as `Record<string, unknown>`, authentication results, assembly outcomes, and run result refusal details.
5. The actual packed artifact exposes all 21 functions and their named types under strict TypeScript 5.9.3 NodeNext and Bundler resolution with `skipLibCheck: false`. The consumer narrows both `DocumentReading` arms without a cast, reads operation-specific nested fields, and carries `@ts-expect-error` checks for a wrong kind, a field from another document, a raw-operation document function, and a private decoder import. Plain Node imports and calls representative admin, run, and mutation document functions from emitted JavaScript.
6. Existing byte-parity, mutation lifecycle, package-content, declaration, private-export, and command-output tests remain unchanged and pass. The library page distinguishes exact byte readings from typed documents and keeps the pre-1.0 compatibility warning.

Run the focused typed-document, library-contract, mutation, and package-consumer tests; `npm -C bot run typecheck`; `npm -C bot run lint`; `git diff --check`; the production-size and public-tree checks; `make check`; `make platformcheck`; and hosted Linux, macOS, and manually dispatched WSL platform legs.

## Dependencies and compatibility

Ticket 0301 supplies emitted JavaScript and generated declarations for the existing doors. No network, provider, credential, registry publication, or paid service is needed. Tests use private scratch homes, local assemblies, and scripted runs.

This is an additive pre-1.0 library surface. Existing byte functions, byte identity, command behavior, schema versions, and package paths remain unchanged. Nested runtime validation is intentionally absent: Bot types documents it constructs, checks their top-level identity while decoding, and treats a mismatch as its own invariant failure. A consumer that needs untrusted-input validation still needs a schema of its own.

## Size decision

- Starting production size: 19908 nonblank lines
- Production ceiling: 20270 nonblank lines.
- Simpler approach tried: export one generic JSON value, accept a caller-supplied type parameter, or hand-write document types only in the wrappers.
- Why insufficient alternatives were rejected: `unknown` is not a typed application surface; a caller-selected generic can lie without evidence; wrapper-only types can drift from the object the command encodes.
- Production code deleted: none planned. The byte functions and their owners remain the execution boundary.
- Accepted cost: one shared policy-aware decoder, 21 thin functions, and exact types checked at each owning constructor. Authentication login needs one explicit framing branch because its existing interactive stderr and synchronization result cannot obey the other 20 operations' exclusive streams.
- Expected production change: at most 362 nonblank lines across the decoder, public doors, and document owners. Set the ratchet to the lower measured result after one duplication pass.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: this adds a public TypeScript contract across 21 established documents and three package doors. The mutation and child lifecycles do not change, but proof must cover exact command bytes, refusals, nonzero run documents, generated declarations, two TypeScript resolvers, the packed artifact, and all operation kinds. A wrong type causes user-visible consumer failures and false narrowing but does not change durable state by itself.
- Selected model: `gpt-5.6-sol` with medium reasoning implements. Independent `gpt-5.6-sol` agents with medium reasoning review the design and code.

Re-score if implementation needs a new schema, changes a command result, validates untrusted nested input, or changes a mutation or child-process boundary.

## Review

- Origin: the typed follow-up recorded by ticket 0295, the current plan and handoff, and requirements L2 through L4 in `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`.
- Design review: rejected at `6a21596`. The first draft incorrectly treated every extra opposite-stream byte and every simultaneous document and error as impossible, but `auth.login` legitimately carries bounded interaction stderr and can publish a credential document before a synchronization error.
- Design response: the operation registry now owns framing policy and bounds. `auth.login` parses only stdout on success and only the final compact stderr line on refusal, preserves every byte, admits the existing synchronization dual-stream result explicitly, and rejects ambiguous or over-bound layouts. Acceptance adds hermetic success-with-stderr, post-interaction refusal, and synchronization cases.
- Code review: pending.
