import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxProvider, ModelsError, type Provider } from "@earendil-works/pi-ai";
import { CredentialSynchronizationError, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { lock } from "proper-lockfile";
import { afterEach, expect, test, vi } from "vitest";
import { main, processBoundary, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { configuredAuthLogoutRuntime } from "../src/model-runtime.ts";
import { mapping } from "../src/model.ts";
import { inertText } from "../src/new-command-result.ts";

interface Invocation { code: number; out: string; err: string }
interface LogoutBoundary extends CliBoundary { signal?: AbortSignal }
type LogoutSettlement = (provider: string, signal: AbortSignal | undefined) => Promise<void>;

const roots: string[] = [];
const SECRET = "logout-secret-must-never-print";
const WARNING = "The retired Bot credential store is inactive; this command uses Pi's auth.json.\n";

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function provider(id: string): Provider {
  const base = fauxProvider({ provider: id }).provider;
  return { ...base, id, name: id };
}

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected an object.");
  return value;
}

function fixture(providers: readonly Provider[], stored: readonly string[] = [],
  settle: LogoutSettlement = () => Promise.resolve()) {
  const events: string[] = [], entries = new Set(stored);
  const byId = new Map(providers.map((held) => [held.id, held]));
  const runtime = {
    getProvider: (id: string) => { events.push(`runtime-catalog:${id}`); return byId.get(id); },
    listCredentials: () => { events.push("list"); return Promise.resolve([...entries].map((providerId) => ({ providerId, type: "api_key" as const }))); },
    logout: (id: string, options?: { signal?: AbortSignal }) => {
      events.push(`logout:${id}`);
      return settle(id, options?.signal).then(() => { entries.delete(id); });
    },
  } as unknown as ModelRuntime;
  const out: Buffer[] = [], err: Buffer[] = [];
  const value: LogoutBoundary = {
    cwd: "/", env: {}, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { out.push(Buffer.from(bytes)); },
    stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-11T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
    authPath: "/fixture/pi-agent/auth.json",
    authProvider: (id) => { events.push(`catalog:${id}`); return byId.get(id); },
    beforeCredentialAccess: () => { events.push("warning"); },
    authLogoutRuntime: () => { events.push("runtime"); return Promise.resolve(runtime); },
  };
  return { value, out, err, events, entries, runtime };
}

async function invoke(args: string[], held: ReturnType<typeof fixture>): Promise<Invocation> {
  const code = await main(args, held.value);
  return { code, out: Buffer.concat(held.out).toString(), err: Buffer.concat(held.err).toString() };
}

function success(id: string): string {
  return `${JSON.stringify({ schemaVersion: 1, kind: "bot.auth.logout",
    data: { provider: id, result: "completed" } })}\n`;
}

test("auth logout publishes one exact current descriptor", () => {
  expect(CLI_CONTRACTS.find((held) => held.operation === ("auth.logout" as never))).toEqual({
    operation: "auth.logout", command: ["auth", "logout"], output: { kind: "bot.auth.logout", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "never", mutates: true, network: "never",
    options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
    limits: { humanErrorBytes: 2_048, identityBytes: 256, resultBytes: 4_096 },
  });
});

test("auth logout returns the exact completion result without a racy existence preflight", async () => {
  const selected = provider("selected"), other = provider("other");
  const json = fixture([selected, other], [selected.id, other.id]);
  expect(await invoke(["auth", "logout", selected.id, "--json"], json)).toEqual({
    code: 0, out: success(selected.id), err: "",
  });
  expect(json.events).toEqual(["catalog:selected", "warning", "runtime", "logout:selected"]);
  expect([...json.entries]).toEqual([other.id]);

  const human = fixture([selected], [selected.id]);
  expect(await invoke(["auth", "logout", selected.id], human)).toEqual({
    code: 0, out: "Logout completed for selected.\n", err: "",
  });
});

test("an already-absent selected credential has the same idempotent completion", async () => {
  const selected = provider("absent"), held = fixture([selected]);
  expect(await invoke(["auth", "logout", selected.id, "--json"], held)).toEqual({
    code: 0, out: success(selected.id), err: "",
  });
  expect(held.events).toEqual(["catalog:absent", "warning", "runtime", "logout:absent"]);
});

test("grammar and provider validation finish before warning or credential access", async () => {
  const valid = provider("valid");
  for (const args of [
    ["auth", "logout"], ["auth", "logout", "valid", "extra"],
    ["auth", "logout", "valid", "--json", "-j"], ["auth", "logout", "valid", "--home", "/outside"],
    ["auth", "logout", "valid", "--unknown"], ["auth", "logout", "x".repeat(257)],
  ]) {
    const overBound = args[2]?.length === 257 ? provider(args[2]) : undefined;
    const held = fixture([valid, ...(overBound === undefined ? [] : [overBound])]);
    const result = await invoke(args, held);
    expect(result.code, args.join(" ")).toBe(2);
    expect(result.out).toBe("");
    expect(held.events).toEqual([]);
    expect(Buffer.byteLength(result.err)).toBeLessThanOrEqual(2_049);
  }

  const unknown = fixture([valid]);
  const result = await invoke(["auth", "logout", "missing", "--json"], unknown);
  expect(result).toMatchObject({ code: 2, out: "" });
  expect(object(result.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "request-invalid", cause: "provider-unknown", details: { provider: "missing" },
  } });
  expect(unknown.events).toEqual(["catalog:missing"]);

  const raw = "alias", configured = provider("x".repeat(257)), overBound = fixture([configured]);
  overBound.value.authProvider = (id) => { overBound.events.push(`catalog:${id}`); return id === raw ? configured : undefined; };
  const invalidConfigured = await invoke(["auth", "logout", raw, "--json"], overBound);
  expect(invalidConfigured).toMatchObject({ code: 2, out: "" });
  expect(object(invalidConfigured.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "request-invalid", cause: "provider-invalid",
  } });
  expect(overBound.events).toEqual(["catalog:alias"]);
});

