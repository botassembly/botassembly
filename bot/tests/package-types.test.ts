import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";
import { runtimeTreeIdentity } from "../src/runtime-provenance.ts";

const run = promisify(execFile);
const git = (args: string[], cwd: string) => run("git", args, { cwd });
const BOT = join(import.meta.dirname, "..");
const roots: string[] = [];

const targets = {
  "./admin-readings": ["./types/public-admin-readings.d.ts", "./dist/public-admin-readings.js"],
  "./inspection": ["./types/public-inspection.d.ts", "./dist/public-inspection.js"],
  "./mutation-readings": ["./types/public-mutation-readings.d.ts", "./dist/public-mutation-readings.js"],
  "./one-run": ["./types/one-run.d.ts", "./dist/one-run.js"],
  "./record-lines": ["./types/record-lines.d.ts", "./dist/record-lines.js"],
  "./run-readings": ["./types/public-run-readings.d.ts", "./dist/public-run-readings.js"],
  "./session": ["./types/session.d.ts", "./dist/session.js"],
} as const;
type Manifest = { exports: Record<string, { types?: string; default?: string }> };
let root = "", packageRoot = "", consumer = "", consumerCache = "", installed = "", tarball = "";
let packedFiles: string[] = [], bundledPackages: string[] = [];

function exportFault(manifest: Manifest): string | undefined {
  for (const [path, [types, runtime]] of Object.entries(targets)) {
    const held = manifest.exports[path];
    if (held?.types !== types || held.default !== runtime) return `${path} does not name ${types} before ${runtime}`;
  }
  return undefined;
}

async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path));
    else found.push(path);
  }
  return found.sort();
}

async function digest(directory: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of await files(directory)) hash.update(relative(directory, path)).update("\0").update(await readFile(path));
  return hash.digest("hex");
}

async function installedPackage(root: string, owner: string, name: string): Promise<string | undefined> {
  let directory = join(root, owner);
  while (directory.startsWith(root)) {
    const candidate = join(directory, "node_modules", name);
    if (await stat(join(candidate, "package.json")).then(() => true, () => false)) return relative(root, candidate);
    if (directory === root) break;
    directory = dirname(directory);
  }
  return undefined;
}

async function bundleClosure(root: string, direct: string[]): Promise<string[]> {
  const found = new Set<string>(), pending = direct.map((name) => ({ owner: "", name, optional: false }));
  while (pending.length > 0) {
    const next = pending.shift();
    if (next === undefined) break;
    const path = await installedPackage(root, next.owner, next.name);
    if (path === undefined) {
      if (next.optional) continue;
      throw new Error(`missing installed dependency ${next.name} from ${next.owner || "package root"}`);
    }
    if (found.has(path)) continue;
    found.add(path);
    const manifest = JSON.parse(await readFile(join(root, path, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
    };
    const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));
    for (const name of new Set([...Object.keys(manifest.dependencies ?? {}), ...optional])) {
      pending.push({ owner: path, name, optional: optional.has(name) });
    }
  }
  return [...found].sort();
}

function declarationValues(source: string): string[] {
  const direct = [...source.matchAll(/^export declare (?:class|const|function) ([A-Za-z_$][\w$]*)/gmu)].map((match) => match[1] ?? "");
  const listed = [...source.matchAll(/^export \{ ([^}]+) \}/gmu)].flatMap((match) => (match[1] ?? "").split(", "))
    .filter((name) => !name.startsWith("type ")).map((name) => name.split(" as ").at(-1) ?? "");
  return [...direct, ...listed].sort();
}

function commandError(reason: unknown): Error {
  if (typeof reason !== "object" || reason === null) return new Error(String(reason));
  const stdout = "stdout" in reason && typeof reason.stdout === "string" ? reason.stdout : "";
  const stderr = "stderr" in reason && typeof reason.stderr === "string" ? reason.stderr : "";
  return new Error(`${stdout}\n${stderr}`);
}

function allowedArtifact(path: string): boolean {
  return path === "package.json" || path === "npm-shrinkwrap.json" || path === "README.md" || path === "LICENSE"
    || path.startsWith("dist/") || path.startsWith("types/") || path.startsWith("node_modules/");
}

