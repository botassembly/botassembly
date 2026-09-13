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
  // Managing the home. These are `bot assembly`'s own — faults of the home or
  // of the machine, not of an assembly a runtime read, so no conformance case
  // can hold one (invariant 50); tests/conformance.test.ts requires each to be
  // pinned by a byte-exact test instead.
  "assembly-in-use",
  "source-unknown",
  "tool-missing",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

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
}
