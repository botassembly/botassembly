// @ts-check
import tseslint from "typescript-eslint";

// Doctrine rules (ticket 0006): each group below is one review-culture rule
// made mechanical. Allowlists are the per-file config blocks at the bottom of
// this file — visible in diff — never inline eslint-disable (linterOptions
// noInlineConfig bans inline config throughout src/). Negative tests proving
// every rule fires live in scripts/check-lint-rules.mjs (run by `npm run lint`).

const NO_PI_PATHS = [
  {
    selector: "Literal[value=/~\\/\\.pi/]",
    message: "Never hardcode ~/.pi paths in the runtime.",
  },
  {
    selector: "TemplateElement[value.raw=/~\\/\\.pi/]",
    message: "Never hardcode ~/.pi paths in the runtime.",
  },
];

const NO_HOST_TEMP_PATHS = [
  {
    selector: "Literal[value=/^\\/tmp(?:\\/|$)/]",
    message: "No host temporary-directory paths in tests/: use tmpdir().",
  },
  {
    selector: "TemplateElement[value.raw=/^\\/tmp(?:\\/|$)/]",
    message: "No host temporary-directory paths in tests/: use tmpdir().",
  },
];

const NO_PLANNING_PROSE = [
  {
    selector: "Literal[value=/sdlc\\/planning(?:\\/|$)|sdlc\\/README\\.md(?:[/?#]|$)/]",
    message: "Tests must not pin planning prose or the SDLC README.",
  },
  {
    selector: "TemplateElement[value.raw=/sdlc\\/planning(?:\\/|$)|sdlc\\/README\\.md(?:[/?#]|$)/]",
    message: "Tests must not pin planning prose or the SDLC README.",
  },
];

const NO_AMBIENT_CLOCK = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "No ambient clock in src/: the clock is injected (ADR 0014). Take a timestamp or DriverClock as an argument.",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "No ambient clock in src/: argless `new Date()` reads the wall clock. The clock is injected (ADR 0014).",
  },
  {
    selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']",
    message: "No ambient clock in src/: performance.now() is ambient time. The clock is injected (ADR 0014).",
  },
];

// The ban is on catching, not cleanup: try/finally is legal everywhere.
export const NO_CATCH = [
  {
    selector: "CatchClause",
    message: "No catching in src/: refuse or crash honestly — outcome types and .then(onFulfilled, onRejected). A genuine throw-based platform boundary earns a per-file allowlist in eslint.config.js.",
  },
];

