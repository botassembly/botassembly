// Ticket 0159 — `bot check` walks the children. inspection.md promises a
// malformed assembly is "refused here exactly as it would be at run time, with
// the same code and the same path", and check rendered only the INVOKED flow:
// a model-less subflow stage passed check and refused at run (the run-side twin
// is cli-refusals.test.ts's "a subflow that names no model at any rung it can
// see"), the flowless invocation validated no stage model at all, and a
// render-level input collision inside a subflow was checked by nobody. Driven
// through the real `semanticCheck([ ...])`, which is the surface that lied.
import { semanticCheck } from "./semantic-check.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { realBoundary, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(roots.cleanup);

const FLOW = "---\ndescription: main flow\n---\n";
const HELPER = "---\ndescription: helper flow\n---\n";

/** A parent flow and one assembly-scope subflow. The child's own sentinel is
 *  the caller's, because that is the only thing these witnesses vary. */
async function tree(home: string, child: string, assembly = "---\n---\n"): Promise<string> {
  const base = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(base, "flows/main"), { recursive: true }),
    mkdir(join(base, "subflows/helper"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), `${assembly}Review assembly.\n`),
    writeFile(join(base, "flows/main/FLOW.md"), FLOW),
    writeFile(join(base, "flows/main/01-parent.md"), "---\n---\nCall the helper.\n"),
    writeFile(join(base, "subflows/helper/FLOW.md"), HELPER),
    writeFile(join(base, "subflows/helper/01-answer.md"), child),
  ]);
  return base;
}

/** The refusal report is `code  path` with the sentence indented under it
 *  (refusals.md), and faults are a SET — sorted here, never order-asserted. */
function faults(errors: Buffer[]): string[] {
  return Buffer.concat(errors).toString()
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith(" "))
    .sort();
}

test("a subflow stage with no name uses the home default through check", async () => {
  const { root, home } = await roots.scratch("bot-check-child-modelless-");
  await tree(home, "---\n---\nAnswer the question.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  // The `--model` rung stops at the subflow boundary (subflow.md), so it
  // settles the parent and names nothing for the child — the same fault the
  // run gives, and check now gives it first.
  await expect(semanticCheck([ "review/main", "--intelligence", "default"], held)).resolves.toBe(0);
  expect(faults(stderr)).toEqual([]);
  expect(Buffer.concat(stdout).toString()).not.toBe("");
});

test("a subflow that names its own model passes, and check says only the invoked flow's stages", async () => {
  const { root, home } = await roots.scratch("bot-check-child-green-");
  await tree(home, "---\nintelligence: default\n---\nAnswer the question.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  await expect(semanticCheck([ "review/main", "--intelligence", "default", "--json"], held)).resolves.toBe(0);
  // The walk is silent: a child contributes faults and never a line.
  const lines = Buffer.concat(stdout).toString().trimEnd().split("\n");
  expect(lines.map((line) => (JSON.parse(line) as { stage: string }).stage)).toEqual(["01-parent"]);
});

test("the flowless invocation accepts every child through the home default", async () => {
  const { root, home } = await roots.scratch("bot-check-child-assembly-");
  await tree(home, "---\n---\nAnswer the question.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  // `--model` settles ASSEMBLY.md, the one holder the assembly agent runs;
  // every flow and subflow in its synthetic scope is a child (run.ts).
  await expect(semanticCheck([ "review", "--intelligence", "default"], held)).resolves.toBe(0);
  expect(faults(stderr)).toEqual([]);
});

test("stage inputs that collide inside a subflow refuse — the flavour nobody was checking", async () => {
  const { root, home } = await roots.scratch("bot-check-child-collision-");
  const base = await tree(home, "---\n---\nAnswer the question.\n", "---\nintelligence: default\n---\n");
  await mkdir(join(base, "subflows/helper/02-polish"), { recursive: true });
  await Promise.all([
    writeFile(join(base, "subflows/helper/02-polish/LOOP.md"), "---\nrepeat: 3\n---\n"),
    writeFile(join(base, "subflows/helper/02-polish/01-answer.md"), "---\n---\nPolish it.\n"),
    writeFile(join(base, "subflows/helper/99-done.md"), "---\n---\nHand it back.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  // A child never re-enters the reader at run time, so this collision was
  // checked by neither verb: `$INPUT` held two files named `answer` and one
  // clobbered the other, silently, in a run that exited 0.
  await expect(semanticCheck([ "review/main"], held)).resolves.toBe(2);
  expect(faults(stderr)).toEqual(["input-collision  subflows/helper/02-polish/01-answer.md"]);
  expect(Buffer.concat(stderr).toString()).toContain("Rename one of the inputs named answer.");
});
