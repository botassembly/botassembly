import { spawn } from "node:child_process";
import { chmod, chown, cp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { initializeInstallation, readInstallation } from "../src/home-installation.ts";
import { tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function secureHome(root: string, name: string): Promise<string> {
  const home = join(root, name);
  await mkdir(home, { mode: 0o700 });
  return home;
}

async function aliasedHome(root: string, length: number): Promise<{ canonical: string; lexical: string }> {
  const target = join(root, "target");
  await mkdir(target, { mode: 0o700 });
  const canonical = await secureHome(target, "home");
  let lexical = root, index = 0;
  while (length - Buffer.byteLength(lexical) - 6 > 200) {
    const prefix = `alias-${String(index)}-`, name = `${prefix}${"x".repeat(200 - prefix.length)}`;
    await symlink(target, join(index === 0 ? root : target, name));
    lexical = join(lexical, name); index += 1;
  }
  const finalLength = length - Buffer.byteLength(lexical) - 6;
  const name = `z${"x".repeat(finalLength - 1)}`;
  await symlink(target, join(target, name));
  return { canonical, lexical: join(lexical, name, "home") };
}

function boundary(root: string): { held: CliBoundary; out: Buffer[]; err: Buffer[] } {
  const out: Buffer[] = [], err: Buffer[] = [];
  return { out, err, held: { cwd: root, env: {}, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { out.push(Buffer.from(bytes)); },
    stderr: (bytes) => { err.push(Buffer.from(bytes)); }, clock: { milliseconds: () => 0,
      timestamp: () => "2026-09-06T12:00:00.000Z", setTimeout, clearTimeout } } };
}

test("a long stable lexical alias initializes the canonical home", async () => {
  const { root } = await roots.scratch("bot-home-alias-bound-");
  const { canonical, lexical } = await aliasedHome(root, 4_025);
  expect(Buffer.byteLength(lexical)).toBe(4_025);
  const initialized = await initializeInstallation(lexical);
  expect(initialized.installationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  expect(await readdir(canonical)).toEqual(["installation.json"]);
});

test("a short lexical alias succeeds and remains the reported home", async () => {
  const { root } = await roots.scratch("bot-home-alias-short-"), target = join(root, "target");
  await mkdir(target, { mode: 0o700 });
  const canonical = await secureHome(target, "home"), alias = join(root, "short");
  await symlink(target, alias);
  const lexical = join(alias, "home");
  const initialized = await initializeInstallation(lexical);
  const shown = boundary(root);
  expect(await main(["home", "show", "--home", lexical, "-j"], shown.held)).toBe(0);
  expect(JSON.parse(Buffer.concat(shown.out).toString())).toMatchObject({ data: { home: lexical, installationId: initialized.installationId } });
  expect(await readdir(canonical)).toEqual(["installation.json"]);
});

test.each([
  ["invalid UTF-8", Buffer.from([0xff, 0x0a])],
  ["a byte-order mark", Buffer.from(`\uFEFF{"schemaVersion":1}\n`)],
] as const)("%s is rejected without changing stored bytes", async (_name, bytes) => {
  const { root } = await roots.scratch("bot-home-encoding-");
  const home = await secureHome(root, "home"), record = join(home, "installation.json");
  await writeFile(record, bytes, { mode: 0o600 });
  await expect(readInstallation(home)).rejects.toMatchObject({ exit: 5, published: false });
  await expect(initializeInstallation(home)).rejects.toMatchObject({ exit: 5, published: false });
  expect(await readFile(record)).toEqual(bytes);
});

test("a wrong-owner record is rejected where the platform permits the fixture", async () => {
  if (typeof process.geteuid !== "function" || typeof process.getegid !== "function") return;
  const { root } = await roots.scratch("bot-home-owner-");
  const home = await secureHome(root, "home");
  await initializeInstallation(home);
  const record = join(home, "installation.json"), owner = process.geteuid() + 1;
  const changed = await chown(record, owner, process.getegid()).then(() => true, () => false);
  if (!changed) return;
  await expect(readInstallation(home)).rejects.toMatchObject({ exit: 5, causeCode: "record-insecure" });
  await expect(initializeInstallation(home)).rejects.toMatchObject({ exit: 5, causeCode: "record-insecure" });
  expect((await stat(record)).uid).toBe(owner);
});

test.each(["home", "record"] as const)("a copied home with broad %s mode is rejected without repair", async (part) => {
  const { root } = await roots.scratch("bot-home-copy-mode-");
  const source = await secureHome(root, "source");
  await initializeInstallation(source);
  const copied = join(root, "copied");
  await cp(source, copied, { recursive: true, preserveTimestamps: true });
  await chmod(copied, part === "home" ? 0o755 : 0o700);
  await chmod(join(copied, "installation.json"), part === "record" ? 0o644 : 0o600);
  await expect(readInstallation(copied)).rejects.toMatchObject({ exit: 5 });
  await expect(initializeInstallation(copied)).rejects.toMatchObject({ exit: 5 });
  expect((await stat(part === "home" ? copied : join(copied, "installation.json"))).mode & 0o777)
    .toBe(part === "home" ? 0o755 : 0o644);
});

function child(home: string) {
  const file = fileURLToPath(new URL("./home-initializer-child.ts", import.meta.url));
  const running = spawn(process.execPath, [file, home], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  if (running.stdout === null || running.stderr === null) throw new Error("The identity child has no output pipes.");
  let stdout = "", stderr = "";
  running.stdout.on("data", (bytes: Buffer) => { stdout += bytes.toString(); });
  running.stderr.on("data", (bytes: Buffer) => { stderr += bytes.toString(); });
  const ready = new Promise<void>((resolve) => { running.once("message", () => { resolve(); }); });
  const settled = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    running.once("exit", (code) => { resolve({ code, stdout, stderr }); });
  });
  return { process: running, ready, settled };
}

test("two barrier-synchronized processes initialize one absent home", async () => {
  const { root } = await roots.scratch("bot-home-process-race-");
  const home = join(root, "home"), first = child(home), second = child(home);
  await Promise.all([first.ready, second.ready]);
  first.process.send("release"); second.process.send("release");
  const results = await Promise.all([first.settled, second.settled]);
  expect(results.map(({ code }) => code)).toEqual([0, 0]);
  expect(results.map(({ stderr }) => stderr)).toEqual(["", ""]);
  const ids = results.map(({ stdout }) => (JSON.parse(stdout) as { installationId: string }).installationId);
  expect(ids[1]).toBe(ids[0]);
  expect(JSON.parse(await readFile(join(home, "installation.json"), "utf8"))).toMatchObject({ data: { id: ids[0] } });
  expect((await readdir(home)).filter((name) => name !== "installation.json")).toEqual([]);
});

test("the shared identity fixture attributes its prerequisite to ticket 0055", async () => {
  const source = await readFile(fileURLToPath(new URL("./initialized-cli.ts", import.meta.url)), "utf8");
  expect(source).toContain("Ticket 0055 changed every new run fixture's prerequisite.");
  expect(source).not.toContain("Ticket 0032 changed every new run fixture's prerequisite.");
});
