// Ticket 0070 — the guard at the foot of cli.ts decides "invoked, not
// imported", and it decided wrong through a symlink: node resolves a module
// URL through links while argv[1] keeps the link, so `node <link>/cli.ts
// --help` matched nothing, main() never ran, and the process exited 0 with no
// stdout and no stderr. Exit 0 and silence is the worst shape a defect can
// take: nothing to grep and every caller reads it as success.
//
// Both halves are witnessed here through the SAME symlink, because the cheap
// wrong fix — always run — passes the first half and is far worse than the
// bug, since every import of cli.ts would then execute main().
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { BOUNDARY_MS, cliPath, piped } from "./boundary.ts";

const roots: string[] = [];

/** A scratch directory holding `src` -> the real src/, i.e. a checkout reached
 *  through a convenience link, and the CLI's path through it. */
async function linked(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-symlink-"));
  roots.push(root);
  await symlink(dirname(cliPath), join(root, "src"), "dir");
  return join(root, "src", "cli.ts");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("invoked through a symlinked path the CLI runs, byte for byte as through the real one", async () => {
  const through = await linked();
  const symlinked = await piped([through, "--help"], process.env);
  const real = await piped([cliPath, "--help"], process.env);
  expect(real.stdout.length).toBeGreaterThan(0);
  expect(symlinked.stdout.toString("utf8")).toBe(real.stdout.toString("utf8"));
  expect(symlinked.stderr.toString("utf8")).toBe("");
  expect(symlinked.code).toBe(0);
}, BOUNDARY_MS);

test("imported through that same symlinked path the CLI does not run main", async () => {
  const through = await linked();
  const harness = join(dirname(dirname(through)), "harness.mjs");
  await writeFile(harness, [
    `await import(${JSON.stringify(through)});`,
    "process.stdout.write(\"imported\");",
    "",
  ].join("\n"));
  const result = await piped([harness], process.env);
  // main() with no arguments prints usage to stderr and exits 2; silence on
  // stderr and a plain 0 is the proof that nothing but the import happened.
  expect(result.stdout.toString("utf8")).toBe("imported");
  expect(result.stderr.toString("utf8")).toBe("");
  expect(result.code).toBe(0);
}, BOUNDARY_MS);