function assertArtifactInventory(): void {
  expect(packedFiles).toContain("package.json");
  expect(packedFiles).toContain("npm-shrinkwrap.json");
  expect(packedFiles.some((path) => path.startsWith("dist/") && path.endsWith(".js"))).toBe(true);
  expect(packedFiles.some((path) => path.startsWith("types/") && path.endsWith(".d.ts"))).toBe(true);
  for (const refused of ["package-lock.json", "src/", ".map", "tests/", "scripts/", "tsconfig", "eslint.config", "vitest.config"]) {
    expect(packedFiles.some((path) => path === refused || path.startsWith(refused)), refused).toBe(false);
  }
  expect(packedFiles.some((path) => !path.startsWith("node_modules/") && path.endsWith(".map"))).toBe(false);
  for (const path of packedFiles) expect(allowedArtifact(path), path).toBe(true);
}

function assertBundleClosure(): void {
  for (const packagePath of bundledPackages) expect(packedFiles).toContain(`${packagePath}/package.json`);
  for (const path of packedFiles.filter((held) => held.startsWith("node_modules/"))) {
    expect(bundledPackages.some((packagePath) => path === packagePath || path.startsWith(`${packagePath}/`)), path).toBe(true);
  }
}

async function assertArtifactTargets(): Promise<void> {
  expect(await readFile(join(installed, "npm-shrinkwrap.json"))).toEqual(await readFile(join(BOT, "npm-shrinkwrap.json")));
  for (const [types, runtime] of Object.values(targets)) {
    await expect(stat(join(installed, types))).resolves.toBeDefined();
    await expect(stat(join(installed, runtime))).resolves.toBeDefined();
  }
  await expect(stat(join(installed, "dist", "cli.js"))).resolves.toBeDefined();
}

