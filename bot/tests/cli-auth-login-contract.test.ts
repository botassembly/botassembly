import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxProvider, ModelsError, type AuthInteraction, type Credential, type Provider } from "@earendil-works/pi-ai";
import { CredentialSynchronizationError, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { mapping } from "../src/model.ts";
import { inertText } from "../src/new-command-result.ts";

interface Invocation { code: number; out: string; err: string }
interface LoginBoundary extends CliBoundary { signal?: AbortSignal }
type LoginSettlement = (interaction: AuthInteraction) => Promise<Credential>;

const roots: string[] = [];
const WARNING = "The retired Bot credential store is inactive; this command uses Pi's auth.json.\n";
const SECRET = "credential-secret-must-never-print";

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function loginProvider(id: string, type: "api_key" | "oauth" | "ambient" = "api_key"): Provider {
  const base = fauxProvider({ provider: id }).provider;
  const apiKey = { name: "Fixture key", resolve: () => Promise.resolve(undefined),
    ...(type === "api_key" ? { login: () => Promise.resolve({ type: "api_key" as const, key: SECRET }) } : {}) };
  const oauth = type === "oauth" ? { name: "Fixture OAuth",
    login: () => Promise.resolve({ type: "oauth" as const, refresh: SECRET, access: SECRET, expires: 4_102_444_800_000 }),
    refresh: () => Promise.reject(new Error("unused refresh")),
    toAuth: () => Promise.resolve({ apiKey: SECRET }) } : undefined;
  return { ...base, id, name: id, auth: { apiKey, ...(oauth === undefined ? {} : { oauth }) } };
}

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected an object.");
  return value;
}

function lastObject(text: string): Record<string, unknown> {
  return object(text.trimEnd().split("\n").at(-1) ?? "");
}

function fixture(providers: readonly Provider[], settle: LoginSettlement) {
  const events: string[] = [];
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const runtime = {
    getProvider: (id: string) => byId.get(id),
    login: (id: string, type: "api_key" | "oauth", interaction: AuthInteraction) => {
      events.push(`login:${id}:${type}`);
      return settle(interaction);
    },
  } as unknown as ModelRuntime;
  const out: Buffer[] = [], err: Buffer[] = [];
  const value: LoginBoundary = {
    cwd: "/", env: {}, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), readLine: () => Promise.resolve("fixture answer"),
    stdout: (bytes) => { out.push(Buffer.from(bytes)); }, stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-11T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
    authPath: "/fixture/pi-agent/auth.json",
    authProvider: (id) => { events.push(`catalog:${id}`); return byId.get(id); },
    beforeCredentialAccess: () => { events.push("warning"); },
    authRuntime: () => { events.push("runtime"); return Promise.resolve(runtime); },
  };
  return { value, out, err, events, runtime };
}

async function invoke(args: string[], held: ReturnType<typeof fixture>): Promise<Invocation> {
  const code = await main(args, held.value);
  return { code, out: Buffer.concat(held.out).toString(), err: Buffer.concat(held.err).toString() };
}

function success(provider: string, type: "api_key" | "oauth"): string {
  return `${JSON.stringify({ schemaVersion: 1, kind: "bot.auth.login",
    data: { provider, authenticated: true, credentialType: type } })}\n`;
}

