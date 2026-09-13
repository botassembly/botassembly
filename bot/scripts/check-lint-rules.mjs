#!/usr/bin/env node
// Negative tests for the doctrine lint rules (ticket 0006): every rule must be
// seen to FIRE on a violation and stay silent on its allowlisted boundary — a
// lint rule nobody has seen fail is decoration (invariant 50). Each case lints
// a snippet as if it were the named src/ file, with the rule options resolved
// from the real eslint.config.js, so allowlists are exercised for real.
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const CWD = new URL("..", import.meta.url).pathname;
const RULES = new Set(["no-restricted-syntax", "no-restricted-properties"]);

const eslint = new ESLint({ cwd: CWD });
const linter = new Linter();

async function messagesFor(path, code) {
  const config = await eslint.calculateConfigForFile(path);
  const rules = Object.fromEntries(
    Object.entries(config.rules ?? {}).filter(([name]) => RULES.has(name)),
  );
  return linter.verify(code, [{
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    linterOptions: config.linterOptions?.noInlineConfig === true ? { noInlineConfig: true } : {},
    rules,
  }], path);
}

// Each case: a snippet, the path it pretends to live at, and either the
// message pattern the rule must produce (fires) or null (must stay silent).
const cases = [
  // Rule 1 — no ambient clock in src/.
  { rule: "clock", path: "src/probe.ts", code: "export const a = Date.now();", expect: /No ambient clock/ },
  { rule: "clock", path: "src/probe.ts", code: "export const b = new Date();", expect: /No ambient clock/ },
  { rule: "clock", path: "src/probe.ts", code: "export const c = performance.now();", expect: /No ambient clock/ },
  { rule: "clock", path: "src/probe.ts", code: "export const d = new Date(0);", expect: null },
  // cli.ts constructs the one injected clock, so it is allowlisted off this
  // rule — an exemption that had no probe until ticket 0106 looked for one.
  { rule: "clock", path: "src/cli.ts", code: "export const d = new Date();", expect: null },

  // Rule 2 — no ambient environment in src/; only cli.ts (the process
  // boundary) owns it since ticket 0029 removed the invocation/assembly reads.
  { rule: "env", path: "src/probe.ts", code: "export const e = process.env['HOME'];", expect: /No ambient environment/ },
  { rule: "env", path: "src/probe.ts", code: "export const e = process.env.HOME;", expect: /No ambient environment/ },
  { rule: "env", path: "src/invocation.ts", code: "export const f = process.env['BOT_HOME'];", expect: /No ambient environment/ },
  { rule: "env", path: "src/assembly.ts", code: "export const g = process.env['X'];", expect: /No ambient environment/ },
  { rule: "env", path: "src/cli.ts", code: "export const h = process.env['BOT_HOME'];", expect: null },

  // Rule 3 — no catching in src/; try/finally cleanup stays legal; the four
  // platform-boundary files are allowlisted. These prove each allowlist entry is
  // LIVE; how many clauses it then buys is scripts/check-catch-budget.mjs, which
  // eslint cannot express because a selector matches per node and cannot count.
  { rule: "catch", path: "src/probe.ts", code: "const f = () => {}; try { f(); } catch { f(); }", expect: /No catching/ },
  { rule: "catch", path: "src/probe.ts", code: "const f = () => {}; try { f(); } finally { f(); }", expect: null },
  { rule: "catch", path: "src/process.ts", code: "const f = () => {}; try { f(); } catch { f(); }", expect: null },
  { rule: "catch", path: "src/schema-check.ts", code: "const f = () => {}; try { f(); } catch { f(); }", expect: null },
  { rule: "catch", path: "src/documents.ts", code: "const f = () => {}; try { f(); } catch { f(); }", expect: null },
  // Ticket 0099 added record-lines.ts to that allowlist without adding its
  // probe, so nothing demonstrated the entry was live until ticket 0106.
  { rule: "catch", path: "src/record-lines.ts", code: "const f = () => {}; try { f(); } catch { f(); }", expect: null },
  // And the entry drops NO_CATCH only: record-lines.ts:30 claims "NO_CAST holds
  // here", and this is that sentence's witness.
  { rule: "cast", path: "src/record-lines.ts", code: "const v: unknown = 0; export const w = v as string;", expect: /claim without a check/ },

  // Rule 4 — type assertions only at the Pi seam; `as const` and the pure
  // widening `as unknown` claim nothing; the double cast still fires.
  { rule: "cast", path: "src/probe.ts", code: "const v: unknown = 0; export const w = v as string;", expect: /claim without a check/ },
  { rule: "cast", path: "src/probe.ts", code: "const v: unknown = 0; export const w = <string>v;", expect: /claim without a check/ },
  { rule: "cast", path: "src/probe.ts", code: "export const w = (0 as unknown) as string;", expect: /claim without a check/ },
  { rule: "cast", path: "src/probe.ts", code: "export const k = { a: 1 } as const;", expect: null },
  { rule: "cast", path: "src/probe.ts", code: "export const u = 0 as unknown;", expect: null },
  { rule: "cast", path: "src/pi-tap.ts", code: "const v: unknown = 0; export const w = v as string;", expect: null },

  // Rule 5 — one serialization point: record.ts (the record) and
  // check.ts (check output).
  { rule: "stringify", path: "src/probe.ts", code: "export const s = JSON.stringify({});", expect: /One serialization point/ },
  { rule: "stringify", path: "src/record.ts", code: "export const s = JSON.stringify({});", expect: null },
  { rule: "stringify", path: "src/check.ts", code: "export const s = JSON.stringify({});", expect: null },

  // Inline escapes are dead in src/: noInlineConfig means the disable comment
  // is inert and the rule still fires.
  { rule: "no-inline-escape", path: "src/probe.ts", code: "/* eslint-disable no-restricted-syntax */\nexport const s = JSON.stringify({});", expect: /One serialization point/ },

  // The pre-existing ~/.pi ban survives the composition.
  { rule: "pi-paths", path: "src/probe.ts", code: "export const p = '~/.pi/agent';", expect: /Never hardcode/ },

  // Tests are out of scope for all five rules.
  { rule: "scope", path: "tests/probe.test.ts", code: "export const s = JSON.stringify({ t: Date.now() });", expect: null },

  // Rule 6 — tests do not pin planning prose or the SDLC README. Executable
  // project scripts and specification paths remain valid test subjects.
  { rule: "planning-prose", path: "tests/probe.test.ts", code: "export const p = \"../../sdlc/planning/plan.md\";", expect: /planning prose/ },
  { rule: "planning-prose", path: "tests/probe.test.ts", code: "export const r = `../../sdlc/README.md`;", expect: /planning prose/ },
  { rule: "planning-prose", path: "tests/probe.test.ts", code: "export const p = \"../../sdlc/project/tasks\";", expect: null },
  { rule: "planning-prose", path: "tests/probe.test.ts", code: "export const s = \"../../sdlc/scripts/lint\";", expect: null },
  { rule: "planning-prose", path: "tests/probe.test.ts", code: "export const s = \"../../specification/conformance.md\";", expect: null },
];