test("configured provider identity stays exact in JSON and inert and bounded elsewhere", async () => {
  const id = "configured\u001b[31m|*_[x]\nnext", configured = provider(id);
  const json = await invoke(["auth", "logout", id, "--json"], fixture([configured], [id]));
  expect(json).toEqual({ code: 0, out: success(id), err: "" });
  expect(object(json.out)).toMatchObject({ data: { provider: id, result: "completed" } });
  expect(json.out).not.toContain("\u001b");
  const human = await invoke(["auth", "logout", id], fixture([configured], [id]));
  expect(human).toEqual({ code: 0, out: `Logout completed for ${inertText(id, 256).text}.\n`, err: "" });
  expect(human.out).not.toContain("\u001b");
  expect(Buffer.byteLength(human.out)).toBeLessThan(4_096);
});

test("the current route warns once after provider validation and before runtime construction", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-warning-")); roots.push(root);
  const retired = join(root, "credentials.json"); await writeFile(retired, SECRET, { mode: 0o600 });
  const selected = provider("ordered"), held = fixture([selected], [selected.id]);
  held.value.retiredCredentialPath = retired;
  const result = await invoke(["auth", "logout", selected.id, "--json"], held);
  expect(result).toEqual({ code: 0, out: success(selected.id), err: WARNING });
  expect(held.events).toEqual(["catalog:ordered", "warning", "runtime", "logout:ordered"]);
  expect(result.out + result.err).not.toContain(SECRET);
});