test("auth login publishes one exact current descriptor and generated route", () => {
  expect(CLI_CONTRACTS.find((held) => held.operation === ("auth.login" as never))).toEqual({
    operation: "auth.login", command: ["auth", "login"], output: { kind: "bot.auth.login", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "never", mutates: true, network: "conditional",
    options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
    limits: { humanErrorBytes: 2_048, identityBytes: 256, interactionBytes: 2_048,
      interactionCount: 100, interactionTotalBytesExclusive: 65_536, resultBytes: 4_096 },
  });
});

test.each(["api_key", "oauth"] as const)("auth login returns only the %s credential type after Pi settles", async (type) => {
  const provider = loginProvider(`fixture-${type}`, type);
  const credential: Credential = type === "api_key" ? { type, key: SECRET }
    : { type, refresh: SECRET, access: SECRET, expires: 4_102_444_800_000 };
  const held = fixture([provider], () => Promise.resolve(credential));
  const result = await invoke(["auth", "login", provider.id, "--json"], held);
  expect(result).toEqual({ code: 0, out: success(provider.id, type), err: "" });
  expect(result.out + result.err).not.toContain(SECRET);
  expect(Buffer.byteLength(result.out)).toBeLessThan(4_096);
});

test("auth login validates grammar, terminal, provider, and method before credential access", async () => {
  const provider = loginProvider("valid");
  for (const args of [
    ["auth", "login"], ["auth", "login", "valid", "extra"], ["auth", "login", "valid", "--json", "-j"],
    ["auth", "login", "valid", "--home", "/outside"], ["auth", "login", "valid", "--unknown"],
    ["auth", "login", "x".repeat(257)],
  ]) {
    const overBound = args[2]?.length === 257 ? loginProvider(args[2]) : undefined;
    const held = fixture([provider, ...(overBound === undefined ? [] : [overBound])],
      () => Promise.resolve({ type: "api_key", key: SECRET }));
    const result = await invoke(args, held);
    expect(result.code, args.join(" ")).toBe(2);
    expect(result.out).toBe("");
    expect(held.events).toEqual([]);
    expect(Buffer.byteLength(result.err)).toBeLessThanOrEqual(2_049);
  }
  const piped = fixture([provider], () => Promise.resolve({ type: "api_key", key: SECRET }));
  piped.value.stdinIsTTY = false;
  expect((await invoke(["auth", "login", "valid", "--json"], piped)).code).toBe(2);
  expect(piped.events).toEqual([]);

  const unknown = fixture([provider], () => Promise.resolve({ type: "api_key", key: SECRET }));
  expect((await invoke(["auth", "login", "missing", "--json"], unknown)).code).toBe(2);
  expect(unknown.events).toEqual(["catalog:missing"]);
  const ambient = fixture([loginProvider("ambient", "ambient")], () => Promise.resolve({ type: "api_key", key: SECRET }));
  expect((await invoke(["auth", "login", "ambient", "--json"], ambient)).code).toBe(2);
  expect(ambient.events).toEqual(["catalog:ambient"]);
});

test("configured provider identities stay exact in JSON and inert in human output", async () => {
  const id = "configured\u001b[31m|*_[x]\nnext";
  const provider = loginProvider(id);
  const json = await invoke(["auth", "login", id, "--json"], fixture(
    [provider], () => Promise.resolve({ type: "api_key", key: SECRET }),
  ));
  expect(json.code).toBe(0);
  expect(object(json.out)).toMatchObject({ data: { provider: id, authenticated: true, credentialType: "api_key" } });
  expect(json.out).not.toContain("\u001b");
  const human = await invoke(["auth", "login", id], fixture(
    [provider], () => Promise.resolve({ type: "api_key", key: SECRET }),
  ));
  expect(human).toEqual({ code: 0, out: `Signed in to ${inertText(id, 256).text}.\n`, err: "" });
  expect(human.out).not.toContain("\u001b");
});

test("the current route resolves the provider before one warning and runtime construction", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-login-warning-")); roots.push(root);
  const retired = join(root, "credentials.json"); await writeFile(retired, "{}", { mode: 0o600 });
  const provider = loginProvider("ordered");
  const held = fixture([provider], () => Promise.resolve({ type: "api_key", key: SECRET }));
  held.value.retiredCredentialPath = retired;
  const result = await invoke(["auth", "login", "ordered", "--json"], held);
  expect(result).toEqual({ code: 0, out: success("ordered", "api_key"), err: WARNING });
  expect(held.events).toEqual(["catalog:ordered", "warning", "runtime", "login:ordered:api_key"]);
});

