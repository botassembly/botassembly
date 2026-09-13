// Ticket 0011 — named, minimized regressions for every defect the fuzz pass
// found, plus pinned invariant guards that already held. One test per finding;
// the narrative lives in planning/tickets/0011-findings.md. The invariant:
// the reader accepts (exit 0) or refuses (exit 2, fault sentences) — it never
// throws, never hangs, never reads outside the assembly tree.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { check, type CheckResult } from "../src/reader.ts";

const isRoot = process.getuid?.() === 0;
const roots: string[] = [];

afterAll(() => {
  // rm(1), not rmSync: it walks with *at syscalls, so the deliberately
  // beyond-PATH_MAX tree from F8 can actually be deleted.
  for (const root of roots) {
    execFileSync("chmod", ["-R", "u+rwX", root]);
    execFileSync("rm", ["-rf", root]);
  }
});

/** A fresh case directory holding a minimal sound assembly at ./asm. */
function caseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bot-fuzz-regression-"));
  roots.push(dir);
  const flow = join(dir, "asm", "flows", "main");
  mkdirSync(flow, { recursive: true });
  writeFileSync(join(dir, "asm", "ASSEMBLY.md"), "---\nintelligence: default\n---\nRoute.\n");
  writeFileSync(join(flow, "FLOW.md"), "---\ndescription: d\n---\n");
  writeFileSync(join(flow, "01-a.md"), "---\n---\nDo.\n");
  mkdirSync(join(dir, "home"));
  writeFileSync(join(dir, "home/config.yaml"), "intelligences:\n  default: { model: faux-1, reasoning: medium }\n");
  return dir;
}

/** The invariant: no throw, exit 0 or 2, refusals carry parseable fault lines. */
function readerHolds(dir: string, invocation: string): CheckResult {
  const source = invocation.includes("--home") ? invocation : `${invocation} --home ./home`;
  const result = check(source, dir, process.env);
  expect([0, 2]).toContain(result.exitCode);
  for (const line of result.lines) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (result.exitCode === 2) {
      expect(typeof parsed["code"]).toBe("string");
      expect(typeof parsed["message"]).toBe("string");
    }
  }
  if (result.exitCode === 2) expect(result.lines.length).toBeGreaterThan(0);
  return result;
}

test("F1: a directory where a markdown document belongs refuses, no EISDIR", () => {
  // ASSEMBLY.md as a directory — the minimized crash.
  const a = caseDir();
  rmSync(join(a, "asm", "ASSEMBLY.md"));
  mkdirSync(join(a, "asm", "ASSEMBLY.md"));
  expect(readerHolds(a, "./asm/main").exitCode).toBe(2);
  // Same class: sentinel FLOW.md as a directory.
  const b = caseDir();
  rmSync(join(b, "asm", "flows", "main", "FLOW.md"));
  mkdirSync(join(b, "asm", "flows", "main", "FLOW.md"));
  expect(readerHolds(b, "./asm/main").exitCode).toBe(2);
  // Same class: SKILL.md as a directory.
  const c = caseDir();
  mkdirSync(join(c, "asm", "skills", "s1", "SKILL.md"), { recursive: true });
  expect(readerHolds(c, "./asm/main").exitCode).toBe(2);
  // Same class: the @task file as a directory, and home config.yaml as a directory.
  const d = caseDir();
  mkdirSync(join(d, "task.md"));
  rmSync(join(d, "home", "config.yaml"));
  mkdirSync(join(d, "home", "config.yaml"), { recursive: true });
  expect(readerHolds(d, "./asm/main --home ./home @task.md").exitCode).toBe(2);
});