// The exemptions to NO_CATCH, and the exact size of each one (ticket 0106).
// An allowlist is not a quota: eslint turns a rule OFF for a file, and
// `no-restricted-syntax` matches per node with nothing that counts — so a
// boundary allowlisted precisely so its ONE clause could exist was free to grow
// a second, and the driver appended one and nothing complained. The size lives
// here and scripts/check-catch-budget.mjs enforces it against the real src/,
// counting with the NO_CATCH selector directly above so that "a catch" is
// defined once for the ban and its budget alike (CHECKLIST 9).
//
// THERE IS NO NUMBER TO EDIT. A file's budget is the LENGTH of its list, and
// each entry is one CatchClause's sentence: what throws, and what the clause
// turns that throw into. Raising a budget is therefore not a one-word edit —
// it is writing down which new throw earned a clause, in the diff, beside the
// ones that had to earn theirs. The count is EXACT, not a maximum: deleting a
// clause without deleting its sentence reds too, because a boundary that
// quietly shrank to zero would otherwise keep an exemption with nothing left to
// exempt, and a dead allowlist entry is a defect of its own. And these keys ARE
// the allowlist below, checked both ways, so no file can be exempted from
// NO_CATCH without declaring here what it is exempted for.
/** @type {Record<string, string[]>} */
export const CATCH_BUDGET = {
  "src/auth-import-command.ts": [
    "lstat throws when a named credential path cannot be inspected; named converts absence-shaped errors to an absent result and preserves every other error.",
    "proper-lockfile throws while acquiring Pi's destination identity; destinationLock retries only ELOCKED within the fixed deadline and converts every terminal lock failure to import-busy.",
    "proper-lockfile lockSync throws while acquiring the retired source identity; sourceLock retries only ELOCKED within its fixed attempt budget and converts terminal failure to import-busy.",
    "Opening or inspecting an accepted source or destination file can throw after a path race; openHeld converts the platform detail to the corresponding bounded read failure.",
    "Opening or inspecting an accepted parent directory can throw after a path race; directoryHeld converts the platform detail to the corresponding bounded read failure.",
    "Descriptor reads and follow-up stats can throw after accepted metadata; readHeld converts the platform detail to the corresponding bounded read failure.",
    "Final named-leaf inspection can throw after accepted metadata; unchanged converts the platform detail to the path-specific changed failure.",
    "Final named-parent inspection can throw after accepted metadata; unchangedDirectory converts the platform detail to the path-specific changed failure.",
    "A required pre-commit descriptor close can throw; closeOr converts it to the corresponding bounded source or destination read failure.",
    "Temporary cleanup inspection can throw after a failed publication; cleanup converts it to import-cleanup-failed without adopting another inode.",
    "Temporary unlink can throw after identity agreement; cleanup converts it to import-cleanup-failed and leaves the owner-only file for manual removal.",
    "Initial source inspection can throw for an uncheckable trust boundary; execute converts it to source-invalid without reading credential content.",
    "Initial destination inspection or directory creation can throw for an uncheckable trust boundary; execute converts it to destination-invalid without reading credential content.",
    "Exclusive temporary creation, writing, syncing, inspection, or closing can throw before commit; execute converts it to import-write-failed and enters identity-safe cleanup.",
    "Atomic rename can throw before the commit point; execute converts it to import-write-failed while the original destination remains unchanged.",
    "Destination-directory sync can throw after rename; execute deliberately retains the already committed success result.",
    "The main mutation body can throw a classified pre-commit failure; execute runs identity-safe temporary cleanup before preserving that classification.",
    "A temporary descriptor close can throw during failed-publication cleanup; execute still attempts identity-safe pathname cleanup and preserves the settled classification rules.",
    "Identity-safe cleanup can throw while superseding an earlier publication failure; execute preserves its exact cleanup classification.",
    "Source or directory descriptor close can throw during final settlement; execute records the first pre-commit close classification and closes every remaining descriptor.",
    "The retired-source lock release can throw after work settles; execute retains the truthful mutation or refusal result.",
    "Pi's destination lock release can throw after work settles; execute retains the truthful mutation or refusal result.",
    "The complete migration boundary can throw a classified failure or an unexpected platform failure; authImportCommand emits one bounded secret-free command result.",
  ],
  "src/process.ts": [
    "process.kill(-pid, signal) throws ESRCH when the group is already gone, which is not a failure to terminate it; any other code rethrows (killGroup).",
    "process.kill(-pid, 0) throws ESRCH for a group that no longer exists, which is the answer and not an error; any other code rethrows (groupExists).",
    "process.kill(-pid, SIGKILL) may throw after the grace timer fires; the sweep rejects its settlement barrier and retains the process evidence (sweep).",
    "process.kill(-pid, 0) may throw a non-ESRCH inspection fault; settlement turns it into a rejected promise so the process event callback returns an honest result instead of hanging (settle).",
  ],
  "src/schema-check.ts": [
    "A fatal UTF-8 decode and JSON.parse become an { error } outcome: over a stage's finished output that is instead of a crash mid-run, over the validated schema re-read beside it checkJson turns the outcome into a named throw, and over a credential file credentials.ts turns it into the store's own sentence rather than repeating Node's (jsonValue — the runtime's one JSON parse, which is why the clause is here and not once per caller).",
  ],
  "src/documents.ts": [
    "yaml's document.toJS() throws on frontmatter that will not materialize, and such a block is no mapping (yamlMapping).",
    "lstatSync/readFileSync throw on an authored path that is missing or unreadable — a fifo throws nothing, it fails isFile() — and an authored document that will not read is none (readText).",
    "readdirSync throws on a directory that will not list, and an unreadable directory lists as empty (entries).",
    "readFileSync/lstatSync throw on a candidate program, and an unreadable file cannot be run (validateRunnable).",
    "A fatal UTF-8 decode and JSON.parse throw on an authored JSON schema, and a schema that will not parse is a schema-invalid refusal (validateJsonSchema).",
    "ajv compile() throws on a schema whose $ref does not resolve — valid 2020-12, still unusable — and that is a schema-invalid refusal caught before a run pays for output (validateJsonSchema).",
    "lstatSync throws on a path that cannot be reached, and the reader refuses on absence rather than on a crash (lstatExists).",
  ],
  "src/record-lines.ts": [
    "Buffer#toString and JSON.parse over held record.jsonl bytes become the mark a listing carries, except a torn last line, which costs one event rather than the file (heldRecord).",
  ],
};