test("all provider interaction stays bounded and control-safe on stderr", async () => {
  const hostile = "prompt\u001b[31m|*_[x]\nnext";
  const provider = loginProvider("interactive");
  const held = fixture([provider], async (interaction) => {
    interaction.notify({ type: "info", message: hostile });
    interaction.notify({ type: "auth_url", url: `https://example.invalid/${hostile}`, instructions: hostile });
    interaction.notify({ type: "device_code", verificationUri: "https://example.invalid/device", userCode: hostile });
    interaction.notify({ type: "progress", message: hostile });
    await interaction.prompt({ type: "text", message: hostile });
    await interaction.prompt({ type: "secret", message: hostile });
    await interaction.prompt({ type: "manual_code", message: hostile });
    await interaction.prompt({ type: "select", message: hostile,
      options: [{ id: "chosen", label: hostile, description: hostile }] });
    return { type: "api_key", key: SECRET };
  });
  const result = await invoke(["auth", "login", "interactive", "--json"], held);
  expect(result.code).toBe(0);
  expect(result.out).toBe(success("interactive", "api_key"));
  expect(result.out).not.toContain(hostile);
  expect(result.err).toContain(inertText(hostile, 2_048).text);
  expect(result.err).not.toContain("\u001b");
  expect(Buffer.byteLength(result.err)).toBeLessThan(65_536);
  expect(result.out + result.err).not.toContain(SECRET);
});

test("command and prompt cancellation settle without a credential result", async () => {
  const provider = loginProvider("cancelled");
  const command = fixture([provider], () => Promise.resolve({ type: "api_key", key: SECRET }));
  command.value.signal = AbortSignal.abort(new Error(SECRET));
  const stopped = await invoke(["auth", "login", "cancelled", "--json"], command);
  expect(stopped).toMatchObject({ code: 1, out: "" });
  expect(object(stopped.err)).toMatchObject({ error: {
    operation: "auth.login", code: "state-not-reached", cause: "cancelled", retryable: false,
  } });
  expect(stopped.err).not.toContain(SECRET);

  const prompt = fixture([provider], async (interaction) => {
    await interaction.prompt({ type: "text", message: "cancel me", signal: AbortSignal.abort(new Error(SECRET)) });
    return { type: "api_key", key: SECRET };
  });
  let reads = 0; prompt.value.readLine = () => { reads++; return Promise.resolve(SECRET); };
  const interrupted = await invoke(["auth", "login", "cancelled", "--json"], prompt);
  expect(interrupted).toMatchObject({ code: 1, out: "" });
  expect(object(interrupted.err)).toMatchObject({ error: { cause: "cancelled" } });
  expect(reads).toBe(0);

  const controller = new AbortController();
  let began = (): void => undefined;
  const beginning = new Promise<void>((resolve) => { began = resolve; });
  const active = fixture([provider], (interaction) => new Promise<Credential>((_resolve, reject) => {
    interaction.signal?.addEventListener("abort", () => { reject(new Error(SECRET)); }, { once: true });
    began();
  }));
  active.value.signal = controller.signal;
  const pending = invoke(["auth", "login", "cancelled", "--json"], active);
  await beginning;
  controller.abort(new Error(SECRET));
  const aborted = await pending;
  expect(aborted).toMatchObject({ code: 1, out: "" });
  expect(object(aborted.err)).toMatchObject({ error: { cause: "cancelled", retryable: false } });
  expect(aborted.err).not.toContain(SECRET);
});

test("provider and storage failures use stable secret-safe settlements", async () => {
  const provider = loginProvider("failed");
  const catalog = fixture([provider], () => Promise.resolve({ type: "api_key", key: SECRET }));
  catalog.value.authProvider = () => { throw new Error(SECRET); };
  const unavailable = await invoke(["auth", "login", "failed", "--json"], catalog);
  expect(unavailable).toMatchObject({ code: 4, out: "" });
  expect(object(unavailable.err)).toMatchObject({ error: {
    operation: "auth.login", code: "dependency-failed", cause: "provider-catalog-unavailable", retryable: true,
  } });
  const exchange = await invoke(["auth", "login", "failed", "--json"], fixture(
    [provider], () => Promise.reject(new Error(`provider returned ${SECRET}`)),
  ));
  expect(exchange).toMatchObject({ code: 4, out: "" });
  expect(object(exchange.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    code: "dependency-failed", operation: "auth.login", cause: "provider-failed",
    message: "The provider login failed.", retryable: true, details: { provider: "failed" },
  } });
  const storage = await invoke(["auth", "login", "failed", "--json"], fixture(
    [provider], () => Promise.reject(new ModelsError("auth", SECRET)),
  ));
  expect(storage).toMatchObject({ code: 5, out: "" });
  expect(object(storage.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    code: "integrity-failed", operation: "auth.login", cause: "login-failed",
    message: "The credential could not be stored safely.", retryable: false, details: { provider: "failed" },
  } });
  expect(unavailable.err + exchange.err + storage.err).not.toContain(SECRET);
});

