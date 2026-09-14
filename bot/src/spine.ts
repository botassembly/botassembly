// The closed vocabularies every element shares. Types only — no logic, no I/O.
// Sources: specification/elements/record.md (causes, exit codes),
// specification/elements/refusals.md (refusal codes),
// specification/elements/{flow,stage,loop,choose,parallel,descend}.md (sentinels).

/** The word beside an exit that says why a run or stage ended (invariants 23 and 45). */
export const CAUSES = [
  "success",
  "refused",
  "exhausted",
  "rejected",
  "blocked",
  "timeout",
  "signal",
  "fault",
] as const;

export type Cause = (typeof CAUSES)[number];

/**
 * Every refusal code in specification/elements/refusals.md, in table order
 * (the order of specificity). A value list so the conformance corpus can be
 * cross-checked against it; the `RefusalCode` union derives from it.
 */
export const REFUSAL_CODES = [
  // Sentinels
  "sentinel-missing",
  "sentinel-duplicate",
  "sentinel-unknown",
  "body-missing",
  "tail-container",
  // Frontmatter
  "frontmatter-invalid",
  "key-unknown",
  "key-missing",
  "value-invalid",
  "intelligence-unresolved",
  "model-unresolved",
  "slot-reserved",
  // Files in a stage folder
  "schema-duplicate",
  "schema-invalid",
  "gate-conflict",
  "hook-duplicate",
  "not-runnable",
  "skill-invalid",
  // Containers
  "alternative-mismatch",
  "chooser-invalid",
  "branch-numbered",
  "body-unexpected",
  "container-check",
  "loop-nested",
  // Structure
  "number-duplicate",
  "number-missing",
  "number-invalid",
  "symlink",
  "entry-unknown",
  "folder-empty",
  "input-collision",
  "assembly-incomplete",
  // Resolution
  "assembly-unknown",
  "flow-unknown",
  "path-missing",
  "request-invalid",
  "slot-missing",
  "credential-missing",
  // Managing the home. These are `bot assembly`'s own — faults of the home or
  // of the machine, not of an assembly a runtime read, so no conformance case
  // can hold one (invariant 50); tests/conformance.test.ts requires each to be
  // pinned by a byte-exact test instead.
  "assembly-in-use",
  "source-unknown",
  "tool-missing",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

/**
 * Every `code` a structured command error carries in `error.code`
 * (specification/elements/inspection.md, "The JSON error envelope"). The code
 * says what kind of fault it is and is what a program branches on; the cause
 * below says which one. A closed list so the specification and the runtime can
 * be pinned to each other in both directions (tests/spec-error-vocabulary.test.ts).
 */
export const ERROR_CODES = [
  "request-invalid",
  "cursor-invalid",
  "cursor-conflict",
  "home-not-found",
  "home-invalid",
  "state-not-reached",
  "dependency-failed",
  "integrity-failed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Every `cause` a structured command error carries in `error.cause`. A cause
 * names the one fault inside its code, so a program that branches on the code
 * can report the cause without reading the message.
 */
export const ERROR_CAUSES = [
  "argument-extra",
  "argument-invalid",
  "argument-unknown",
  "arguments-invalid",
  "assembly-invalid",
  "assembly-refused",
  "auth-runtime-invalid",
  "authentication-unavailable",
  "availability-unavailable",
  "bad-record",
  "bad-version",
  "blocked",
  "cancelled",
  "candidate-create-failed",
  "candidate-failed",
  "candidate-finalization-failed",
  "capture-unavailable",
  "cause-unknown",
  "child-disagrees",
  "child-invalid",
  "child-missing",
  "child-unrecorded",
  "close-failed",
  "creation-busy",
  "creation-failed",
  "cursor-invalid",
  "cursor-limit",
  "cursor-malformed",
  "cursor-ordinal",
  "cursor-position",
  "cursor-selection",
  "cursor-snapshot",
  "dependency-failed",
  "descriptor-invalid",
  "destination-changed",
  "destination-invalid",
  "destination-not-empty",
  "destination-read-failed",
  "document-too-large",
  "exhausted",
  "fault",
  "field-empty",
  "field-repeated",
  "field-unknown",
  "filesystem-error",
  "filter-bytes-limit",
  "filter-control",
  "filter-limit",
  "home-changed",
  "home-create-failed",
  "home-insecure",
  "home-invalid",
  "home-missing",
  "home-unavailable",
  "home-unreadable",
  "import-busy",
  "import-cleanup-failed",
  "import-write-failed",
  "installation-failed",
  "installation-invalid",
  "interaction-limit",
  "invalid",
  "limit-invalid",
  "login-failed",
  "logout-failed",
  "mark-invalid",
  "membership-changed",
  "missing",
  "mode-conflict",
  "mode-missing",
  "model-invalid",
  "not-directory",
  "offset-invalid",
  "option-conflict",
  "option-invalid",
  "option-repeated",
  "option-required",
  "option-unknown",
  "output-error",
  "ownership-unavailable",
  "parent-changed",
  "parent-insecure",
  "parent-missing",
  "parent-sync-failed",
  "parent-unreadable",
  "path-missing",
  "path-not-directory",
  "provider-ambient-only",
  "provider-catalog-unavailable",
  "provider-failed",
  "provider-invalid",
  "provider-unconfigured",
  "provider-unknown",
  "publication-failed",
  "publication-missing",
  "record-changed",
  "record-encoding",
  "record-insecure",
  "record-invalid",
  "record-missing",
  "record-shape",
  "record-unavailable",
  "record-unreadable",
  "recording-invalid",
  "refresh-aborted",
  "refresh-failed",
  "refused",
  "rejected",
  "removal-busy",
  "removal-failed",
  "removal-state-invalid",
  "repeat-missing",
  "request-invalid",
  "result-oversized",
  "result-too-large",
  "run-ambiguous",
  "run-missing",
  "run-refused",
  "runs-invalid",
  "runs-unavailable",
  "runtime-identity-unavailable",
  "runtime-invalid",
  "runtime-unavailable",
  "scratch-unavailable",
  "selection-ambiguous",
  "selection-disagrees",
  "selection-empty",
  "selection-missing",
  "selection-unavailable",
  "selector-partial",
  "session-invalid",
  "session-missing",
  "session-too-large",
  "signal",
  "source-changed",
  "source-invalid",
  "source-is-destination",
  "source-missing",
  "source-read-failed",
  "stage-missing",
  "state-unknown",
  "stdout-delivery",
  "success",
  "synchronization-failed",
  "temporary-changed",
  "terminal-required",
  "text-too-large",
  "time-order-invalid",
  "timeout",
  "timestamp-invalid",
  "unexpected",
  "unreadable",
  "update-busy",
  "update-failed",
  "value-empty",
  "value-invalid",
  "value-missing",
  "value-oversized",
] as const;

export type ErrorCause = (typeof ERROR_CAUSES)[number];

/** The seven sentinel file stems a flow folder can hold. */
export type Sentinel =
  | "FLOW"
  | "STAGE"
  | "LOOP"
  | "CHOOSE"
  | "PARALLEL"
  | "FANOUT"
  | "DESCEND";

/**
 * The exit code says whether; the record says why (invariant 23).
 * - `0` — the work succeeded and was sealed.
 * - `1` — work failed or was blocked: refused, exhausted, rejected, blocked,
 *   or timed out.
 * - `2` — the run was impossible: the assembly, the invocation, or the
 *   machinery beneath the run was wrong, whenever that was discovered.
 *
 * (Killed from outside is `128+n`, the shell's convention, not a code the
 * runtime chooses — so it is not a member here.)
 */
export type ExitCode = 0 | 1 | 2;

/**
 * One fault a person must fix before bot can act — in an assembly, in the
 * invocation, in the home, or in the machine beneath the run. The code and the
 * path are what the conformance corpus asserts on, and it never asserts a
 * sentence. This runtime pins its own management sentences byte for byte
 * (tests/conformance.test.ts requires it), which binds these tests and not the
 * specification: reword a management sentence and change its pin with it.
 */
export interface Refusal {
  code: RefusalCode;
  path: string;
  sentence: string;
  facts?: ModelFacts;
}

/**
 * The facts a model refusal carries beside its sentence, so a program reads
 * them without parsing prose (specification/elements/refusals.md, "What a
 * refusal carries"). `cause` is drawn from ERROR_CAUSES above: a refusal names
 * its fault in the same closed vocabulary the error envelope uses. A refusal
 * that is not about a model carries no facts, and the JSON envelope writes
 * `null` for each of the five fields.
 */
export interface ModelFacts {
  model: string | null;
  provider: string | null;
  rung: string | null;
  cause: ErrorCause;
  action: string;
}