test.skipIf(isRoot)("F2: an unreadable file refuses, no EACCES throw", () => {
  const a = caseDir();
  chmodSync(join(a, "asm", "ASSEMBLY.md"), 0o000);
  expect(readerHolds(a, "./asm/main").exitCode).toBe(2);
  // Same class: an unreadable gate file is not runnable.
  const b = caseDir();
  const stage = join(b, "asm", "flows", "main", "02-b");
  mkdirSync(stage);
  writeFileSync(join(stage, "STAGE.md"), "---\n---\nDo.\n");
  writeFileSync(join(stage, "gate.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  chmodSync(join(stage, "gate.sh"), 0o000);
  expect(readerHolds(b, "./asm/main").exitCode).toBe(2);
});

test.skipIf(isRoot)("F3: an unreadable directory refuses, no EACCES scandir throw", () => {
  const a = caseDir();
  chmodSync(join(a, "asm", "flows"), 0o000);
  expect(readerHolds(a, "./asm/main").exitCode).toBe(2);
  // Same class: an unreadable stage folder inside a flow.
  const b = caseDir();
  const stage = join(b, "asm", "flows", "main", "02-z");
  mkdirSync(stage);
  writeFileSync(join(stage, "STAGE.md"), "---\n---\nDo.\n");
  chmodSync(stage, 0o000);
  expect(readerHolds(b, "./asm/main").exitCode).toBe(2);
});

test("F4: a path routed through a plain file refuses, no ENOTDIR throw", () => {
  const dir = caseDir();
  writeFileSync(join(dir, "plain"), "not a directory\n");
  expect(readerHolds(dir, "./plain/asm").exitCode).toBe(2);
  // A home whose config.yaml is unreachable counts as a home without one —
  // the same acceptance a nonexistent --home directory already gets.
  expect(readerHolds(dir, "./asm/main --home ./plain").exitCode).toBe(2);
  expect(readerHolds(dir, "./asm/main --home ./plain/x").exitCode).toBe(2);
  expect(readerHolds(dir, "./asm/main --in ./plain/x").exitCode).toBe(2);
  expect(readerHolds(dir, "./asm/main @plain/x.md").exitCode).toBe(2);
});

test.skipIf(isRoot)("F4: an unreadable assembly root refuses, no EACCES lstat throw", () => {
  const dir = caseDir();
  chmodSync(join(dir, "asm"), 0o000);
  expect(readerHolds(dir, "./asm/main").exitCode).toBe(2);
});

test("F5: a YAML alias bomb in frontmatter refuses, no toJS throw", () => {
  const dir = caseDir();
  let bomb = "a: &a [x, x, x, x, x, x, x, x, x, x]\n";
  bomb += "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\n";
  bomb += "c: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\n";
  writeFileSync(join(dir, "asm", "ASSEMBLY.md"), `---\nintelligence: default\n${bomb}---\nRoute.\n`);
  expect(readerHolds(dir, "./asm/main").exitCode).toBe(2);
});

test("F6: a fifo where a markdown document belongs refuses, no blocking read", () => {
  const dir = caseDir();
  rmSync(join(dir, "asm", "ASSEMBLY.md"));
  execFileSync("mkfifo", [join(dir, "asm", "ASSEMBLY.md")]);
  expect(readerHolds(dir, "./asm/main").exitCode).toBe(2);
}, 5_000);

test("F7: a quoted run of backslashes in the invocation parses in linear time", () => {
  const dir = caseDir();
  // Pre-fix this backtracked exponentially (~2x per character; 40 took a
  // second, this length never returns). The invariant is simply: it returns.
  readerHolds(dir, `./asm/main "${"\\".repeat(2_000)}`);
}, 5_000);

test("F8: nesting past PATH_MAX refuses, no ENAMETOOLONG throw", () => {
  const dir = caseDir();
  const segment = "d".repeat(20);
  const script = `cd "$1/asm/flows/main"; for i in $(seq 1 300); do mkdir ${segment}; cd ${segment}; done`;
  execFileSync("bash", ["-c", script, "bash", dir]);
  expect(readerHolds(dir, "./asm/main").exitCode).toBe(2);
  // The 180s suite budget also covers the same filesystem work under an
  // execve tracer. The guard catches a hang; a tighter one only buys false
  // reds when observation slows the 300 directory operations.
}, 180_000);

test("guard: symlinks into, out of, and at themselves are refused, never followed", () => {
  const dir = caseDir();
  const flow = join(dir, "asm", "flows", "main");
  symlinkSync(join(flow, "self"), join(flow, "self"));
  symlinkSync("/etc/passwd", join(flow, "02-out.md"));
  symlinkSync(join(flow, "01-a.md"), join(flow, "03-in.md"));
  // A fifo outside the tree, symlinked in: refusing without hanging proves the
  // reader never opened bytes outside the assembly tree.
  execFileSync("mkfifo", [join(dir, "outside-fifo")]);
  symlinkSync(join(dir, "outside-fifo"), join(flow, "04-fifo.md"));
  const result = readerHolds(dir, "./asm/main");
  expect(result.exitCode).toBe(2);
  const codes = result.lines.map((line) => (JSON.parse(line) as Record<string, unknown>)["code"]);
  expect(codes).toContain("symlink");
}, 5_000);

test("guard: zero-byte and BOM-prefixed sentinels refuse as unsound frontmatter", () => {
  const dir = caseDir();
  writeFileSync(join(dir, "asm", "flows", "main", "01-a.md"), "");
  writeFileSync(join(dir, "asm", "ASSEMBLY.md"), "﻿---\nintelligence: default\n---\nRoute.\n");
  const result = readerHolds(dir, "./asm/main");
  expect(result.exitCode).toBe(2);
  const faults = result.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(faults.map((held) => held["code"])).toContain("frontmatter-invalid");
  // Ticket 0020 (O4): the BOM is refused by name, never silently stripped.
  expect(faults).toContainEqual(
    expect.objectContaining({ code: "frontmatter-invalid", path: "ASSEMBLY.md", message: "Remove the byte-order mark." }),
  );
});

test("guard: a multi-megabyte stage body is accepted, not a crash", () => {
  const dir = caseDir();
  writeFileSync(join(dir, "asm", "flows", "main", "01-a.md"), `---\n---\n${"lorem ipsum ".repeat(262_144)}\n`);
  expect(readerHolds(dir, "./asm/main").exitCode).toBe(0);
}, 10_000);