test("an aborted post-mutation synchronization failure preserves the durable credential result", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-login-sync-")); roots.push(root);
  const authPath = join(root, "auth.json");
  const provider = loginProvider("settled");
  const credential: Credential = { type: "api_key", key: SECRET };
  const controller = new AbortController();
  const held = fixture([provider], async () => {
    await writeFile(authPath, JSON.stringify({ [provider.id]: credential }), { mode: 0o600 });
    controller.abort(new Error(SECRET));
    throw new CredentialSynchronizationError(provider.id, "login", credential, { cause: new Error(SECRET) });
  });
  held.value.authPath = authPath;
  held.value.signal = controller.signal;
  const result = await invoke(["auth", "login", "settled", "--json"], held);
  expect(result.code).toBe(5);
  expect(result.out).toBe(success("settled", "api_key"));
  expect(object(result.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    code: "integrity-failed", operation: "auth.login", cause: "synchronization-failed",
    message: "The credential was stored, but local authentication state could not be synchronized.",
    retryable: false, details: { provider: "settled" },
  } });
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({ settled: credential });
  expect(result.out + result.err).not.toContain(SECRET);
});

test("a real Pi API-key login persists exact bytes with private directory and file modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-login-api-key-")); roots.push(root);
  const agentDir = join(root, "agent"), authPath = join(agentDir, "auth.json");
  await mkdir(agentDir, { mode: 0o700 });
  const runtime = await ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false });
  const base = loginProvider("persisted");
  const provider: Provider = { ...base, auth: { apiKey: { name: "Fixture key", resolve: () => Promise.resolve(undefined),
    login: async (interaction) => ({ type: "api_key", key: await interaction.prompt({
      type: "secret", message: "Enter fixture API key",
    }) }),
  } } };
  runtime.registerNativeProvider(provider);
  const held = fixture([provider], () => Promise.reject(new Error("fixture runtime must not run")));
  held.value.authPath = authPath;
  held.value.authRuntime = () => Promise.resolve(runtime);
  held.value.readLine = () => Promise.resolve(SECRET);

  const result = await invoke(["auth", "login", provider.id, "--json"], held);

  expect(result).toEqual({ code: 0, out: success(provider.id, "api_key"), err: "Enter fixture API key\n" });
  expect(await readFile(authPath, "utf8")).toBe(`{\n  "persisted": {\n    "type": "api_key",\n    "key": "${SECRET}"\n  }\n}`);
  expect((await stat(agentDir)).mode & 0o777).toBe(0o700);
  expect((await stat(authPath)).mode & 0o777).toBe(0o600);
});

test("one interaction over 2,048 rendered bytes fails before publication", async () => {
  const provider = loginProvider("wide");
  const held = fixture([provider], (interaction) => {
    interaction.notify({ type: "progress", message: "x".repeat(2_049) });
    return Promise.resolve({ type: "api_key", key: SECRET });
  });
  const result = await invoke(["auth", "login", provider.id, "--json"], held);
  expect(result).toMatchObject({ code: 4, out: "" });
  expect(object(result.err)).toMatchObject({ error: { cause: "interaction-limit", retryable: false } });
});