test("the real process logout path never evaluates model authentication commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-no-refresh-")); roots.push(root);
  const agentDir = join(root, "agent"), marker = join(root, "model-auth-command-ran");
  await mkdir(agentDir, { mode: 0o700 });
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { local: {
    baseUrl: "https://local.invalid/v1", api: "openai-completions",
    models: [{ id: "local-model", contextWindow: 8192, maxTokens: 1024 }],
  } } }), { mode: 0o600 });
  await writeFile(join(agentDir, "auth.json"), JSON.stringify({ local: {
    type: "api_key", key: `!printf touched > ${marker}; printf placeholder`,
  } }), { mode: 0o600 });
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  const out: Buffer[] = [], err: Buffer[] = [], ordinary = processBoundary();
  const boundary: CliBoundary = { ...ordinary,
    stdout: (bytes) => { out.push(Buffer.from(bytes)); }, stderr: (bytes) => { err.push(Buffer.from(bytes)); } };
  delete boundary.retiredCredentialPath;

  expect(await main(["auth", "logout", "local", "--json"], boundary)).toBe(0);
  expect(Buffer.concat(out).toString()).toBe(success("local"));
  expect(Buffer.concat(err).toString()).toBe("");
  expect(existsSync(marker)).toBe(false);
  expect(JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8"))).toEqual({});
});

test.each(["resolve", "reject"] as const)("an abort during pending runtime construction cancels before deletion when setup will %s", async (settlement) => {
  const selected = provider(`pending-${settlement}`), held = fixture([selected], [selected.id]);
  const controller = new AbortController(); held.value.signal = controller.signal;
  let settle = (_runtime: ModelRuntime): void => undefined;
  let fail = (_reason: Error): void => undefined;
  held.value.authLogoutRuntime = () => new Promise<ModelRuntime>((resolve, reject) => { settle = resolve; fail = reject; });
  const result = invoke(["auth", "logout", selected.id, "--json"], held);
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  controller.abort(new Error(SECRET));
  if (settlement === "resolve") settle(held.runtime); else fail(new Error(SECRET));

  const stopped = await result;
  expect(stopped).toMatchObject({ code: 1, out: "" });
  expect(object(stopped.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "state-not-reached", cause: "cancelled", retryable: false,
  } });
  expect(held.events).toEqual([`catalog:${selected.id}`, "warning"]);
  expect(stopped.err).not.toContain(SECRET);
});

test.each(["resolve", "reject"] as const)("an abort during pending provider lookup cancels before warning when lookup will %s", async (settlement) => {
  const selected = provider(`lookup-${settlement}`), held = fixture([selected], [selected.id]);
  const controller = new AbortController(); held.value.signal = controller.signal;
  let settle = (_provider: Provider): void => undefined;
  let fail = (_reason: Error): void => undefined;
  held.value.authProvider = () => new Promise<Provider>((resolve, reject) => { settle = resolve; fail = reject; });
  const result = invoke(["auth", "logout", selected.id, "--json"], held);
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  controller.abort(new Error(SECRET));
  if (settlement === "resolve") settle(selected); else fail(new Error(SECRET));

  const stopped = await result;
  expect(stopped).toMatchObject({ code: 1, out: "" });
  expect(object(stopped.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "state-not-reached", cause: "cancelled", retryable: false,
  } });
  expect(held.events).toEqual([]);
  expect(stopped.err).not.toContain(SECRET);
});

