import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { closeSync, existsSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { BOUNDARY_MS, cliPath, piped } from "./boundary.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(kind: "success" | "failure"): Promise<{ root: string; home: string; script: string }> {
  const root = await mkdtemp(join(tmpdir(), `bot-ordinary-${kind}-`)), home = join(root, "home");
  roots.push(root);
  await mkdir(join(home, "assemblies", "review", "flows", "main"), { recursive: true });
  await chmod(home, 0o700);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies", "review", "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(home, "assemblies", "review", "flows", "main", "01-work.md"), "---\nretries: 0\n---\nWork.\n"),
  ]);
  const script = join(root, "script.json");
  const response = kind === "success"
    ? [[{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }], "done"]
    : [[{ type: "toolCall", id: "fault", name: "fault", arguments: { reason: "broken" } }]];
  await writeFile(script, JSON.stringify(response));
  return { root, home, script };
}

const args = (script: string): string[] => [cliPath, "run", "start", "review/main", "request", "--script", script, "-j"];

test.each(["success", "failure"] as const)("a real %s run delivers one bounded structured result", async (kind) => {
  const held = await fixture(kind);
  const result = await piped(args(held.script), { ...process.env, BOT_HOME: held.home, XDG_CACHE_HOME: join(held.root, "cache") });
  const document = JSON.parse(result.stdout.toString()) as { kind: string; data: { cause: string; exit: number } };
  expect(document.kind).toBe("bot.run.result");
  expect(document.data.exit).toBe(result.code);
  expect(result.stdout.length).toBeLessThanOrEqual(65_536);
  expect(result.stderr).toEqual(Buffer.alloc(0));
}, BOUNDARY_MS);

test.skipIf(!existsSync("/dev/full")).each(["success", "failure"] as const)(
  "a real %s run keeps exit precedence under ordinary stdout failure", async (kind) => {
    const held = await fixture(kind), full = openSync("/dev/full", "w"), errors: Buffer[] = [];
    const child = spawn(process.execPath, args(held.script), {
      env: { ...process.env, BOT_HOME: held.home, XDG_CACHE_HOME: join(held.root, "cache") }, stdio: ["ignore", full, "pipe"],
    });
    closeSync(full);
    child.stderr?.on("data", (bytes: Buffer) => { errors.push(bytes); });
    const code = await new Promise<number | null>((resolve) => { child.once("close", resolve); });
    expect(code).toBe(kind === "success" ? 1 : 2);
    expect(Buffer.concat(errors).toString()).toBe("Bot failed during stdout delivery (ENOSPC).\n");
  }, BOUNDARY_MS,
);

test.each(["success", "failure"] as const)("a real %s run keeps exit precedence when its reader closes early", async (kind) => {
  const held = await fixture(kind), errors: Buffer[] = [];
  const child = spawn(process.execPath, args(held.script), {
    env: { ...process.env, BOT_HOME: held.home, XDG_CACHE_HOME: join(held.root, "cache") }, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.destroy();
  child.stderr.on("data", (bytes: Buffer) => { errors.push(bytes); });
  const code = await new Promise<number | null>((resolve) => { child.once("close", resolve); });
  expect(code).toBe(kind === "success" ? 0 : 2);
  expect(Buffer.concat(errors)).toEqual(Buffer.alloc(0));
}, BOUNDARY_MS);