test("aggregate interaction over 65,535 bytes fails below 101 messages", async () => {
  const provider = loginProvider("aggregate");
  const held = fixture([provider], (interaction) => {
    for (let index = 0; index < 33; index += 1) interaction.notify({ type: "progress", message: "x".repeat(2_000) });
    return Promise.resolve({ type: "api_key", key: SECRET });
  });
  const result = await invoke(["auth", "login", provider.id, "--json"], held);
  expect(result).toMatchObject({ code: 4, out: "" });
  expect(result.err.split("\n").filter((line) => line === "x".repeat(2_000))).toHaveLength(32);
  expect(lastObject(result.err)).toMatchObject({ error: { cause: "interaction-limit", retryable: false } });
});

test("exactly 100 interactions under the aggregate bound succeed", async () => {
  const provider = loginProvider("hundred");
  const held = fixture([provider], (interaction) => {
    for (let index = 0; index < 100; index += 1) interaction.notify({ type: "progress", message: "ok" });
    return Promise.resolve({ type: "api_key", key: SECRET });
  });
  const result = await invoke(["auth", "login", provider.id, "--json"], held);
  expect(result).toEqual({ code: 0, out: success(provider.id, "api_key"), err: "ok\n".repeat(100) });
});

test("the 101st interaction cancels before a credential result can be published", async () => {
  const provider = loginProvider("verbose");
  const held = fixture([provider], (interaction) => {
    for (let index = 0; index < 101; index += 1) interaction.notify({ type: "progress", message: `step ${String(index)}` });
    return Promise.resolve({ type: "api_key", key: SECRET });
  });
  const result = await invoke(["auth", "login", "verbose", "--json"], held);
  expect(result).toMatchObject({ code: 4, out: "" });
  expect(lastObject(result.err)).toMatchObject({ error: {
    operation: "auth.login", code: "dependency-failed", cause: "interaction-limit", retryable: false,
  } });
  expect(Buffer.byteLength(result.err)).toBeLessThanOrEqual(2_049);
  expect(result.err).not.toContain(SECRET);
});

test("a real Pi auth lock serializes login behind an expired OAuth refresh for the same provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-login-lock-")); roots.push(root);
  const agentDir = join(root, "agent"), authPath = join(agentDir, "auth.json");
  await mkdir(agentDir, { mode: 0o700 });
  const [refreshing, loggingIn] = await Promise.all([
    ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false }),
    ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false }),
  ]);
  let refreshStarted = (): void => undefined, releaseRefresh = (): void => undefined;
  const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const base = fauxProvider({ provider: "serial" }).provider;
  const provider: Provider = { ...base, auth: { oauth: {
    name: "Serial OAuth",
    login: () => Promise.resolve({ type: "oauth", refresh: "login-refresh", access: "login-access", expires: 4_102_444_800_000 }),
    refresh: async () => {
      refreshStarted(); await release;
      return { type: "oauth", refresh: "refreshed", access: "refreshed-access", expires: 4_102_444_800_000 };
    },
    toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
  } } };
  refreshing.registerNativeProvider(provider);
  loggingIn.registerNativeProvider(provider);
  await Promise.all([
    refreshing.refresh({ allowNetwork: false, providers: [provider.id] }),
    loggingIn.refresh({ allowNetwork: false, providers: [provider.id] }),
  ]);
  await writeFile(authPath, JSON.stringify({ serial: {
    type: "oauth", refresh: "expired-refresh", access: "expired-access", expires: 0,
  } }), { mode: 0o600 });

  const refreshPending = refreshing.getAuth(provider.id);
  await started;
  const held = fixture([provider], () => Promise.reject(new Error("fixture settlement must not replace Pi login")));
  held.value.authPath = authPath;
  held.value.authRuntime = () => Promise.resolve(loggingIn);
  const loginPending = invoke(["auth", "login", provider.id, "--json"], held);
  let loginSettled = false;
  void loginPending.finally(() => { loginSettled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(loginSettled).toBe(false);
  releaseRefresh();
  await expect(refreshPending).resolves.toBeDefined();
  await expect(loginPending).resolves.toEqual({ code: 0, out: success(provider.id, "oauth"), err: "" });
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({ serial: {
    type: "oauth", refresh: "login-refresh", access: "login-access", expires: 4_102_444_800_000,
  } });
});
