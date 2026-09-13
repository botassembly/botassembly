// A throwaway bot home and the injected CliBoundary that drives it, for the
// tests that exercise `bot assembly` end to end through main(). One copy keeps
// the management and liveness legs on the same injected boundary.
//
// Nothing here touches the real `~/.pi`, `~/.cache` or `~/.local/share`: every
// home is an mkdtemp under the OS temp directory, and the boundary's env pins
// BOT_HOME and XDG_CACHE_HOME inside it.
//
// The `roots` and `locks` registers are module state, which is safe because
// vitest isolates each test file in its own fork — two files never share this
// module instance. Each file calls `afterEach(cleanup)`.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import type { DriverClock } from "../src/process.ts";
import { printedLines } from "./invoke.ts";

const roots: string[] = [];
const locks: (() => void)[] = [];

const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => "2026-08-02T12:00:00.000Z",
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

/** A lock this test holds, to be released before its tree is removed. */
export function holdLock(release: () => void): void {
  locks.push(release);
}

export async function cleanup(): Promise<void> {
  // Released before the tree goes: proper-lockfile refreshes a held lock's
  // mtime on a timer and takes the compromise path once the file has vanished.
  for (const release of locks.splice(0)) release();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export interface Capture { out: Buffer[]; err: Buffer[] }

export function boundaryFor(root: string, home: string, capture: Capture, env: NodeJS.ProcessEnv = {}): CliBoundary {
  return {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache"), ...env },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { capture.out.push(Buffer.from(bytes)); },
    stderr: (bytes) => { capture.err.push(Buffer.from(bytes)); },
    clock,
  };
}

export function text(chunks: Buffer[]): string {
  return Buffer.concat(chunks).toString();
}

/** A minimal well-formed assembly tree at `root` — what `bot check` accepts. */
export async function tree(root: string, purpose: string): Promise<string> {
  await mkdir(join(root, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), `---\nintelligence: default\n---\n${purpose}\n`),
    writeFile(join(root, "flows", "main", "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(root, "flows", "main", "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  return root;
}

export async function scratch(prefix: string): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(join(home, "assemblies"), { recursive: true });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  return { root, home };
}

/** Run one invocation, assert its exit code, and take stdout as lines. */
export async function lines(argv: string[], boundary: CliBoundary, capture: Capture, expected: number): Promise<string[]> {
  await expect(main(argv, boundary)).resolves.toBe(expected);
  const out = text(capture.out);
  capture.out.length = 0;
  return out.length === 0 ? [] : printedLines(out.slice(0, -1).split("\n"));
}
