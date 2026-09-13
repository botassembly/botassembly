// A repeated install is a separate-process contract. The second process must
// refuse before it changes the first copy, and its refusal must be visible.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { cleanup, scratch, tree } from "./assembly-home.ts";
import { BOUNDARY_MS, CHILD_MS } from "./boundary.ts";

afterEach(cleanup);

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

interface ProcessResult { code: number | null; signal: NodeJS.Signals | null; out: string; err: string }

function invoke(cwd: string, home: string, args: string[]): Promise<ProcessResult> {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, BOT_HOME: home, PWD: cwd, XDG_CACHE_HOME: join(cwd, "cache") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out: Buffer[] = [], err: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => { out.push(Buffer.from(chunk)); });
  child.stderr.on("data", (chunk: Buffer) => { err.push(Buffer.from(chunk)); });
  return new Promise((resolve, reject) => {
    let failure: unknown;
    const guard = setTimeout(() => { child.kill("SIGKILL"); }, CHILD_MS);
    const onError = (error: Error): void => {
      failure = error;
      child.kill("SIGKILL");
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(guard);
      child.removeListener("error", onError);
      if (failure !== undefined) reject(failure instanceof Error ? failure : new Error("CLI child failed to spawn."));
      else resolve({ code, signal, out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString() });
    };
    child.once("error", onError);
    child.once("close", onClose);
  });
}

async function hasInstallResidue(path: string): Promise<boolean> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith(".bot-install-")) return true;
    if (entry.isDirectory() && await hasInstallResidue(join(path, entry.name))) return true;
  }
  return false;
}

test("sequential install collision refuses in a real second process and preserves the first copy", async () => {
  const held = await scratch("bot-assembly-install-collision-");
  const source = await tree(join(held.root, "review"), "Original.");
  const first = await invoke(held.root, held.home, ["assembly", "install", source]);
  expect(first.code).toBe(0);
  expect(first.signal).toBeNull();
  expect(first.out).toBe(`review  installed  from ${source}\n`);
  expect(first.err).toBe("");

  const installed = join(held.home, "assemblies", "review");
  const before = await readFile(join(installed, "ASSEMBLY.md"));
  const provenance = await readFile(join(installed, ".bot-source"));
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nChanged.\n");

  const second = await invoke(held.root, held.home, ["assembly", "install", source]);
  expect(second.code).toBe(2);
  expect(second.signal).toBeNull();
  expect(second.out).toBe("");
  expect(second.err).toBe("request-invalid  review\n  Remove the assembly of that name first; install never overwrites.\n");
  await expect(readFile(join(installed, "ASSEMBLY.md"))).resolves.toEqual(before);
  await expect(readFile(join(installed, ".bot-source"))).resolves.toEqual(provenance);
  expect(existsSync(installed)).toBe(true);
  expect(await hasInstallResidue(join(held.home, "assemblies"))).toBe(false);
}, BOUNDARY_MS);
