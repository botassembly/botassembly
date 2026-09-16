import { spawn, spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import {
  assemblyInstallDocument, assemblyInstallReading, assemblyLinkDocument, assemblyLinkReading,
  assemblyRemoveDocument, assemblyRemoveReading, assemblyUpdateDocument, assemblyUpdateReading,
  authImportDocument, authImportReading, authLoginDocument, authLoginReading, authLogoutDocument,
  authLogoutReading, runResumeDocument, runResumeReading, runStartDocument, runStartReading,
  type DocumentReading,
} from "../src/public-mutation-readings.ts";
import { settleCommand } from "../src/cli-boundary.ts";
import { BOUNDARY_MS, CHILD_MS } from "./boundary.ts";

const roots: string[] = [];
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function invoke(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ exit: number; stdout: Buffer; stderr: Buffer }> {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", (bytes: Buffer) => { stdout.push(Buffer.from(bytes)); });
  child.stderr.on("data", (bytes: Buffer) => { stderr.push(Buffer.from(bytes)); });
  child.stdin.end();
  return new Promise((resolve, reject) => {
    let failure: Error | undefined;
    const guard = setTimeout(() => { child.kill("SIGKILL"); }, CHILD_MS);
    child.once("error", (reason) => { failure = reason; child.kill("SIGKILL"); });
    child.once("close", (code, signal) => {
      clearTimeout(guard);
      if (failure !== undefined) reject(failure);
      else if (code === null) reject(new Error(`CLI ended with ${signal ?? "no status"}.`));
      else resolve({ exit: code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

async function place(): Promise<{ root: string; home: string; env: NodeJS.ProcessEnv }> {
  const root = await mkdtemp(join(tmpdir(), "bot-mutation-readings-")); roots.push(root);
  const home = join(root, "home"), agent = join(root, "pi-agent");
  await mkdir(join(home, "assemblies"), { recursive: true }); await chmod(home, 0o700); await mkdir(agent, { mode: 0o700 });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  return { root, home, env: { HOME: root, PWD: root, XDG_CACHE_HOME: join(root, "cache"), PI_CODING_AGENT_DIR: agent, PATH: process.env["PATH"] } };
}

async function snapshot(path: string): Promise<unknown> {
  const held = await lstat(path);
  if (held.isSymbolicLink()) return { kind: "link", target: await readlink(path) };
  if (!held.isDirectory()) {
    const bytes = await readFile(path);
    if (path.endsWith("/.bot-source")) {
      const [source = "", _timestamp = ""] = bytes.toString().trimEnd().split("\n");
      return { kind: "file", source, timestamp: "per-operation" };
    }
    return { kind: "file", bytes };
  }
  const entries = await readdir(path);
  return { kind: "directory", entries: Object.fromEntries(await Promise.all(entries.sort()
    .map(async (name): Promise<[string, unknown]> => [name, await snapshot(join(path, name))]))) };
}

async function expectRetainedRun(home: string, document: { data: { run: string; output?: { path: string } } }): Promise<void> {
  const run = document.data.run, directory = join(home, "runs", run);
  const rows = (await readFile(join(directory, "record.jsonl"), "utf8")).trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(rows.at(0)).toMatchObject({ event: "run_start", run });
  expect(rows.at(-1)).toMatchObject({ event: "run_end", exit: 0, cause: "success" });
  const output = document.data.output;
  if (output === undefined) throw new Error("Expected the retained run output descriptor.");
  expect(await readFile(join(directory, output.path), "utf8")).toBe("answer");
}

function documentOf<D>(reading: DocumentReading<D>): D {
  if (reading.kind !== "document") throw new Error(`Expected a document, received ${reading.error.error.cause}.`);
  expect(reading.exit).toBe(reading.command.exit);
  expect(JSON.parse(reading.command.stdout.toString())).toEqual(reading.document);
  return reading.document;
}

function commandForPid(pid: number): string | undefined {
  const probe = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  if (probe.error !== undefined) throw probe.error;
  if (probe.status === 1) return undefined;
  if (probe.status !== 0) throw new Error(`ps failed for ${String(pid)}: ${probe.stderr}`);
  return probe.stdout.trim();
}

function pidsWithIdentity(identity: string): number[] {
  const probe = spawnSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" });
  if (probe.error !== undefined) throw probe.error;
  if (probe.status !== 0) throw new Error(`process inventory failed: ${probe.stderr}`);
  return probe.stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/u.exec(line);
    return match !== null && match[2]?.includes(identity) === true ? [Number(match[1])] : [];
  });
}

async function fixturePid(pidFile: string): Promise<number | undefined> {
  let bytes: string;
  try { bytes = await readFile(pidFile, "utf8"); } catch (reason) {
    if (reason instanceof Error && "code" in reason && reason.code === "ENOENT") return;
    throw reason;
  }
  const pid = Number(bytes);
  if (pid <= 0) throw new Error(`invalid fixture pid in ${pidFile}`);
  return pid;
}

function killFixtureProcess(pid: number, identity: string): void {
  const command = commandForPid(pid);
  if (command === undefined || !command.includes(identity)) return;
  try { process.kill(pid, "SIGKILL"); } catch (reason) {
    if (!(reason instanceof Error && "code" in reason && reason.code === "ESRCH")) throw reason;
  }
}

async function removeFixtureProcess(pidFile: string, identity: string): Promise<void> {
  const pid = await fixturePid(pidFile);
  const pids = new Set([...(pid === undefined ? [] : [pid]), ...pidsWithIdentity(identity)]);
  for (const ownedPid of pids) killFixtureProcess(ownedPid, identity);
  const deadline = Date.now() + 5_000;
  while (pidsWithIdentity(identity).length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(pidsWithIdentity(identity)).toEqual([]);
}

test("all nine mutation readings return only command bytes and a numeric exit on refusals", async () => {
  const { root, home, env } = await place();
  const readings = await Promise.all([
    assemblyInstallReading(home, "missing", { json: true }, root, env),
    assemblyLinkReading(home, "missing", { json: true }, root, env),
    assemblyRemoveReading(home, "absent", true, root, env),
    assemblyUpdateReading(home, "absent", true, root, env),
    authImportReading("missing.json", true, root, env),
    authLoginReading("faux", { json: true }, root, env),
    authLogoutReading("-invalid", { json: true }, root, env),
    runStartReading(home, "absent/main", undefined, { json: true }, root, env),
    runResumeReading(home, "absent", { json: true }, root, env),
  ]);
  expect(readings).toHaveLength(9);
  for (const reading of readings) {
    expect(typeof reading.exit).toBe("number"); expect(Buffer.isBuffer(reading.stdout)).toBe(true); expect(Buffer.isBuffer(reading.stderr)).toBe(true);
    expect(Object.keys(reading).sort()).toEqual(["exit", "stderr", "stdout"]);
  }
  expect(readings.every((reading) => reading.exit !== 0)).toBe(true);
  expect(readings[4].stderr.toString()).toContain('"operation":"auth.import"');
  expect(readings[5].stderr.toString()).toContain('"cause":"terminal-required"');
  expect(readings[7].stderr.toString()).toContain('"operation":"run.start"');
  expect(readings[8].stderr.toString()).toContain('"operation":"run.resume"');
}, BOUNDARY_MS);

test("all nine refused readings match the invoked CLI bytes and exit", async () => {
  const { root, home, env } = await place();
  const cases: [() => Promise<{ exit: number; stdout: Buffer; stderr: Buffer }>, string[]][] = [
    [() => assemblyInstallReading(home, "missing", { json: true }, root, env), ["assembly", "install", "missing", "--json", "--home", home]],
    [() => assemblyLinkReading(home, "missing", { json: true }, root, env), ["assembly", "link", "missing", "--json", "--home", home]],
    [() => assemblyRemoveReading(home, "absent", true, root, env), ["assembly", "remove", "absent", "--json", "--home", home]],
    [() => assemblyUpdateReading(home, "absent", true, root, env), ["assembly", "update", "absent", "--json", "--home", home]],
    [() => authImportReading("missing.json", true, root, env), ["auth", "import", "missing.json", "--json"]],
    [() => authLoginReading("faux", { json: true }, root, env), ["auth", "login", "faux", "--json"]],
    [() => authLogoutReading("-invalid", { json: true }, root, env), ["auth", "logout", "-invalid", "--json"]],
    [() => runStartReading(home, "absent/main", undefined, { json: true }, root, env), ["run", "start", "--json", "--home", home, "--", "absent/main"]],
    [() => runResumeReading(home, "absent", { json: true }, root, env), ["run", "resume", "absent", "--json", "--home", home]],
  ];
  // Each cold CLI child has CHILD_MS to identify a genuine hang. This outer
  // bound must sit above it even though nine parity cases run serially.
  for (const [reading, args] of cases) expect(await reading()).toEqual(await invoke(args, root, env));
}, BOUNDARY_MS);

test("an in-process mutation copies the caller environment and leaves process.env unchanged", async () => {
  const { root, home, env } = await place();
  env["BOT_HOME"] = "relative-home";
  const supplied = { ...env }, ambient = { ...process.env };
  await assemblyInstallReading(home, "missing", { json: true }, root, env);
  expect(env).toEqual(supplied);
  expect(process.env).toEqual(ambient);
});

test("the shared outer settlement turns a handler rejection into the CLI's stderr and exit 2", async () => {
  const stderr: Buffer[] = [];
  await expect(settleCommand(Promise.reject(new Error("dependency broke")), (bytes) => { stderr.push(Buffer.from(bytes)); }))
    .resolves.toBe(2);
  expect(Buffer.concat(stderr)).toEqual(Buffer.from("dependency broke\n"));
});

test("a real human assembly dependency rejection matches the invoked CLI", async () => {
  const reading = await place(), command = await place(), tools = join(reading.root, "tools"), git = join(tools, "git");
  const readingPid = join(reading.root, "escaped.pid"), commandPid = join(command.root, "escaped.pid");
  const holder = join(tools, "held-output.mjs");
  const readingIdentity = `bot-mutation-reading-${reading.root.slice(reading.root.lastIndexOf("-") + 1)}`;
  const commandIdentity = `bot-mutation-command-${command.root.slice(command.root.lastIndexOf("-") + 1)}`;
  await mkdir(tools);
  await writeFile(holder, "setInterval(() => {}, 1000);\n");
  await writeFile(git, [
    `#!${process.execPath}`,
    'import { spawn } from "node:child_process";',
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'const root = process.argv.at(-1);',
    'mkdirSync(`${root}/.git`, { recursive: true });',
    'writeFileSync(`${root}/ASSEMBLY.md`, "---\\nintelligence: default\\n---\\nFetched.\\n");',
    'const child = spawn(process.execPath, [process.env.ESCAPED_HOLDER, process.env.ESCAPED_ID], { detached: true, stdio: ["ignore", process.stdout, process.stderr] });',
    'writeFileSync(process.env.ESCAPED_PID, String(child.pid));',
    'child.unref();',
  ].join("\n"));
  await chmod(git, 0o755);
  const readingEnv = { ...reading.env, PATH: tools, ESCAPED_PID: readingPid, ESCAPED_HOLDER: holder, ESCAPED_ID: readingIdentity };
  const commandEnv = { ...command.env, PATH: tools, ESCAPED_PID: commandPid, ESCAPED_HOLDER: holder, ESCAPED_ID: commandIdentity };
  try {
    const imported = await assemblyInstallReading(reading.home, "https://example.invalid/review.git", {}, reading.root, readingEnv);
    const invoked = await invoke(["assembly", "install", "https://example.invalid/review.git", "--home", command.home], command.root, commandEnv);
    expect(imported).toEqual(invoked);
    expect(imported).toEqual({ exit: 2, stdout: Buffer.alloc(0), stderr: Buffer.from("Git clone did not close its captured output after exiting.\n") });
  } finally {
    await removeFixtureProcess(readingPid, readingIdentity);
    await removeFixtureProcess(commandPid, commandIdentity);
  }
}, BOUNDARY_MS);

test("assembly install succeeds in process and returns the command's structured bytes", async () => {
  const { root, home, env } = await place(), source = join(root, "review");
  await mkdir(join(source, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(source, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(source, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  const installed = await assemblyInstallDocument(home, source, { name: "team/review" }, root, env);
  expect(installed.command.exit).toBe(0); expect(installed.command.stderr).toHaveLength(0);
  expect(documentOf(installed)).toEqual({
    schemaVersion: 1, kind: "bot.assembly.install",
    data: { name: "team/review", kind: "installed", changed: true },
  });
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated.\n");
  const updated = await assemblyUpdateDocument(home, "team/review", root, env);
  expect(updated.command.exit, updated.command.stderr.toString()).toBe(0);
  expect(documentOf(updated)).toMatchObject({ kind: "bot.assembly.update", data: { outcomes: [{ name: "team/review", state: "updated" }] } });

  const linked = await assemblyLinkDocument(home, source, { name: "live" }, root, env);
  expect(linked.command.exit, linked.command.stderr.toString()).toBe(0);
  expect(documentOf(linked)).toMatchObject({ kind: "bot.assembly.link", data: { name: "live", kind: "linked" } });
  const removed = await assemblyRemoveDocument(home, "live", root, env);
  expect(removed.command.exit, removed.command.stderr.toString()).toBe(0);
  expect(documentOf(removed)).toMatchObject({ kind: "bot.assembly.remove", data: { name: "live", removed: true } });
});

test("assembly update documents preserve wholly failed and partly published exit-two outcomes", async () => {
  const { root, home, env } = await place();
  const makeAssembly = async (name: string, text: string): Promise<string> => {
    const source = join(root, name);
    await mkdir(join(source, "flows", "main"), { recursive: true });
    await Promise.all([
      writeFile(join(source, "ASSEMBLY.md"), `---\nintelligence: default\n---\n${text}\n`),
      writeFile(join(source, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
      writeFile(join(source, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
    ]);
    return source;
  };
  const first = await makeAssembly("first", "First one."), last = await makeAssembly("last", "Last one.");
  documentOf(await assemblyInstallDocument(home, first, { name: "a-first" }, root, env));
  documentOf(await assemblyInstallDocument(home, last, { name: "z-last" }, root, env));
  await writeFile(join(first, "ASSEMBLY.md"), "---\nintelligence: default\n---\nFirst two.\n");
  await rm(join(last, "ASSEMBLY.md"));

  const partial = await assemblyUpdateDocument(home, undefined, root, env);
  expect(partial.command.exit).toBe(2);
  expect(documentOf(partial).data.outcomes.map(({ name, state }) => ({ name, state }))).toEqual([
    { name: "a-first", state: "updated" }, { name: "z-last", state: "failed" },
  ]);

  const failed = await assemblyUpdateDocument(home, "missing", root, env);
  expect(failed.command.exit).toBe(2);
  expect(documentOf(failed).data.outcomes).toEqual([
    { name: "missing", state: "failed", reason: "Name an assembly the home holds." },
  ]);
});

test("assembly and auth-import successes match equivalent invoked CLI state and bytes", async () => {
  const reading = await place(), command = await place();
  const source = join(reading.root, "source");
  await mkdir(join(source, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(source, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(source, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  expect(await assemblyInstallReading(reading.home, source, { json: true, name: "team/review" }, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "install", source, "--json", "--name", "team/review", "--home", command.home], command.root, command.env));
  expect(await snapshot(reading.home)).toEqual(await snapshot(command.home));
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated.\n");
  expect(await assemblyUpdateReading(reading.home, "team/review", true, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "update", "team/review", "--json", "--home", command.home], command.root, command.env));
  expect(await snapshot(reading.home)).toEqual(await snapshot(command.home));
  expect(await assemblyLinkReading(reading.home, source, { json: true, name: "live" }, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "link", source, "--json", "--name", "live", "--home", command.home], command.root, command.env));
  expect(await snapshot(reading.home)).toEqual(await snapshot(command.home));
  expect(await assemblyRemoveReading(reading.home, "live", true, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "remove", "live", "--json", "--home", command.home], command.root, command.env));
  expect(await snapshot(reading.home)).toEqual(await snapshot(command.home));

  const credential = join(reading.root, "credentials.json");
  await writeFile(credential, JSON.stringify({ groq: { type: "api_key", key: "fixture-secret" } }), { mode: 0o600 });
  expect(await authImportReading(credential, true, reading.root, reading.env))
    .toEqual(await invoke(["auth", "import", credential, "--json"], command.root, command.env));
  expect(JSON.parse(await readFile(join(String(reading.env["PI_CODING_AGENT_DIR"]), "auth.json"), "utf8")))
    .toEqual(JSON.parse(await readFile(join(String(command.env["PI_CODING_AGENT_DIR"]), "auth.json"), "utf8")));
}, BOUNDARY_MS);

test("authentication document wrappers mutate Pi state exactly once", async () => {
  const { root, env } = await place(), agent = String(env["PI_CODING_AGENT_DIR"]), source = join(root, "credentials.json");
  const importedSecret = "fixture-import-secret", typedSecret = "fixture-login-secret";
  await writeFile(source, JSON.stringify({ groq: { type: "api_key", key: importedSecret } }), { mode: 0o600 });
  const imported = await authImportDocument(source, root, env);
  expect(imported.command.exit, imported.command.stderr.toString()).toBe(0);
  expect(imported.command.stdout.toString()).not.toContain(importedSecret);
  expect(documentOf(imported).data).toEqual({ imported: true, providerCount: 1 });

  const hidden: boolean[] = [];
  const loggedIn = await authLoginDocument("openai", { readLine: (value) => { hidden.push(value); return Promise.resolve(typedSecret); } }, root, env);
  expect(loggedIn.command.exit, loggedIn.command.stderr.toString()).toBe(0); expect(hidden).toEqual([true]);
  expect(Buffer.concat([loggedIn.command.stdout, loggedIn.command.stderr]).toString()).not.toContain(typedSecret);
  expect(documentOf(loggedIn).data).toEqual({ provider: "openai", authenticated: true, credentialType: "api_key" });
  expect(await readFile(join(agent, "auth.json"), "utf8")).toContain(typedSecret);

  const loggedOut = await authLogoutDocument("openai", {}, root, env);
  expect(loggedOut.command.exit, loggedOut.command.stderr.toString()).toBe(0);
  expect(documentOf(loggedOut)).toMatchObject({ kind: "bot.auth.logout", data: { provider: "openai", result: "completed" } });
});

test("authentication cancellation stays a command result while run cancellation before spawn rejects", async () => {
  const { root, home, env } = await place(), controller = new AbortController(); controller.abort();
  const login = await authLoginReading("openai", { json: true, readLine: () => Promise.resolve("unused"), signal: controller.signal }, root, env);
  const logout = await authLogoutReading("openai", { json: true, signal: controller.signal }, root, env);
  for (const reading of [login, logout]) {
    expect(reading.exit).toBe(1); expect(reading.stdout).toHaveLength(0);
    expect(reading.stderr.toString()).toContain('"cause":"cancelled"');
  }
  await expect(runStartReading(home, "review/main", "request", { signal: controller.signal }, root, env))
    .rejects.toMatchObject({ name: "AbortError" });
});

test("run start uses the direct child and keeps a leading-hyphen request literal", async () => {
  const { root, home, env } = await place(), stage = join(home, "assemblies", "review", "flows", "main", "01-work");
  const agent = String(env["PI_CODING_AGENT_DIR"]);
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies", "review", "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWrite.\n"),
    writeFile(join(stage, "gate"), "#!/bin/sh\ntest \"$(cat \"$OUTPUT\")\" = answer\n"),
    writeFile(join(root, "script.json"), JSON.stringify([
      [{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }], "done",
    ])),
  ]);
  await chmod(join(stage, "gate"), 0o755);
  const reading = await runStartDocument(home, "review/main", "-literal", {
    script: "script.json", correlation: "outside", idFile: "run.id", stdin: Buffer.alloc(1024 * 1024, 120),
  }, root, env);
  expect(reading.command.exit, reading.command.stderr.toString()).toBe(0);
  const document = documentOf(reading);
  expect(document.kind).toBe("bot.run.result"); expect(document.data).toMatchObject({ complete: true, exit: 0, correlation: "outside" });
  await expectRetainedRun(home, document);
  const run = document.data.run;
  expect(await readFile(join(root, "run.id"), "utf8")).toBe(`${run}\n`);
  expect(await readFile(join(home, "runs", run, "request.txt"), "utf8")).toBe("-literal");
  const direct = await invoke([
    "run", "start", "--json", "--correlation", "outside", "--id-file", "direct.id", "--script", "script.json",
    "--home", home, "--", "review/main", "-literal",
  ], root, env);
  expect({ exit: direct.exit, stderr: direct.stderr }).toEqual({ exit: reading.command.exit, stderr: reading.command.stderr });
  const directDocument = JSON.parse(direct.stdout.toString()) as { kind: string; data: { run: string; output?: { path: string } } };
  expect(directDocument).toMatchObject({ kind: "bot.run.result", data: { complete: true, exit: 0, correlation: "outside" } });
  await expectRetainedRun(home, directDocument);
  const directRun = directDocument.data.run;
  expect(await readFile(join(root, "direct.id"), "utf8")).toBe(`${directRun}\n`);
  expect(await readFile(join(home, "runs", directRun, "request.txt"), "utf8")).toBe("-literal");
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: local, model: operator-model, reasoning: medium }\n"),
    writeFile(join(agent, "models.json"), JSON.stringify({ providers: { local: {
      baseUrl: "https://local.invalid/v1", api: "openai-completions", apiKey: "fixture-key",
      models: [{ id: "operator-model", reasoning: true, contextWindow: 4096, maxTokens: 512 }],
    } } }), { mode: 0o600 }),
  ]);
  const resumed = await runResumeDocument(home, run, { correlation: "resume" }, root, env);
  expect(resumed.command.exit, resumed.command.stderr.toString()).toBe(0);
  const resumedDocument = documentOf(resumed);
  expect(resumedDocument.kind).toBe("bot.run.result");
  expect(resumedDocument.data).toMatchObject({ donor: run, complete: true, exit: 0, correlation: "resume", carried: { count: 1 } });
  await expectRetainedRun(home, resumedDocument);
  const directResume = await invoke(["run", "resume", directRun, "--json", "--correlation", "resume", "--home", home], root, env);
  expect({ exit: directResume.exit, stderr: directResume.stderr }).toEqual({ exit: resumed.command.exit, stderr: resumed.command.stderr });
  const directResumeDocument = JSON.parse(directResume.stdout.toString()) as { kind: string; data: { run: string; output?: { path: string } } };
  expect(directResumeDocument).toMatchObject({
    kind: "bot.run.result", data: { donor: directRun, complete: true, exit: 0, correlation: "resume", carried: { count: 1 } },
  });
  await expectRetainedRun(home, directResumeDocument);
}, BOUNDARY_MS);

test("a started nonzero run remains a typed run-result document", async () => {
  const { root, home, env } = await place(), stage = join(home, "assemblies", "review", "flows", "main", "01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies", "review", "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWrite.\n"),
    writeFile(join(stage, "gate"), "#!/bin/sh\nexit 1\n"),
    writeFile(join(root, "script.json"), JSON.stringify([
      [{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }], "done",
    ])),
  ]);
  await chmod(join(stage, "gate"), 0o755);
  const reading = await runStartDocument(home, "review/main", "request", { script: "script.json" }, root, env);
  expect(reading.command.exit).not.toBe(0);
  const document = documentOf(reading);
  expect(document).toMatchObject({ kind: "bot.run.result", data: { complete: true, exit: reading.command.exit } });
  expect(document.data.cause).not.toBe("success");
}, BOUNDARY_MS);

test("run start preserves the private-home refusal", async () => {
  const { root, home, env } = await place();
  const stage = join(home, "assemblies", "review", "flows", "main", "01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies", "review", "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWrite.\n"),
  ]);
  await chmod(home, 0o755);
  const reading = await runStartReading(home, "review/main", "request", { json: true }, root, env);
  expect(reading.exit).toBe(5);
  const document = JSON.parse(reading.stderr.toString()) as { kind: string; error: { operation: string; cause: string; message: string } };
  expect(document).toMatchObject({ kind: "error", error: { operation: "run.start", cause: "fault" } });
  expect(document.error.message).toContain("private owner-only");
}, BOUNDARY_MS);
