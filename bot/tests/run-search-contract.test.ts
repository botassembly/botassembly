import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { processClock } from "../src/process-clock.ts";
import { runSearchCommand } from "../src/run-search-command.ts";
import { runSearchReading } from "../src/public-run-readings.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => { await rm(root, { recursive: true, force: true }); })); });

async function fresh(): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-search-contract-")); roots.push(root);
  const home = join(root, "home"); await mkdir(join(home, "runs"), { recursive: true }); return { root, home };
}

async function candidates(home: string, count: number, long: boolean): Promise<void> {
  for (let start = 0; start < count; start += 128) {
    await Promise.all(Array.from({ length: Math.min(128, count - start) }, async (_value, offset) => {
      const index = start + offset, name = `${String(index).padStart(4, "0")}${long ? `-${"x".repeat(28)}` : ""}`;
      const directory = join(home, "runs", name); await mkdir(directory); await writeFile(join(directory, "record.jsonl"), "");
    }));
  }
}

function errorCause(bytes: Buffer): string { return (JSON.parse(bytes.toString()) as { error: { cause: string } }).error.cause; }

async function direct(args: string[]): Promise<{ exit: number; stdout: Buffer; stderr: Buffer }> {
  const root = await mkdtemp(join(tmpdir(), "bot-search-direct-")); roots.push(root);
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const exit = await runSearchCommand(["--home", join(root, "definitely-missing"), ...args], { cwd: root, env: { HOME: root, PATH: "" }, stdout: (bytes) => { stdout.push(Buffer.from(bytes)); }, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, clock: processClock() });
  return { exit, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}

test("rejects every query and option shape before filesystem or process access", async () => {
  const oversized = "x".repeat(4_097);
  const cases: Array<[string[], string]> = [
    [["--json"], "value-missing"], [["--json", "--", ""], "value-empty"], [["--json", "--", "bad\nquery"], "argument-invalid"],
    [["--json", "--", "bad\u0000query"], "argument-invalid"], [["--json", "--", oversized], "value-oversized"],
    [["--json", "one", "two"], "argument-extra"], [["--json", "--", "one", "two"], "argument-extra"],
    [["--json", "--", "--"], "option-repeated"], [["--json", "--json", "one"], "option-repeated"],
    [["--json", "--limit", "0", "one"], "limit-invalid"], [["--json", "--limit", "201", "one"], "limit-invalid"],
    [["--json", "--limit"], "value-missing"], [["--json", "-needle"], "argument-unknown"],
  ];
  for (const [args, cause] of cases) {
    const result = await direct(args); expect(result.exit).toBe(2); expect(result.stdout).toHaveLength(0); expect(errorCause(result.stderr)).toBe(cause);
  }
  const accepted = await direct(["--json", "--", "-needle"]); expect(accepted.exit).toBe(1); expect(errorCause(accepted.stderr)).toBe("home-missing");
});

test("filters non-retained files and symlinks before the exact candidate search", async () => {
  const held = await fresh(), run = join(held.home, "runs", "run"); await mkdir(join(run, "nested"), { recursive: true });
  await Promise.all([
    writeFile(join(run, "record.jsonl"), "needle\n"), writeFile(join(run, "request.txt"), "needle excluded\n"),
    writeFile(join(run, "nested", "request.txt"), "needle\n"), writeFile(join(held.home, "runs", "ignored.lock"), "needle\n"),
  ]);
  await symlink(join(run, "record.jsonl"), join(run, "session.jsonl"));
  await symlink(join(run, "nested"), join(run, "linked-dir"));
  await symlink(run, join(held.home, "runs", "linked-run"));
  const result = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: process.env["PATH"] });
  expect(result.exit).toBe(0);
  const document = JSON.parse(result.stdout.toString()) as { summary: { candidateFiles: number }; data: { hits: Array<{ file: string }> } };
  expect(document.summary.candidateFiles).toBe(1); expect(document.data.hits.map((hit) => hit.file)).toEqual(["run/record.jsonl"]);
});

test("rejects separate CR, LF, and non-UTF-8 path components before spawning", async () => {
  for (const name of [Buffer.from("bad\rname"), Buffer.from("bad\nname"), Buffer.from([0x62, 0x61, 0x64, 0xff])]) {
    const held = await fresh(), path = Buffer.concat([Buffer.from(join(held.home, "runs")), Buffer.from("/"), name]);
    await mkdir(path); await writeFile(Buffer.concat([path, Buffer.from("/record.jsonl")]), "needle\n");
    const result = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: "" });
    expect(result.exit).toBe(5); expect(result.stdout).toHaveLength(0); expect(errorCause(result.stderr)).toBe("source-invalid");
  }
});

