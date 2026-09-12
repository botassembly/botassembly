// Ticket 0163 — `bot assembly check .` means the assembly right here. Inside a valid
// assembly, `.` missed the path test at the classification seam and went
// looking for an assembly of that name in the home (`assembly-unknown`), and
// every trailing slash — `./`, `./good/`, `"$PWD"/` — split into a flow named
// nothing and refused as two readings (`request-invalid`). Both were false.
// The reference is normalized once now, where it is classified, so each of
// these spellings resolves to exactly what the equivalent `"$PWD"` spelling
// resolves to: these witnesses compare the BYTES of the two runs, which is the
// whole claim. Driven through the real `main([...])`.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { realBoundary, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(roots.cleanup);

/** One sound assembly at `base`, the shape every other cli-* file builds. */
async function assembly(base: string): Promise<string> {
  const flow = join(base, "flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  return base;
}

interface Said { code: number; out: string; err: string }

/** One `main` call from `cwd`, with its two streams as strings. */
async function said(cwd: string, home: string, args: string[]): Promise<Said> {
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(cwd, home, stdout, stderr);
  const code = await main(args, held);
  return { code, out: Buffer.concat(stdout).toString(), err: Buffer.concat(stderr).toString() };
}

test("`bot assembly check .` from inside an assembly says exactly what the absolute target says", async () => {
  const { root, home } = await roots.scratch("bot-dot-inside-");
  const base = await assembly(join(root, "good"));
  const dot = await said(base, home, ["assembly", "check", "."]);
  const absolute = await said(base, home, ["assembly", "check", base]);
  expect(dot.code).toBe(0);
  expect(dot.out).toBe(absolute.out);
  expect(dot.out).toContain("assembly  ASSEMBLY");
  expect(dot.err).toBe("");
});

test("`bot assembly check ./` and a doubled slash say the same as the absolute spelling", async () => {
  const { root, home } = await roots.scratch("bot-dot-slash-");
  const base = await assembly(join(root, "good"));
  const absolute = await said(base, home, ["assembly", "check", base]);
  for (const spelling of ["./", ".//"]) {
    const held = await said(base, home, ["assembly", "check", spelling]);
    expect(held.code).toBe(0);
    expect(held.out).toBe(absolute.out);
    expect(held.err).toBe("");
  }
});

test("a trailing slash on any path spelling reads as the path without it", async () => {
  const { root, home } = await roots.scratch("bot-trailing-slash-");
  const base = await assembly(join(root, "good"));
  const plain = await said(root, home, ["assembly", "check", "./good"]);
  expect(plain.code).toBe(0);
  for (const spelling of ["./good/", `${base}/`, "./good//"]) {
    const held = await said(root, home, ["assembly", "check", spelling]);
    expect(held.code).toBe(0);
    expect(held.out).toBe(plain.out);
    expect(held.err).toBe("");
  }
});

test("a flow named under a dot spelling reads as the flow under the absolute one", async () => {
  const { root, home } = await roots.scratch("bot-dot-flow-");
  const base = await assembly(join(root, "good"));
  const absolute = await said(root, home, ["assembly", "check", join(base, "main")]);
  const dotted = await said(base, home, ["assembly", "check", "./main"]);
  expect(dotted.code).toBe(0);
  expect(dotted.out).toBe(absolute.out);
});

test("`bot assembly check .` where nothing is an assembly refuses exactly as the absolute spelling does", async () => {
  const { root, home } = await roots.scratch("bot-dot-plain-");
  const plain = join(root, "plain");
  await mkdir(plain, { recursive: true });
  const absolute = await said(plain, home, ["assembly", "check", plain]);
  expect(absolute.code).toBe(2);
  for (const spelling of [".", "./"]) {
    const held = await said(plain, home, ["assembly", "check", spelling]);
    expect(held.code).toBe(2);
    expect(held.err).toBe(absolute.err);
  }
});

test("a name is still a name: the home lookup and its refusal are untouched", async () => {
  const { root, home } = await roots.scratch("bot-name-lookup-");
  await assembly(join(home, "assemblies/review"));
  // A directory of the same name beside the caller must not be reached for.
  await assembly(join(root, "review"));
  const named = await said(root, home, ["assembly", "check", "review"]);
  expect(named.code).toBe(0);
  expect(named.out).toContain("assembly  ASSEMBLY");
  const missing = await said(root, home, ["assembly", "check", "nosuch"]);
  expect(missing.code).toBe(2);
  expect(missing.err).toBe("The assembly is not valid.\n");
});

test("two readings in one reference still refuse, in the words they always used", async () => {
  const { root, home } = await roots.scratch("bot-two-readings-");
  const outer = await assembly(join(home, "assemblies/outer"));
  await assembly(join(outer, "inner"));
  const held = await said(root, home, ["assembly", "check", "outer/inner"]);
  expect(held.code).toBe(2);
  expect(held.err).toBe("The assembly is not valid.\n");
});

test("`bot run` shares the seam: `run .` from inside an assembly resolves the tree", async () => {
  const { root, home } = await roots.scratch("bot-dot-run-");
  const base = await assembly(join(root, "good"));
  // No request is given and stdin is a terminal, so the run stops at the rung
  // AFTER the target resolved — which is the proof the target resolved at all.
  const dot = await said(base, home, ["run", "start", "."]);
  expect(dot.code).toBe(2);
  expect(dot.err).toContain("request-invalid  .");
  expect(dot.err).toContain("Give exactly one request.");
  const absolute = await said(base, home, ["run", "start", base]);
  expect(absolute.err).toBe(dot.err.replace("request-invalid  .", `request-invalid  ${base}`));
});
