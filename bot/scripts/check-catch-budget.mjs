#!/usr/bin/env node
// The catch budget (ticket 0106): eslint can turn NO_CATCH off for a file but
// cannot count, so a boundary allowlisted so its one clause could exist was free
// to grow a second — the doctrine sentence "record-lines.ts holds exactly ONE
// CatchClause" was enforced by review and by nothing else. This is the nothing
// else. Same shape as ratchet.mjs: a real count of real source against a
// declared ceiling that a person had to write down.
//
// Two things are checked, and both directions of each:
//   1. Exempt set == declared set. A file allowlisted off NO_CATCH with no
//      CATCH_BUDGET entry is an exemption nobody sized; an entry for a file that
//      is not allowlisted is a budget guarding nothing.
//   2. Clauses found == sentences declared, EXACTLY. Over means the allowlist
//      became a net; under means a stale justification, and at zero a dead
//      allowlist entry — an exemption with nothing left to exempt.
//
// Counting is done by NO_CATCH itself, imported, not by a second idea of what a
// catch is (CHECKLIST 9). The budget lives in eslint.config.js, beside the ban
// it exempts, as one sentence per allowed clause: there is no number here to
// edit and none there either.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { CATCH_BUDGET, NO_CATCH } from "../eslint.config.js";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
// A justification is a sentence a reviewer reads, not a placeholder that lets a
// budget be raised by typing a character inside quotes.
const SENTENCE = 20;

const linter = new Linter();
const eslint = new ESLint({ cwd: ROOT });

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

/** The CatchClauses in a file, counted by the doctrine selector itself. */
function clauses(file) {
  return linter.verify(readFileSync(file, "utf8"), [{
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    rules: { "no-restricted-syntax": ["error", ...NO_CATCH] },
  }], file).length;
}

/** Whether the resolved config still bans catching in a file — the real config,
 *  as eslint computes it, so an allowlist added anywhere is seen. */
async function exempt(file) {
  const config = await eslint.calculateConfigForFile(file);
  const options = config.rules?.["no-restricted-syntax"] ?? [];
  return !options.some((option) => option?.selector === NO_CATCH[0].selector);
}

const sources = walk(SRC).sort();
const declared = Object.keys(CATCH_BUDGET);
const failures = [];

const allowlisted = [];
for (const file of sources) {
  if (await exempt(file)) allowlisted.push(relative(ROOT, file));
}

for (const file of allowlisted) {
  if (!declared.includes(file)) {
    failures.push(`${file} is allowlisted off NO_CATCH but declares no catch budget: add its entry to CATCH_BUDGET in eslint.config.js, one sentence per clause it needs. An exemption nobody sized is a net.`);
  }
}

for (const file of declared) {
  if (!sources.includes(join(ROOT, file))) {
    failures.push(`CATCH_BUDGET declares ${file}, which does not exist in src/. Delete the entry.`);
    continue;
  }
  if (!allowlisted.includes(file)) {
    failures.push(`CATCH_BUDGET declares ${file}, but the resolved eslint config still bans catching there, so the budget guards nothing. Delete the entry, or restore the allowlist block that names it.`);
    continue;
  }
  const budget = CATCH_BUDGET[file];
  const thin = budget.filter((why) => typeof why !== "string" || why.trim().length < SENTENCE);
  if (thin.length > 0) {
    failures.push(`CATCH_BUDGET entry for ${file} has ${String(thin.length)} justification(s) shorter than ${String(SENTENCE)} characters. Each one says what throws and what the clause turns it into; a placeholder is how a budget gets raised without anyone reading it.`);
  }
  const found = clauses(join(ROOT, file));
  if (found === budget.length) {
    console.log(`catch-budget: ${file} holds ${String(found)} CatchClause(s), the ${String(budget.length)} declared.`);
    continue;
  }
  const over = found > budget.length;
  failures.push(
    `${file} holds ${String(found)} CatchClause(s); eslint.config.js declares ${String(budget.length)}. `
    + (over
      ? "The NO_CATCH allowlist is an exemption of a declared size, not a net: delete the clause, or add to CATCH_BUDGET the sentence saying what new throw earned it."
      : "A justification in CATCH_BUDGET no longer has a clause: delete the stale sentence — and if the count has reached zero, delete the allowlist entry too, because an exemption with nothing to exempt is a dead one.")
    + "\n  declared:\n"
    + budget.map((why) => `    - ${why}`).join("\n"),
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`catch-budget: ${failure}`);
  console.error(`catch-budget: ${String(failures.length)} boundary problem(s)`);
  process.exit(1);
}
console.log(`catch-budget: ${String(declared.length)} allowlisted boundaries, every clause declared.`);
