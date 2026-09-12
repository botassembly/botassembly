// `bot assembly install` must not publish a tree until its copy is complete:
// a process killed during the copy leaves the name as it found it (absent here),
// rather than an assembly a later run could seal and execute.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { cleanup, scratch, tree } from "./assembly-home.ts";

afterEach(cleanup);

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const FILLER = 4000;

async function bulky(root: string): Promise<string> {
  await tree(root, "Review.");
  await mkdir(join(root, "filler"), { recursive: true });
  await Promise.all(Array.from({ length: FILLER }, (_, index) =>
    writeFile(join(root, "filler", `f${String(index).padStart(5, "0")}.txt`), `${String(index)}\n`)));
  return root;
}

/** The progress marker: -1 is no tree (or no filler directory) at this path. */
function filler(path: string): number {
  try {
    return readdirSync(join(path, "filler")).length;
  } catch {
    return -1;
  }
}

// The staged name and its layout are deliberately not known to this test. It
// finds a tree midway through copying anywhere below `assemblies/`.
function partialCopy(path: string): string | undefined {
  const copied = filler(path);
  if (copied >= 0 && copied !== FILLER) return path;
  if (copied === FILLER) return undefined;
  try {
    return readdirSync(path).map((entry) => partialCopy(join(path, entry))).find((found) => found !== undefined);
  } catch {
    return undefined;
  }
}

test("a SIGKILL during install never publishes a partial assembly at its final name", async () => {
  const held = await scratch("bot-assembly-install-kill-");
  const source = await bulky(join(held.root, "source"));
  const env = { ...process.env, BOT_HOME: held.home, XDG_CACHE_HOME: join(held.root, "cache") };
  const assemblies = join(held.home, "assemblies");
  const target = join(assemblies, "review");
  const child = spawn("node", [CLI, "assembly", "install", source, "--name", "review"], {
    env, cwd: held.root, stdio: "ignore",
  });
  const deadline = Date.now() + 60_000;
  let caught = "";
  while (Date.now() < deadline) {
    const copying = existsSync(assemblies) ? partialCopy(assemblies) : undefined;
    if (copying !== undefined) {
      caught = copying;
      child.kill("SIGKILL");
      break;
    }
    if (child.exitCode !== null) break;
  }
  if (child.exitCode === null) await new Promise<void>((resolve) => { child.once("exit", () => { resolve(); }); });

  // The kill was inside a real recursive copy, not before the command began or
  // after it had already published the complete assembly.
  expect(caught, "the install finished before it could be interrupted").not.toBe("");
  expect(child.signalCode).toBe("SIGKILL");
  expect(existsSync(target), "the final assembly name holds a partial copy").toBe(false);
}, 60_000);