test("rejects controlled rg output that reverses two explicit candidates", async () => {
  const held = await fresh(), bin = join(held.root, "bin"); await mkdir(bin);
  for (const name of ["a", "b"]) { const run = join(held.home, "runs", name); await mkdir(run); await writeFile(join(run, "record.jsonl"), "needle\n"); }
  const lines = ["b", "a"].map((name) => JSON.stringify({ type: "match", data: { path: { text: `${name}/record.jsonl` }, lines: { text: "needle\n" }, line_number: 1 } }));
  await writeFile(join(bin, "rg"), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 'ripgrep controlled'; else printf '%s\\n' '${lines.join("' '")}'; fi\n`); await chmod(join(bin, "rg"), 0o755);
  const result = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: bin });
  expect(result.exit).toBe(4); expect(result.stdout).toHaveLength(0); expect(errorCause(result.stderr)).toBe("dependency-failed");
});

test("refuses candidate-count and argument-byte overflow before spawning", async () => {
  const count = await fresh(); await candidates(count.home, 4_097, false);
  const tooMany = await runSearchReading(count.home, "needle", { json: true }, count.root, { PATH: "" });
  expect(tooMany.exit).toBe(5); expect(errorCause(tooMany.stderr)).toBe("result-oversized");

  const bytes = await fresh(); await candidates(bytes.home, 4_096, true);
  const tooLong = await runSearchReading(bytes.home, "needle", { json: true }, bytes.root, { PATH: "" });
  expect(tooLong.exit).toBe(5); expect(errorCause(tooLong.stderr)).toBe("result-oversized");
}, 30_000);

test("maps replacement races from the selected tool's observed outcome", async () => {
  for (const succeeds of [true, false]) {
    const held = await fresh(), run = join(held.home, "runs", "one"), bin = join(held.root, "bin"); await mkdir(run); await mkdir(bin);
    await writeFile(join(run, "record.jsonl"), "original\n"); await writeFile(join(held.home, "outside"), "needle replacement\n");
    const script = `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 'grep controlled'; exit 0; fi\n/bin/rm one/record.jsonl\n/bin/ln -s ../../outside one/record.jsonl\n${succeeds ? "exec /usr/bin/grep \"$@\"" : "exit 2"}\n`;
    await writeFile(join(bin, "grep"), script); await chmod(join(bin, "grep"), 0o755);
    const result = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: bin });
    expect(result.exit).toBe(succeeds ? 0 : 4);
    if (succeeds) {
      const document = JSON.parse(result.stdout.toString()) as { data: { hits: Array<{ file: string; text: string }> } };
      expect(document.data.hits).toEqual([expect.objectContaining({ file: "one/record.jsonl", text: "needle replacement" })]);
    } else { expect(result.stdout).toHaveLength(0); expect(errorCause(result.stderr)).toBe("dependency-failed"); }
  }
});

test("rejects malformed grep framing and unsafe line numbers", async () => {
  for (const output of ["one/record.jsonl:1:needle\\n", "one/record.jsonl\\0009007199254740992:needle\\n"]) {
    const held = await fresh(), run = join(held.home, "runs", "one"), bin = join(held.root, "bin"); await mkdir(run); await mkdir(bin); await writeFile(join(run, "record.jsonl"), "needle\n");
    const script = `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 'grep controlled'; else printf '${output.replaceAll("'", "'\\''")}'; fi\n`;
    await writeFile(join(bin, "grep"), script); await chmod(join(bin, "grep"), 0o755);
    const result = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: bin });
    expect(result.exit).toBe(4); expect(result.stdout).toHaveLength(0); expect(errorCause(result.stderr)).toBe("dependency-failed");
  }
});

test("renders UTF-8 replacement, CRLF, Markdown controls, tabs, and the 480-byte boundary", async () => {
  const held = await fresh(), run = join(held.home, "runs", "a|run"); await mkdir(run, { recursive: true });
  const prefix = Buffer.from("needle\t|<tag> ");
  await writeFile(join(run, "record.jsonl"), Buffer.concat([prefix, Buffer.alloc(480, 120), Buffer.from([0xff, 13, 10])]));
  const json = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: process.env["PATH"] });
  expect(json.exit).toBe(0);
  const document = JSON.parse(json.stdout.toString()) as { data: { hits: Array<{ file: string; text: string; omittedBytes: number }> } };
  expect(document.data.hits[0]?.file).toBe("a|run/record.jsonl"); expect(document.data.hits[0]?.text).toContain("\t|<tag>");
  expect(Buffer.byteLength(document.data.hits[0]?.text ?? "")).toBe(480); expect(document.data.hits[0]?.omittedBytes).toBe(17);
  const markdown = await runSearchReading(held.home, "needle", {}, held.root, { PATH: process.env["PATH"] });
  expect(markdown.stdout.toString()).toContain("a\\|run/record.jsonl"); expect(markdown.stdout.toString()).not.toContain("<tag>");
});

test("maps a synchronous stdout failure to output-error", async () => {
  const held = await fresh(), run = join(held.home, "runs", "one"), stderr: Buffer[] = []; await mkdir(run); await writeFile(join(run, "record.jsonl"), "needle\n");
  const exit = await runSearchCommand(["--json", "--home", held.home, "--", "needle"], { cwd: held.root, env: { PATH: process.env["PATH"] }, stdout: () => { throw new Error("write failed"); }, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, clock: processClock() });
  expect(exit).toBe(4); expect(errorCause(Buffer.concat(stderr))).toBe("output-error");
});

test("pages three times, binds cursor selection, rejects lost positions, and sees live appends", async () => {
  const held = await fresh(), run = join(held.home, "runs", "run"); await mkdir(run); const file = join(run, "record.jsonl");
  await writeFile(file, "needle one\nneedle two\nneedle three\nneedle four\n");
  const maximum = await runSearchReading("home", "needle", { json: true, limit: 200 }, held.root, { PATH: process.env["PATH"] });
  expect((JSON.parse(maximum.stdout.toString()) as { page: { limit: number }; summary: { returned: number } })).toMatchObject({ page: { limit: 200 }, summary: { returned: 4 } });
  const human = await runSearchReading("home", "needle", { limit: 1 }, held.root, { PATH: process.env["PATH"] });
  expect(human.exit).toBe(0); expect(human.stderr.toString()).toMatch(/^More matches remain\. Continue with --after [A-Za-z0-9_-]+\.\n$/u);
  const pages: string[] = [], seen: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const after = pages.at(-1);
    const result = await runSearchReading(index === 0 ? "home" : held.home, "needle", { json: true, limit: 1, ...(after === undefined ? {} : { after }) }, held.root, { PATH: process.env["PATH"] });
    const document = JSON.parse(result.stdout.toString()) as { data: { hits: Array<{ text: string }> }; page: { next: string | null } };
    seen.push(document.data.hits[0]?.text ?? ""); if (document.page.next !== null) pages.push(document.page.next);
  }
  expect(seen).toEqual(["needle one", "needle two", "needle three"]);
  const firstCursor = pages[0], lastCursor = pages.at(-1); if (firstCursor === undefined || lastCursor === undefined) throw new Error("paging produced no cursor");
  await writeFile(file, "needle one\nneedle two\nneedle three\nneedle four\nneedle five\n");
  const live = await runSearchReading(held.home, "needle", { json: true, limit: 2, after: lastCursor }, held.root, { PATH: process.env["PATH"] });
  const liveDocument = JSON.parse(live.stdout.toString()) as { data: { hits: Array<{ text: string }> } };
  expect(liveDocument.data.hits.map((hit) => hit.text)).toEqual(["needle four", "needle five"]);
  const wrongQuery = await runSearchReading(held.home, "other", { json: true, after: firstCursor }, held.root, { PATH: process.env["PATH"] });
  expect(wrongQuery.exit).toBe(3); expect(errorCause(wrongQuery.stderr)).toBe("cursor-selection");
  const alias = join(held.root, "alias"); await symlink(held.home, alias);
  const wrongHome = await runSearchReading(alias, "needle", { json: true, after: firstCursor }, held.root, { PATH: process.env["PATH"] });
  expect(wrongHome.exit).toBe(3); expect(errorCause(wrongHome.stderr)).toBe("cursor-selection");
  await writeFile(file, "needle one\n");
  const lost = await runSearchReading(resolve(held.home), "needle", { json: true, after: lastCursor }, held.root, { PATH: process.env["PATH"] });
  expect(lost.exit).toBe(3); expect(errorCause(lost.stderr)).toBe("cursor-position");
});

test("enforces encoded and decoded cursor bounds", async () => {
  const held = await fresh();
  const encoded = await runSearchReading(held.home, "needle", { json: true, after: "a".repeat(8_193) }, held.root, { PATH: process.env["PATH"] });
  expect(encoded.exit).toBe(2); expect(errorCause(encoded.stderr)).toBe("cursor-limit");
  const decodedCursor = Buffer.alloc(6_145, 120).toString("base64url");
  const decoded = await runSearchReading(held.home, "needle", { json: true, after: decodedCursor }, held.root, { PATH: process.env["PATH"] });
  expect(decoded.exit).toBe(2); expect(errorCause(decoded.stderr)).toBe("cursor-limit");
  const malformed = await runSearchReading(held.home, "needle", { json: true, after: "***" }, held.root, { PATH: process.env["PATH"] });
  expect(malformed.exit).toBe(2); expect(errorCause(malformed.stderr)).toBe("cursor-malformed");
});