let failures = 0;
for (const held of cases) {
  const messages = await messagesFor(held.path, held.code);
  const fatal = messages.find((message) => message.fatal === true);
  if (fatal !== undefined) {
    failures += 1;
    console.error(`FAIL [${held.rule}] ${held.path}: parse error: ${fatal.message}`);
    continue;
  }
  if (held.expect === null) {
    if (messages.length === 0) {
      console.log(`pass [${held.rule}] silent on allowed: ${held.path}: ${held.code.split("\n")[0]}`);
    } else {
      failures += 1;
      console.error(`FAIL [${held.rule}] ${held.path}: expected silence, got: ${messages.map((message) => message.message).join(" | ")}`);
    }
  } else if (messages.some((message) => held.expect.test(message.message))) {
    console.log(`pass [${held.rule}] fires: ${held.path}: ${held.code.split("\n")[0]}`);
  } else {
    failures += 1;
    console.error(`FAIL [${held.rule}] ${held.path}: expected ${String(held.expect)}, got: ${messages.map((message) => message.message).join(" | ") || "(silence)"}`);
  }
}

if (failures > 0) {
  console.error(`check-lint-rules: ${failures} case(s) failed`);
  process.exit(1);
}
console.log(`check-lint-rules: all ${cases.length} cases passed`);