// `as const` claims nothing new and `as unknown` only widens; every other
// assertion is a claim without a check. The double cast `x as unknown as T`
// still fires on its outer half.
const NO_CAST = [
  {
    selector: "TSAsExpression:not([typeAnnotation.type='TSUnknownKeyword']):not([typeAnnotation.typeName.name='const'])",
    message: "No type assertions in src/ outside designated boundaries: a cast is a claim without a check. Narrow with a check, or widen with `as unknown` / `as const`.",
  },
  {
    selector: "TSTypeAssertion",
    message: "No angle-bracket type assertions in src/: a cast is a claim without a check.",
  },
];

const NO_STRINGIFY = [
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
    message: "One serialization point for the record: JSON.stringify lives in record.ts (the record) and check.ts (check output, which is not the record).",
  },
];

const NO_AMBIENT_ENV = {
  "no-restricted-properties": [
    "error",
    {
      object: "process",
      property: "env",
      message: "No ambient environment in src/: the environment is spec-meaningful and always injected. Only cli.ts (the process boundary) reads it.",
    },
  ],
};

/** Compose the no-restricted-syntax entry from doctrine rule groups. */
const restrictedSyntax = (...groups) => ({
  "no-restricted-syntax": ["error", ...groups.flat()],
});

export default tseslint.config(
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { requireDefaultForNonUnion: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-useless-catch": "error",
      "complexity": ["error", 10],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@earendil-works/*/dist", "@earendil-works/*/dist/*"],
              message:
                "Pi's private dist/ surface is banned (ADR 0003); import through the exports map.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    linterOptions: { noInlineConfig: true },
    rules: {
      ...restrictedSyntax(NO_PI_PATHS, NO_AMBIENT_CLOCK, NO_CATCH, NO_CAST, NO_STRINGIFY),
      ...NO_AMBIENT_ENV,
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: restrictedSyntax(NO_HOST_TEMP_PATHS, NO_PLANNING_PROSE),
  },
  {
    files: ["tests/probe.test.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false } },
  },
  // Allowlists: each block names a designated boundary and drops exactly one
  // doctrine group for it. Everything else still applies.
  {
    // Pi seam (ticket 0006 rule 4): pi-tap.ts narrows untyped harness payloads.
    files: ["src/pi-tap.ts"],
    rules: restrictedSyntax(NO_PI_PATHS, NO_AMBIENT_CLOCK, NO_CATCH, NO_STRINGIFY),
  },
  {
    // Throw-based platform boundaries (rule 3): process.ts catches ESRCH from
    // process.kill; schema-check.ts converts JSON.parse throws on stage output
    // to outcomes; documents.ts converts JSON.parse/lstatSync throws on
    // authored files to refusals; record-lines.ts converts the parse of held
    // record bytes into the marks a listing carries, except the torn last line
    // record.md tolerates, which costs one event (ticket 0083, ruled by Ian
    // 2026-08-04; narrowed by 0108 after run-files.ts took the filesystem
    // boundary). One boundary, one clause: record-lines.ts holds exactly ONE
    // CatchClause and a second would make this allowlist a net.
    //
    // The files are CATCH_BUDGET's keys, and each key's list is one sentence per
    // clause that file may hold: the exemption and its exact size are the same
    // declaration, so neither can be granted without the other. Since ticket
    // 0106 that "exactly ONE" above is mechanical, not a matter of review.
    files: Object.keys(CATCH_BUDGET),
    rules: restrictedSyntax(NO_PI_PATHS, NO_AMBIENT_CLOCK, NO_CAST, NO_STRINGIFY),
  },
  {
    // Serialization points (rule 5): record.ts is the record's one writer;
    // check.ts serializes check-output lines, which are not the record.
    files: ["src/record.ts", "src/check.ts"],
    rules: restrictedSyntax(NO_PI_PATHS, NO_AMBIENT_CLOCK, NO_CATCH, NO_CAST),
  },
  {
    // CLI composition root/process boundary: cli.ts legitimately reads argv,
    // stdio, cwd, and BOT_HOME/XDG_DATA_HOME from process.env, and constructs
    // the one injected wall/monotonic clock handed to the runtime.
    files: ["src/cli.ts"],
    rules: {
      ...restrictedSyntax(NO_PI_PATHS, NO_CATCH, NO_CAST, NO_STRINGIFY),
      "no-restricted-properties": "off",
    },
  },
);