test("cancellation and catalog, runtime, and storage failures are fixed and secret-safe", async () => {
  const selected = provider("failed");
  const cancelled = fixture([selected], [selected.id]);
  cancelled.value.signal = AbortSignal.abort(new Error(SECRET));
  const stopped = await invoke(["auth", "logout", selected.id, "--json"], cancelled);
  expect(stopped).toMatchObject({ code: 1, out: "" });
  expect(object(stopped.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "state-not-reached", cause: "cancelled", retryable: false,
  } });

  const catalog = fixture([selected], [selected.id]);
  catalog.value.authProvider = () => { throw new Error(SECRET); };
  const unavailable = await invoke(["auth", "logout", selected.id, "--json"], catalog);
  expect(unavailable).toMatchObject({ code: 4, out: "" });
  expect(object(unavailable.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "dependency-failed", cause: "provider-catalog-unavailable", retryable: true,
  } });

  const construction = fixture([selected], [selected.id]);
  construction.value.authLogoutRuntime = () => Promise.reject(new Error(SECRET));
  const unavailableRuntime = await invoke(["auth", "logout", selected.id, "--json"], construction);
  expect(unavailableRuntime).toMatchObject({ code: 5, out: "" });
  expect(object(unavailableRuntime.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "integrity-failed", cause: "logout-failed", retryable: false,
  } });

  const storage = fixture([selected], [selected.id], () => Promise.reject(new ModelsError("auth", SECRET)));
  const failed = await invoke(["auth", "logout", selected.id, "--json"], storage);
  expect(failed).toMatchObject({ code: 5, out: "" });
  expect(object(failed.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    operation: "auth.logout", code: "integrity-failed", cause: "logout-failed",
    message: "The credential could not be removed safely.", retryable: false, details: { provider: selected.id },
  } });
  expect([stopped, unavailable, unavailableRuntime, failed].flatMap((result) => [result.out, result.err]).join(""))
    .not.toContain(SECRET);

  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-corrupt-")); roots.push(root);
  const agentDir = join(root, "agent"), authPath = join(agentDir, "auth.json");
  await mkdir(agentDir, { mode: 0o700 }); await writeFile(authPath, `{${SECRET}`, { mode: 0o600 });
  const runtime = await ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false });
  runtime.registerNativeProvider(selected);
  const corrupt = fixture([selected], [selected.id]);
  corrupt.value.authPath = authPath; corrupt.value.authLogoutRuntime = () => Promise.resolve(runtime);
  const corruptResult = await invoke(["auth", "logout", selected.id, "--json"], corrupt);
  expect(corruptResult).toMatchObject({ code: 5, out: "" });
  expect(object(corruptResult.err)).toMatchObject({ error: {
    operation: "auth.logout", code: "integrity-failed", cause: "logout-failed", retryable: false,
  } });
  expect(corruptResult.err).not.toContain(SECRET);
});

test("a typed post-delete synchronization failure preserves the completion result", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-sync-")); roots.push(root);
  const authPath = join(root, "auth.json"), selected = provider("settled"), other = provider("other");
  const controller = new AbortController();
  await writeFile(authPath, JSON.stringify({ [selected.id]: { type: "api_key", key: SECRET },
    [other.id]: { type: "api_key", key: "other-secret" } }), { mode: 0o600 });
  const held = fixture([selected, other], [selected.id, other.id], async () => {
    await writeFile(authPath, JSON.stringify({ [other.id]: { type: "api_key", key: "other-secret" } }), { mode: 0o600 });
    controller.abort(new Error(SECRET));
    throw new CredentialSynchronizationError(selected.id, "logout", undefined, { cause: new Error(SECRET) });
  });
  held.value.authPath = authPath; held.value.signal = controller.signal;
  const result = await invoke(["auth", "logout", selected.id, "--json"], held);
  expect(result.code).toBe(5);
  expect(result.out).toBe(success(selected.id));
  expect(object(result.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    operation: "auth.logout", code: "integrity-failed", cause: "synchronization-failed",
    message: "The credential was removed, but local authentication state could not be synchronized.",
    retryable: false, details: { provider: selected.id },
  } });
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({ other: { type: "api_key", key: "other-secret" } });
  expect(result.out + result.err).not.toContain(SECRET);
});

