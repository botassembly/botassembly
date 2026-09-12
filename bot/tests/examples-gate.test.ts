import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

type Mode = "success" | "valid" | "malformed" | "wrong-envelope" | "wrong-types" | "unknown-code" | "oversized-array" | "oversized-field" | "oversized-input" | "read-failure" | "parser-failure";

async function fixture(mode: Mode): Promise<{ root: string; script: string; bin: string }> {
	const root = await mkdtemp(join(tmpdir(), "bot-examples-gate-"));
	roots.push(root);
	const script = join(root, "sdlc/scripts/examples");
	await mkdir(join(root, "sdlc/scripts"), { recursive: true });
	await writeFile(script, await readFile(new URL("../../sdlc/scripts/examples", import.meta.url)));
	await chmod(script, 0o755);
	await mkdir(join(root, "bot/src"), { recursive: true });
	await writeFile(join(root, "package.json"), '{"type":"module"}\n');
	await writeFile(join(root, "bot/src/cli.ts"), "// fake CLI target\n");
	await writeFile(join(root, "bot/src/spine.ts"), mode === "parser-failure" ? "not valid module" : 'export const REFUSAL_CODES = ["entry-unknown", "path-missing"];\n');
	await mkdir(join(root, "examples/fixture/flows/main"), { recursive: true });
	await writeFile(join(root, "examples/fixture/ASSEMBLY.md"), "---\n---\nFixture.\n");
	await writeFile(join(root, "examples/fixture/flows/main/FLOW.md"), "---\n---\n");
	const bin = join(root, "bin");
	await mkdir(bin);
	await writeFile(join(bin, "node"), `#!/bin/sh
if case "$1" in */bot/src/cli.ts) true;; *) false;; esac; then
  case "$GATE_MODE" in
    success) printf '%s\\n' 'unexpected check output'; exit 0 ;;
    valid) printf '%s\\n' '{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":[{"code":"entry-unknown","path":"flows/main/01-stage.md","sentence":"SECRET sentence"},{"code":"path-missing","path":"/private/secret","sentence":"SECRET path"}]}}}' >&2 ;;
    malformed) printf '%s\\n' 'not json' >&2 ;;
    wrong-envelope) printf '%s\\n' '{"schemaVersion":1,"kind":"not-error","error":{}}' >&2 ;;
    wrong-types) printf '%s\\n' '{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":"not-an-array"}}}' >&2 ;;
    unknown-code) printf '%s\\n' '{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":[{"code":"unknown-code","path":"safe.md","sentence":"SECRET"}]}}}' >&2 ;;
    oversized-array) printf '%s' '{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":[' >&2; i=0; while [ "$i" -lt 21 ]; do [ "$i" -gt 0 ] && printf '%s' ',' >&2; printf '%s' '{"code":"entry-unknown","path":"safe.md","sentence":"safe"}' >&2; i=$((i + 1)); done; printf '%s\\n' ']}}}' >&2 ;;
    oversized-field) printf '%s' '{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":[{"code":"entry-unknown","path":"safe.md","sentence":"' >&2; i=0; while [ "$i" -lt 3000 ]; do printf '%s' x >&2; i=$((i + 1)); done; printf '%s\\n' '"}]}}}' >&2 ;;
    oversized-input) i=0; while [ "$i" -lt 70000 ]; do printf '%s' x >&2; i=$((i + 1)); done; printf '\\n' >&2 ;;
    read-failure|parser-failure) printf '%s\\n' '{"schemaVersion":1,"kind":"error","error":{"code":"request-invalid","operation":"assembly.check","cause":"assembly-invalid","message":"The assembly is not valid.","retryable":false,"details":{"faults":[{"code":"entry-unknown","path":"safe.md","sentence":"safe"}]}}}' >&2 ;;
  esac
  printf '%s\\n' 'unexpected check output'
  exit 2
fi
if [ "$1" = "--input-type=module" ] && [ "$GATE_MODE" = "read-failure" ]; then rm -f "$3"; fi
exec "$REAL_NODE" "$@"
`);
	await chmod(join(bin, "node"), 0o755);
	return { root, script, bin };
}

function run(held: { root: string; script: string; bin: string }, mode: Mode) {
	return spawnSync("sh", [held.script], {
		cwd: held.root,
		env: { ...process.env, GATE_MODE: mode, PATH: `${held.bin}:${process.env.PATH ?? ""}`, REAL_NODE: process.execPath },
		encoding: "utf8",
	});
}

test("examples gate keeps successful check output silent", async () => {
	const held = await fixture("success");
	const result = run(held, "success");
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toBe("examples: examples/fixture/main resolves\n");
	expect(result.stderr).toBe("");
});

test("examples gate reports safe details and keeps check output hidden", async () => {
	const held = await fixture("valid");
	const result = run(held, "valid");
	expect(result.status).toBe(1);
	expect(result.stdout).toBe("");
	expect(result.stderr).toBe("examples: examples/fixture/main does not resolve\n  faults: entry-unknown at flows/main/01-stage.md; path-missing at <omitted>\n");
	expect(result.stderr).not.toContain("SECRET");
	expect(result.stderr).not.toContain("/private/secret");
	expect(result.stderr).not.toContain(held.root);
});

for (const mode of ["malformed", "wrong-envelope", "wrong-types", "unknown-code", "oversized-array", "oversized-field", "oversized-input", "read-failure", "parser-failure"] as const) {
	test(`examples gate uses one fixed fallback for ${mode}`, async () => {
		const held = await fixture(mode);
		const result = run(held, mode);
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("examples: examples/fixture/main does not resolve\n  no structured fault details\n");
		expect(result.stderr).not.toContain("SECRET");
		expect(result.stderr).not.toContain(held.root);
	});
}