beforeAll(async () => {
  root = await mkdtemp(join(dirname(BOT), ".bot-package-types-"));
  roots.push(root);
  packageRoot = join(root, "package");
  await mkdir(packageRoot);
  for (const name of ["src", "scripts", "package.json", "npm-shrinkwrap.json", "tsconfig.json", "tsconfig.package.json"]) {
    await cp(join(BOT, name), join(packageRoot, name), { recursive: true });
  }
  await run("npm", ["ci", "--ignore-scripts", "--offline"], { cwd: packageRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  bundledPackages = await bundleClosure(packageRoot, Object.keys(manifest.dependencies));
  const packed = JSON.parse((await run("npm", ["pack", "--json"], { cwd: packageRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
  tarball = join(packageRoot, packed[0]?.filename ?? "");
  packedFiles = (packed[0]?.files ?? []).map(({ path }) => path).sort();
  consumer = join(root, "consumer");
  await mkdir(consumer);
  consumerCache = join(root, "consumer-cache");
  await mkdir(consumerCache);
  expect(await readdir(consumerCache)).toEqual([]);
  await writeFile(join(consumer, "package.json"), '{"name":"outside","private":true,"type":"module"}\n');
  const npmEnvironment = { ...process.env, npm_config_cache: consumerCache };
  expect((await run("npm", ["--version"], { env: npmEnvironment, encoding: "utf8" })).stdout.trim()).toBe("10.9.8");
  await run("npm", ["install", "--ignore-scripts", "--offline", "--package-lock=false", tarball], {
    cwd: consumer, env: npmEnvironment, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  installed = join(consumer, "node_modules", "bot");
}, 180_000);

afterAll(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("all public paths select generated declarations before the source runtime", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as Manifest;
  expect(exportFault(manifest)).toBeUndefined();
  for (const [path, [types, runtime]] of Object.entries(targets)) {
    expect(Object.keys(manifest.exports[path] ?? {}), path).toEqual(["types", "default"]);
    expect(manifest.exports[path], path).toStrictEqual({ types, default: runtime });
  }
  for (const [path, [types, runtime]] of Object.entries(targets)) {
    const missingTypes = structuredClone(manifest);
    delete missingTypes.exports[path]?.types;
    expect(exportFault(missingTypes)).toBe(`${path} does not name ${types} before ${runtime}`);
    const sourceRuntime = structuredClone(manifest);
    if (sourceRuntime.exports[path]) sourceRuntime.exports[path].default = runtime.replace("./dist/", "./src/").replace(/\.js$/u, ".ts");
    expect(exportFault(sourceRuntime)).toBe(`${path} does not name ${types} before ${runtime}`);
  }
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { bin: { bot: string } };
  expect(packageJson.bin.bot).toBe("dist/cli.js");
});

test("the packed artifact contains only the declared package surface and bundled dependencies", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
    dependencies: Record<string, string>; bundleDependencies: string[];
  };
  expect(manifest.bundleDependencies).toEqual(Object.keys(manifest.dependencies));
  assertArtifactInventory();
  assertBundleClosure();
  await assertArtifactTargets();
});

test("plain Node imports every path and runtime values match declaration values", async () => {
  const expected: Record<string, string[]> = {};
  for (const [path, [declaration]] of Object.entries(targets)) expected[path.slice(2)] = declarationValues(await readFile(join(installed, declaration), "utf8"));
  const script = join(consumer, "imports.mjs");
  await writeFile(script, `
const expected = ${JSON.stringify(expected)};
for (const [path, names] of Object.entries(expected)) {
  const namespace = await import("bot/" + path);
  const actual = Object.keys(namespace).sort();
  if (JSON.stringify(actual) !== JSON.stringify(names)) throw new Error(path + " values differ: " + actual.join(","));
  for (const privateName of ["lockRun", "inspectPrune", "runCommand", "runOperation", "resumeOperation", "manage", "dispatchNewCommand", "commandReading", "configuredModelRuntime", "createProcessGroups"]) {
    if (privateName in namespace) throw new Error(path + " exposed " + privateName);
  }
}
for (const path of ["src/cli.ts", "dist/cli.js", "types/session.d.ts", "missing"]) {
  await import("bot/" + path).then(
    () => { throw new Error("undeclared path imported: " + path); },
    (reason) => { if (reason?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw reason; },
  );
}
`);
  await expect(run(process.execPath, [script], { cwd: consumer, encoding: "utf8" })).resolves.toBeDefined();
});

test("strict NodeNext and Bundler consumers resolve every value, named type, and the bundled Node types", async () => {
  expect(await stat(join(consumer, "node_modules", "@types", "node")).then(() => true, () => false)).toBe(false);
  expect(await stat(join(installed, "node_modules", "@types", "node", "index.d.ts")).then(() => true, () => false)).toBe(true);
  await writeFile(join(consumer, "consumer.ts"), `
import { capabilitiesReading, homeShowReading } from "bot/admin-readings";
import { inspectStatus, promptConstruction } from "bot/inspection";
import type { InspectionResult } from "bot/inspection";
import { assemblyInstallReading, MUTATION_FINAL_SETTLEMENT_MS } from "bot/mutation-readings";
import type { RunResumeReadingOptions, RunStartReadingOptions } from "bot/mutation-readings";
import { inspectSession, openRunDirectory } from "bot/one-run";
import type { LogsQuery, SelectedOutput } from "bot/one-run";
import { field, heldRecord } from "bot/record-lines";
import type { HeldRecord } from "bot/record-lines";
import { inspectRunList, parseRunList, runShowReading } from "bot/run-readings";
import type { CliFailure, RunListQuery, RunListResult } from "bot/run-readings";
import { renderSession, settledSessionTools } from "bot/session";
import type { SettledTool } from "bot/session";
const env: NodeJS.ProcessEnv = {};
const bytes: Buffer = Buffer.from("proof");
const result: Awaited<ReturnType<typeof homeShowReading>> | undefined = undefined;
void [capabilitiesReading, inspectStatus, promptConstruction, assemblyInstallReading, MUTATION_FINAL_SETTLEMENT_MS,
  inspectSession, openRunDirectory, field, heldRecord, inspectRunList, parseRunList, runShowReading, renderSession,
  settledSessionTools, env, bytes, result];
type Named = InspectionResult | RunResumeReadingOptions | RunStartReadingOptions | LogsQuery | SelectedOutput |
  HeldRecord | CliFailure | RunListQuery | RunListResult | SettledTool;
const named: Named | undefined = undefined;
void named;
// @ts-expect-error undeclared source subpaths stay unavailable
await import("bot/src/cli.ts");
// @ts-expect-error private values stay unavailable
const { lockRun } = await import("bot/inspection");
void lockRun;
`);
  const compiler = join(BOT, "node_modules", "typescript", "bin", "tsc");
  for (const [module, resolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]] as const) {
    const config = join(consumer, `tsconfig-${resolution}.json`);
    await writeFile(config, JSON.stringify({ compilerOptions: {
      target: "ES2022", module, moduleResolution: resolution, strict: true, skipLibCheck: false,
      types: [], noEmit: true, exactOptionalPropertyTypes: true,
    }, files: ["consumer.ts"] }));
    const checked = await run(process.execPath, [compiler, "-p", config, "--traceResolution"], { cwd: consumer, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .catch((reason: unknown) => { throw commandError(reason); });
    expect(checked.stdout).toContain(join("node_modules", "bot", "node_modules", "@types", "node", "index.d.ts"));
  }
}, 60_000);

test("package builds are clean, complete, portable, and byte-identical", async () => {
  await Promise.all([rm(join(packageRoot, "dist"), { recursive: true, force: true }), rm(join(packageRoot, "types"), { recursive: true, force: true })]);
  await run("npm", ["--prefix", packageRoot, "run", "build"]);
  const first = [await digest(join(packageRoot, "dist")), await digest(join(packageRoot, "types"))];
  for (const [declaration] of Object.values(targets)) {
    const source = await readFile(join(packageRoot, declaration), "utf8");
    expect(source.startsWith('/// <reference path="../node_modules/@types/node/index.d.ts" />\n')).toBe(true);
    expect(source.slice(source.indexOf("\n") + 1)).not.toMatch(/["']\.\.?\/[^"']*\.ts["']/u);
  }
  for (const path of (await files(join(packageRoot, "dist"))).filter((held) => held.endsWith(".js"))) {
    const source = (await readFile(path, "utf8")).replace('"./cli.ts"', '"./cli.js"');
    expect(source, relative(packageRoot, path)).not.toMatch(/["']\.\.?\/[^"']*\.ts["']/u);
  }
  expect(await readFile(join(packageRoot, "src", "mutation-child.ts"), "utf8")).toContain('import.meta.url.endsWith(".ts") ? "./cli.ts" : "./cli.js"');
  expect(await readFile(join(packageRoot, "dist", "mutation-child.js"), "utf8")).toContain('? "./cli.ts" : "./cli.js"');
  expect((await files(join(packageRoot, "dist"))).some((path) => path.endsWith(".map"))).toBe(false);
  await run("npm", ["--prefix", packageRoot, "run", "build"]);
  expect([await digest(join(packageRoot, "dist")), await digest(join(packageRoot, "types"))]).toEqual(first);
  const selfReference = `await Promise.all(${JSON.stringify(Object.keys(targets))}.map((path) => import("bot/" + path.slice(2))));`;
  await expect(run(process.execPath, ["--input-type=module", "--eval", selfReference], { cwd: packageRoot })).resolves.toBeDefined();
});

test("a clean make install builds declarations after npm ci", async () => {
  const copy = join(root, "clean-bot");
  await mkdir(copy);
  for (const name of ["src", "scripts", "package.json", "npm-shrinkwrap.json", "tsconfig.json", "tsconfig.package.json", "Makefile"]) {
    await cp(join(BOT, name), join(copy, name), { recursive: true });
  }
  await run("make", ["install"], { cwd: copy, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  for (const [declaration, runtime] of Object.values(targets)) {
    await expect(stat(join(copy, declaration))).resolves.toBeDefined();
    await expect(stat(join(copy, runtime))).resolves.toBeDefined();
  }
}, 180_000);

test("a local Git dependency receives runtime, declarations, exports, and bin from prepare", async () => {
  const repository = join(root, "git-package"), dependent = join(root, "git-dependent");
  await mkdir(repository);
  for (const name of ["src", "scripts", "package.json", "npm-shrinkwrap.json", "tsconfig.json", "tsconfig.package.json"]) {
    await cp(join(BOT, name), join(repository, name), { recursive: true });
  }
  await git(["init", "--quiet"], repository);
  await git(["config", "user.email", "package-proof@example.invalid"], repository);
  await git(["config", "user.name", "Package Proof"], repository);
  await git(["add", "."], repository);
  await git(["commit", "--quiet", "-m", "Create package fixture"], repository);
  await mkdir(dependent);
  await writeFile(join(dependent, "package.json"), '{"name":"git-dependent","private":true,"type":"module"}\n');
  await run("npm", ["install", "--offline", "--package-lock=false", `git+file://${repository}`], { cwd: dependent, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const received = join(dependent, "node_modules", "bot");
  await expect(stat(join(received, "dist", "cli.js"))).resolves.toBeDefined();
  await expect(stat(join(received, "types", "session.d.ts"))).resolves.toBeDefined();
  await expect(stat(join(dependent, "node_modules", ".bin", "bot"))).resolves.toBeDefined();
  await expect(run(process.execPath, ["--input-type=module", "--eval", 'await import("bot/session")'], { cwd: dependent })).resolves.toBeDefined();
}, 180_000);

test("the installed bin starts and resumes a scripted run with artifact provenance", async () => {
  const home = join(root, "home"), assembly = join(root, "assembly"), flow = join(assembly, "flows", "main");
  await mkdir(flow, { recursive: true });
  await mkdir(home, { mode: 0o700 });
  await chmod(home, 0o700);
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  await writeFile(join(assembly, "ASSEMBLY.md"), "---\nintelligence: default\n---\nPackage proof.\n");
  await writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n");
  await writeFile(join(flow, "01-work.md"), "---\n---\nFinish the scripted stage.\n");
  const script = join(root, "script.json"), firstId = join(root, "first-id"), secondId = join(root, "second-id");
  await writeFile(script, '[[{"type":"toolCall","id":"write-1","name":"write","arguments":{"path":"$OUTPUT","content":"done"}}],"done"]\n');
  const cli = join(consumer, "node_modules", ".bin", "bot");
  const environment = { ...process.env, OPENAI_API_KEY: "package-proof-not-a-credential", BOT_HOME: home, HOME: root, XDG_CACHE_HOME: join(root, "cache"), PI_CODING_AGENT_DIR: join(root, "pi-agent") };
  await mkdir(environment.PI_CODING_AGENT_DIR, { recursive: true });
  const invoke = (args: string[]) => run(cli, args, { cwd: root, env: environment, encoding: "utf8" })
    .catch((reason: unknown) => { throw commandError(reason); });
  await invoke(["run", "start", `${assembly}/main`, "request", "--json", "--script", script, "--id-file", firstId]);
  const first = (await readFile(firstId, "utf8")).trim();
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: openai, model: gpt-4, reasoning: medium }\n");
  await invoke(["run", "resume", first, "--json", "--id-file", secondId]);
  const second = (await readFile(secondId, "utf8")).trim();
  const lockSha256 = createHash("sha256").update(await readFile(join(installed, "npm-shrinkwrap.json"))).digest("hex");
  const starts = await Promise.all([first, second].map(async (name) => (await readFile(join(home, "runs", name, "record.jsonl"), "utf8"))
    .split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>).find((event) => event["event"] === "run_start")));
  expect(starts[0]).toMatchObject({ runtime_source: "unknown", runtime_digest: null, lock_sha256: lockSha256, node: process.version });
  expect(starts[1]).toMatchObject({ runtime_source: "unknown", runtime_digest: null, lock_sha256: lockSha256, node: process.version });
  expect(starts[0]?.["runtime_tree_sha256"]).toBe(starts[1]?.["runtime_tree_sha256"]);
  expect(starts[0]?.["runtime_tree_sha256"]).toBe(await runtimeTreeIdentity(installed, "dist"));
  expect(starts[0]?.["provider_adapter"]).toMatch(/^@earendil-works\/pi-ai@/u);
}, 60_000);
