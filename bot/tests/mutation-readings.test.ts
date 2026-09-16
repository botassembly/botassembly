import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  assemblyInstallReading, assemblyLinkReading, assemblyRemoveReading, assemblyUpdateReading,
  authImportReading, authLoginReading, authLogoutReading, runResumeReading, runStartReading,
} from "../src/public-mutation-readings.ts";
import { settleCommand } from "../src/cli-boundary.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function place(): Promise<{ root: string; home: string; env: NodeJS.ProcessEnv }> {
  const root = await mkdtemp(join(tmpdir(), "bot-mutation-readings-")); roots.push(root);
  const home = join(root, "home"), agent = join(root, "pi-agent");
  await mkdir(join(home, "assemblies"), { recursive: true }); await mkdir(agent, { mode: 0o700 });
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
    json: true, script: "script.json", correlation: "outside", idFile: "run.id",
  }, root, env);
  expect(reading.exit, reading.stderr.toString()).toBe(0);
  const document = JSON.parse(reading.stdout.toString()) as { kind: string; data: Record<string, unknown> };
  expect(document.kind).toBe("bot.run.result"); expect(document.data).toMatchObject({ complete: true, exit: 0, correlation: "outside" });
  const run = String(document.data["run"]);
  expect(await readFile(join(root, "run.id"), "utf8")).toBe(`${run}\n`);
  expect(await readFile(join(home, "runs", run, "request.txt"), "utf8")).toBe("-literal");
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
});