test("two Pi runtime instances serialize concurrent same-provider login and logout without corrupting the store", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-login-lock-")); roots.push(root);
  const agentDir = join(root, "agent"), authPath = join(agentDir, "auth.json");
  await mkdir(agentDir, { mode: 0o700 });
  const held = fixture([]);
  const [loggingIn, loggingOut] = await Promise.all([
    ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false }),
    configuredAuthLogoutRuntime({ agentDir, env: {}, clock: held.value.clock }),
  ]);
  expect(loggingOut).toBeInstanceOf(ModelRuntime);
  let loginStarted = (): void => undefined, releaseLogin = (): void => undefined;
  const started = new Promise<void>((resolve) => { loginStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseLogin = resolve; });
  const base = provider("serial-login");
  const configured: Provider = { ...base, auth: { apiKey: { name: "Serial key", resolve: () => Promise.resolve(undefined),
    login: async () => { loginStarted(); await release; return { type: "api_key", key: SECRET }; },
  } } };
  loggingIn.registerNativeProvider(configured);
  const login = loggingIn.login(configured.id, "api_key", { notify: () => undefined, prompt: () => Promise.resolve(SECRET) });
  await started;
  const invocation = fixture([configured], [], () => Promise.reject(new Error("fixture runtime must not run")));
  invocation.value.authPath = authPath; invocation.value.authLogoutRuntime = () => Promise.resolve(loggingOut);
  const logout = invoke(["auth", "logout", configured.id, "--json"], invocation);
  let settled = false; void logout.finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(settled).toBe(false);
  releaseLogin();
  await expect(login).resolves.toMatchObject({ type: "api_key" });
  await expect(logout).resolves.toEqual({ code: 0, out: success(configured.id), err: "" });
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({ "serial-login": {
    type: "api_key", key: SECRET,
  } });
});

test("Pi serializes current logout behind a same-provider expired OAuth refresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-refresh-lock-")); roots.push(root);
  const agentDir = join(root, "agent"), authPath = join(agentDir, "auth.json");
  await mkdir(agentDir, { mode: 0o700 });
  const held = fixture([]);
  const [refreshing, loggingOut] = await Promise.all([
    ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false }),
    configuredAuthLogoutRuntime({ agentDir, env: {}, clock: held.value.clock }),
  ]);
  expect(loggingOut).toBeInstanceOf(ModelRuntime);
  let refreshStarted = (): void => undefined, releaseRefresh = (): void => undefined;
  const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const base = provider("serial-refresh");
  const configured: Provider = { ...base, auth: { oauth: { name: "Serial OAuth",
    login: () => Promise.resolve({ type: "oauth", refresh: SECRET, access: SECRET, expires: 4_102_444_800_000 }),
    refresh: async () => { refreshStarted(); await release;
      return { type: "oauth", refresh: "refreshed", access: "refreshed-access", expires: 4_102_444_800_000 }; },
    toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
  } } };
  refreshing.registerNativeProvider(configured);
  await refreshing.refresh({ allowNetwork: false, providers: [configured.id] });
  await writeFile(authPath, JSON.stringify({ [configured.id]: {
    type: "oauth", refresh: SECRET, access: SECRET, expires: 0,
  } }), { mode: 0o600 });

  const refresh = refreshing.getAuth(configured.id);
  await started;
  const invocation = fixture([configured], [], () => Promise.reject(new Error("fixture runtime must not run")));
  invocation.value.authPath = authPath; invocation.value.authLogoutRuntime = () => Promise.resolve(loggingOut);
  const logout = invoke(["auth", "logout", configured.id, "--json"], invocation);
  let settled = false; void logout.finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(settled).toBe(false);
  releaseRefresh();
  await expect(refresh).resolves.toBeDefined();
  await expect(logout).resolves.toEqual({ code: 0, out: success(configured.id), err: "" });
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({});
});

test("the production Pi logout runtime waits through an eleven-second Pi file lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-logout-long-lock-")); roots.push(root);
  const agentDir = join(root, "agent"), authPath = join(agentDir, "auth.json");
  await mkdir(agentDir, { mode: 0o700 });
  await writeFile(authPath, JSON.stringify({ anthropic: { type: "api_key", key: SECRET } }), { mode: 0o600 });
  const held = fixture([]), runtime = await configuredAuthLogoutRuntime({ agentDir, env: {}, clock: held.value.clock });
  expect(runtime).toBeInstanceOf(ModelRuntime);
  const release = await lock(authPath, { realpath: false });
  let settled = false;
  const pending = runtime.logout("anthropic").then(() => ({ ok: true as const }), (reason: unknown) => ({ ok: false as const, reason }));
  void pending.finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setTimeout(resolve, 11_000); });
  expect(settled).toBe(false);
  await release();
  await expect(pending).resolves.toEqual({ ok: true });
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({});
}, 15_000);
