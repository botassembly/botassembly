import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import {
  assemblyInstallReading, assemblyLinkReading, assemblyRemoveReading, assemblyUpdateReading,
  authImportReading, authLoginReading, authLogoutReading, runResumeReading, runStartReading,
} from "../src/public-mutation-readings.ts";
import { settleCommand } from "../src/cli-boundary.ts";
import { CHILD_MS } from "./boundary.ts";

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
});

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
  for (const [reading, args] of cases) expect(await reading()).toEqual(await invoke(args, root, env));
});

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

test("assembly install succeeds in process and returns the command's structured bytes", async () => {
  const { root, home, env } = await place(), source = join(root, "review");
  await mkdir(join(source, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(source, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(source, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  const reading = await assemblyInstallReading(home, source, { json: true, name: "team/review" }, root, env);
  expect(reading.exit).toBe(0); expect(reading.stderr).toHaveLength(0);
  expect(JSON.parse(reading.stdout.toString())).toEqual({
    schemaVersion: 1, kind: "bot.assembly.install",
    data: { name: "team/review", kind: "installed", changed: true },
  });
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated.\n");
  const updated = await assemblyUpdateReading(home, "team/review", true, root, env);
  expect(updated.exit, updated.stderr.toString()).toBe(0);
  expect(JSON.parse(updated.stdout.toString())).toMatchObject({ kind: "bot.assembly.update", data: { outcomes: [{ name: "team/review", state: "updated" }] } });

  const linked = await assemblyLinkReading(home, source, { json: true, name: "live" }, root, env);
  expect(linked.exit, linked.stderr.toString()).toBe(0);
  expect(JSON.parse(linked.stdout.toString())).toMatchObject({ kind: "bot.assembly.link", data: { name: "live", kind: "linked" } });
  const removed = await assemblyRemoveReading(home, "live", true, root, env);
  expect(removed.exit, removed.stderr.toString()).toBe(0);
  expect(JSON.parse(removed.stdout.toString())).toMatchObject({ kind: "bot.assembly.remove", data: { name: "live", removed: true } });
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
  expect(await readFile(join(reading.home, "assemblies", "team", "review", "ASSEMBLY.md")))
    .toEqual(await readFile(join(command.home, "assemblies", "team", "review", "ASSEMBLY.md")));
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated.\n");
  expect(await assemblyUpdateReading(reading.home, "team/review", true, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "update", "team/review", "--json", "--home", command.home], command.root, command.env));
  expect(await assemblyLinkReading(reading.home, source, { json: true, name: "live" }, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "link", source, "--json", "--name", "live", "--home", command.home], command.root, command.env));
  expect(await assemblyRemoveReading(reading.home, "live", true, reading.root, reading.env))
    .toEqual(await invoke(["assembly", "remove", "live", "--json", "--home", command.home], command.root, command.env));

  const credential = join(reading.root, "credentials.json");
  await writeFile(credential, JSON.stringify({ groq: { type: "api_key", key: "fixture-secret" } }), { mode: 0o600 });
  expect(await authImportReading(credential, true, reading.root, reading.env))
    .toEqual(await invoke(["auth", "import", credential, "--json"], command.root, command.env));
  expect(JSON.parse(await readFile(join(String(reading.env["PI_CODING_AGENT_DIR"]), "auth.json"), "utf8")))
    .toEqual(JSON.parse(await readFile(join(String(command.env["PI_CODING_AGENT_DIR"]), "auth.json"), "utf8")));
});

test("authentication import, login, and logout mutate Pi state without returning a typed answer", async () => {
  const { root, env } = await place(), agent = String(env["PI_CODING_AGENT_DIR"]), source = join(root, "credentials.json");
  const importedSecret = "fixture-import-secret", typedSecret = "fixture-login-secret";
  await writeFile(source, JSON.stringify({ groq: { type: "api_key", key: importedSecret } }), { mode: 0o600 });
  const imported = await authImportReading(source, true, root, env);
  expect(imported.exit, imported.stderr.toString()).toBe(0);
  expect(imported.stdout.toString()).not.toContain(importedSecret);

  const hidden: boolean[] = [];
  const loggedIn = await authLoginReading("openai", { json: true, readLine: (value) => { hidden.push(value); return Promise.resolve(typedSecret); } }, root, env);
  expect(loggedIn.exit, loggedIn.stderr.toString()).toBe(0); expect(hidden).toEqual([true]);
  expect(Buffer.concat([loggedIn.stdout, loggedIn.stderr]).toString()).not.toContain(typedSecret);
  expect(await readFile(join(agent, "auth.json"), "utf8")).toContain(typedSecret);

  const loggedOut = await authLogoutReading("openai", { json: true }, root, env);
  expect(loggedOut.exit, loggedOut.stderr.toString()).toBe(0);
  expect(JSON.parse(loggedOut.stdout.toString())).toMatchObject({ kind: "bot.auth.logout", data: { provider: "openai", result: "completed" } });
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
  const reading = await runStartReading(home, "review/main", "-literal", {
    json: true, script: "script.json", correlation: "outside", idFile: "run.id", stdin: Buffer.alloc(1024 * 1024, 120),
  }, root, env);
  expect(reading.exit, reading.stderr.toString()).toBe(0);
  const document = JSON.parse(reading.stdout.toString()) as { kind: string; data: Record<string, unknown> };
  expect(document.kind).toBe("bot.run.result"); expect(document.data).toMatchObject({ complete: true, exit: 0, correlation: "outside" });
  const run = String(document.data["run"]);
  expect(await readFile(join(root, "run.id"), "utf8")).toBe(`${run}\n`);
  expect(await readFile(join(home, "runs", run, "request.txt"), "utf8")).toBe("-literal");
  const direct = await invoke([
    "run", "start", "--json", "--correlation", "outside", "--id-file", "direct.id", "--script", "script.json",
    "--home", home, "--", "review/main", "-literal",
  ], root, env);
  expect({ exit: direct.exit, stderr: direct.stderr }).toEqual({ exit: reading.exit, stderr: reading.stderr });
  const directDocument = JSON.parse(direct.stdout.toString()) as { kind: string; data: Record<string, unknown> };
  expect(directDocument).toMatchObject({ kind: "bot.run.result", data: { complete: true, exit: 0, correlation: "outside" } });
  const directRun = String(directDocument.data["run"]);
  expect(await readFile(join(root, "direct.id"), "utf8")).toBe(`${directRun}\n`);
  expect(await readFile(join(home, "runs", directRun, "request.txt"), "utf8")).toBe("-literal");
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: local, model: operator-model, reasoning: medium }\n"),
    writeFile(join(agent, "models.json"), JSON.stringify({ providers: { local: {
      baseUrl: "https://local.invalid/v1", api: "openai-completions", apiKey: "fixture-key",
      models: [{ id: "operator-model", reasoning: true, contextWindow: 4096, maxTokens: 512 }],
    } } }), { mode: 0o600 }),
  ]);
  const resumed = await runResumeReading(home, run, { json: true, correlation: "resume" }, root, env);
  expect(resumed.exit, resumed.stderr.toString()).toBe(0);
  const resumedDocument = JSON.parse(resumed.stdout.toString()) as { kind: string; data: Record<string, unknown> };
  expect(resumedDocument.kind).toBe("bot.run.result");
  expect(resumedDocument.data).toMatchObject({ donor: run, complete: true, exit: 0, correlation: "resume", carried: { count: 1 } });
  const directResume = await invoke(["run", "resume", directRun, "--json", "--correlation", "resume", "--home", home], root, env);
  expect({ exit: directResume.exit, stderr: directResume.stderr }).toEqual({ exit: resumed.exit, stderr: resumed.stderr });
  expect(JSON.parse(directResume.stdout.toString())).toMatchObject({
    kind: "bot.run.result", data: { donor: directRun, complete: true, exit: 0, correlation: "resume", carried: { count: 1 } },
  });
});

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
});
