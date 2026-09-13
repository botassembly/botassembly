import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CredentialInfo, CredentialStore, Provider } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { mapping } from "../src/model.ts";
import { configuredAuthListRuntime, configuredModelRuntime, type AuthListRuntime } from "../src/model-runtime.ts";
import { nativeModelRuntime } from "./support/native-model-runtime.ts";

interface Invocation { code: number; out: string; err: string }
interface FixtureRuntime {
  runtime: ModelRuntime;
  events: string[];
  forbidden: string[];
  credentials: Array<CredentialInfo & Record<string, unknown>>;
}

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function provider(id: string, method: "login" | "key" | "ambient-only"): Provider {
  const apiKey = method === "ambient-only" ? { name: "Ambient", resolve: () => Promise.resolve(undefined) }
    : { name: "Key", login: () => Promise.reject(new Error("unused")), resolve: () => Promise.resolve(undefined) };
  const oauth = method === "login" ? { name: "OAuth" } : undefined;
  return { id, auth: { apiKey, ...(oauth === undefined ? {} : { oauth }) } } as unknown as Provider;
}

function fixture(
  providers: readonly Provider[], credentials: Array<CredentialInfo & Record<string, unknown>> = [],
): FixtureRuntime {
  const events: string[] = [], forbidden: string[] = [];
  const deny = (name: string) => () => { forbidden.push(name); throw new Error(`${name} must not be called`); };
  const runtime = {
    getProviders: () => providers,
    listCredentials: () => { events.push("list"); return Promise.resolve(credentials); },
    getProviderAuthStatus: deny("getProviderAuthStatus"),
    getAuth: deny("getAuth"), checkAuth: deny("checkAuth"), refresh: deny("refresh"),
    login: deny("login"), logout: deny("logout"), setRuntimeApiKey: deny("setRuntimeApiKey"),
    removeRuntimeApiKey: deny("removeRuntimeApiKey"),
  } as unknown as ModelRuntime;
  return { runtime, events, forbidden, credentials };
}

function boundary(runtime: FixtureRuntime): { value: CliBoundary; out: Buffer[]; err: Buffer[] } {
  const out: Buffer[] = [], err: Buffer[] = [];
  let held: Promise<ModelRuntime> | undefined;
  const runtimeFactory = () => {
    runtime.events.push("runtime");
    held ??= Promise.resolve(runtime.runtime);
    return held;
  };
  let authList: Promise<AuthListRuntime> | undefined;
  const authListFactory = () => {
    runtime.events.push("runtime");
    authList ??= Promise.resolve(runtime.runtime).then(async (settled) => ({
      runtime: settled, credentials: await settled.listCredentials(),
    }));
    return authList;
  };
  return { out, err, value: {
    cwd: "/", env: {}, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { out.push(Buffer.from(bytes)); }, stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-11T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
    modelRuntime: runtimeFactory, authRuntime: runtimeFactory, authListRuntime: authListFactory,
  } };
}

async function invoke(args: string[], runtime: FixtureRuntime): Promise<Invocation> {
  const held = boundary(runtime);
  const code = await main(args, held.value);
  return { code, out: Buffer.concat(held.out).toString(), err: Buffer.concat(held.err).toString() };
}

function object(text: string): Record<string, unknown> {
  const held: unknown = JSON.parse(text);
  if (!mapping(held)) throw new Error("Expected an object.");
  return held;
}

function providerNames(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((row: unknown) => mapping(row) ? row["provider"] : undefined);
}

test("auth list projects every method and state through a closed secret-free schema", async () => {
  const credentialSecret = "stored-credential-must-never-print";
  const labelSecret = "pi-label-must-never-print";
  const providers = [
    provider("stored-oauth", "login"), provider("stored-key", "key"), provider("environment", "key"),
    provider("runtime", "ambient-only"), provider("fallback", "ambient-only"),
    provider("models-command", "ambient-only"), provider("models-key", "key"), provider("none", "ambient-only"),
  ];
  const credentials = [
    { providerId: "stored-oauth", type: "oauth", arbitrary: credentialSecret, label: labelSecret },
    { providerId: "stored-key", type: "api_key", key: credentialSecret },
  ] as Array<CredentialInfo & Record<string, unknown>>;
  const runtime = fixture(providers, credentials);

  const result = await invoke(["auth", "list", "--json"], runtime);

  expect(result).toMatchObject({ code: 0, err: "" });
  expect(object(result.out)).toEqual({
    schemaVersion: 1, kind: "bot.auth.list",
    data: [
      { provider: "environment", method: "key", state: "unobserved", credentialType: null },
      { provider: "fallback", method: "ambient-only", state: "unobserved", credentialType: null },
      { provider: "models-command", method: "ambient-only", state: "unobserved", credentialType: null },
      { provider: "models-key", method: "key", state: "unobserved", credentialType: null },
      { provider: "none", method: "ambient-only", state: "unobserved", credentialType: null },
      { provider: "runtime", method: "ambient-only", state: "unobserved", credentialType: null },
      { provider: "stored-key", method: "key", state: "stored", credentialType: "api_key" },
      { provider: "stored-oauth", method: "login", state: "stored", credentialType: "oauth" },
    ],
    page: { offset: 0, limit: 50, nextOffset: null, complete: true },
    summary: { total: 8, returned: 8 },
  });
  expect(runtime.events).toEqual(["runtime", "list"]);
  expect(runtime.forbidden).toEqual([]);
  expect(result.out + result.err).not.toContain(credentialSecret);
  expect(result.out + result.err).not.toContain(labelSecret);
  expect(runtime.credentials).toEqual(credentials);
});

test("auth list sorts bytewise before paging and renders exact human rows and summaries", async () => {
  const providers = [provider("😀", "ambient-only"), provider("\uE000", "key"), provider("zeta", "login")];
  const runtime = fixture(providers);
  const first = await invoke(["auth", "list", "--offset", "0", "--limit", "2"], runtime);
  expect(first).toEqual({ code: 0, err: "", out: "zeta  login  unobserved\n\uE000  key  unobserved\nShowing 2 of 3 providers.\n" });

  const second = await invoke(["auth", "list", "--offset", "2", "--limit", "2", "--json"], runtime);
  expect(object(second.out)).toEqual({
    schemaVersion: 1, kind: "bot.auth.list",
    data: [{ provider: "😀", method: "ambient-only", state: "unobserved", credentialType: null }],
    page: { offset: 2, limit: 2, nextOffset: null, complete: true },
    summary: { total: 3, returned: 1 },
  });
  const firstDocument = object((await invoke(["auth", "list", "--offset", "0", "--limit", "2", "--json"], runtime)).out);
  const firstData = firstDocument["data"], secondData = object(second.out)["data"];
  expect([...providerNames(firstData), ...providerNames(secondData)]).toEqual(["zeta", "\uE000", "😀"]);
  expect(firstDocument["page"]).toEqual({ offset: 0, limit: 2, nextOffset: 2, complete: false });
});

test("empty and maximum pages have exact summaries and stay inside every output bound", async () => {
  const empty = fixture([]);
  expect(await invoke(["auth", "list", "--json"], empty)).toEqual({ code: 0, err: "", out: JSON.stringify({
    schemaVersion: 1, kind: "bot.auth.list", data: [],
    page: { offset: 0, limit: 50, nextOffset: null, complete: true }, summary: { total: 0, returned: 0 },
  }) + "\n" });
  expect(await invoke(["auth", "list"], fixture([]))).toEqual({ code: 0, err: "", out: "Showing 0 of 0 providers.\n" });

  const providers = Array.from({ length: 200 }, (_unused, index) => provider(
    `provider-${String(index).padStart(3, "0")}-${"p".repeat(1_011)}`, "ambient-only",
  ));
  const json = await invoke(["auth", "list", "--limit", "200", "--json"], fixture(providers));
  const human = await invoke(["auth", "list", "--limit", "200"], fixture(providers));
  expect(json.code, json.err).toBe(0);
  expect(human.code, human.err).toBe(0);
  expect(Buffer.byteLength(json.out)).toBeLessThan(1_048_576);
  expect(Buffer.byteLength(human.out)).toBeLessThan(1_048_576);
  expect(human.out.split("\n").filter((line) => line.length > 0).slice(0, -1)
    .every((line) => Buffer.byteLength(line) <= 4_096)).toBe(true);
  const document = object(json.out), data = document["data"];
  expect(document["summary"]).toEqual({ total: 200, returned: 200 });
  expect(Array.isArray(data) ? data.every((row) => Buffer.byteLength(JSON.stringify(row)) < 4_096) : false).toBe(true);
  expect(human.out).toContain("Showing 200 of 200 providers.\n");
});

test("auth list rejects every malformed request before warning or credential access", async () => {
  const invalid = [
    ["auth", "list", "--json", "-j"], ["auth", "list", "--offset", "-1"],
    ["auth", "list", "--offset", "2147483648"], ["auth", "list", "--limit", "0"],
    ["auth", "list", "--limit", "201"], ["auth", "list", "--offset"],
    ["auth", "list", "--limit"], ["auth", "list", "--home", "/outside"],
    ["auth", "list", "unexpected"],
  ];
  for (const args of invalid) {
    const runtime = fixture([]);
    const held = boundary(runtime);
    held.value.beforeCredentialAccess = () => { runtime.events.push("warning"); };
    const code = await main(args, held.value);
    expect(code, args.join(" ")).toBe(2);
    expect(Buffer.concat(held.out).toString()).toBe("");
    expect(runtime.events).toEqual([]);
    expect(Buffer.byteLength(Buffer.concat(held.err))).toBeLessThanOrEqual(2_049);
  }

  const repeated = await invoke(["auth", "list", "--json", "-j"], fixture([]));
  expect(object(repeated.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    code: "request-invalid", operation: "auth.list", cause: "option-repeated",
    message: "Auth list accepts one JSON mode flag.", retryable: false, details: {},
  } });
});

test("unsafe or corrupt runtime metadata returns one exact bounded integrity error and no rows", async () => {
  const secret = "corrupt-store-detail-must-not-print";
  const corrupt = fixture([provider("valid", "key")]);
  corrupt.runtime.listCredentials = () => Promise.reject(new Error(secret));
  const result = await invoke(["auth", "list", "--json"], corrupt);
  expect(result.code).toBe(5);
  expect(result.out).toBe("");
  expect(object(result.err)).toEqual({ schemaVersion: 1, kind: "error", error: {
    code: "integrity-failed", operation: "auth.list", cause: "auth-runtime-invalid",
    message: "The Pi authentication state is unsafe, corrupt, or invalid.", retryable: false, details: {},
  } });
  expect(Buffer.byteLength(result.err)).toBeLessThanOrEqual(2_049);
  expect(result.err).not.toContain(secret);

  const oversized = await invoke(["auth", "list", "--json"], fixture([provider("x".repeat(1_025), "key")]));
  expect(oversized).toMatchObject({ code: 5, out: "" });
  expect(object(oversized.err)).toEqual(object(result.err));
  const root = await mkdtemp(join(tmpdir(), "bot-auth-list-corrupt-")); roots.push(root);
  const agentDir = join(root, "agent"); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(join(agentDir, "auth.json"), `{\"${secret}\":`, { mode: 0o600 });
  const real = boundary(fixture([]));
  real.value.modelRuntime = () => configuredModelRuntime({ agentDir, env: real.value.env, clock: real.value.clock });
  real.value.authListRuntime = () => configuredAuthListRuntime({ agentDir, env: real.value.env, clock: real.value.clock });
  expect(await main(["auth", "list", "--json"], real.value)).toBe(5);
  expect(Buffer.concat(real.out).toString()).toBe("");
  expect(object(Buffer.concat(real.err).toString())).toEqual(object(result.err));
  expect(Buffer.concat(real.err).toString()).not.toContain(secret);
});

test("a fresh configured auth list reads public metadata once without credential values or refresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-list-fresh-")); roots.push(root);
  const agentDir = join(root, "agent"); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(join(agentDir, "auth.json"), "{}", { mode: 0o600 });
  const counts = { constructions: 0, metadataReads: 0, rawReads: 0, refreshes: 0 };
  const store: CredentialStore = {
    list: () => { counts.metadataReads += 1; return Promise.resolve([{ providerId: "openai", type: "api_key" }]); },
    read: () => {
      counts.rawReads += 1;
      return Promise.resolve({ type: "api_key", key: "credential-value-must-not-be-read" });
    },
    modify: (_providerId, change) => change(undefined),
    delete: () => Promise.resolve(),
  };
  const factory = async (options: Parameters<typeof ModelRuntime.create>[0]): Promise<ModelRuntime> => {
    counts.constructions += 1;
    const runtime = await nativeModelRuntime({ ...options, credentials: store, modelsPath: null });
    const refresh = runtime.refresh.bind(runtime);
    runtime.refresh = (held) => { counts.refreshes += 1; return refresh(held); };
    return runtime;
  };
  const held = boundary(fixture([]));
  held.value.modelRuntime = () => configuredModelRuntime({ agentDir, env: held.value.env, clock: held.value.clock, factory });
  held.value.authListRuntime = () => configuredAuthListRuntime({ agentDir, env: held.value.env, clock: held.value.clock, factory });

  expect(await main(["auth", "list", "--json"], held.value)).toBe(0);
  expect(counts).toEqual({ constructions: 1, metadataReads: 1, rawReads: 0, refreshes: 0 });
  expect(Buffer.concat(held.out).toString()).not.toContain("credential-value-must-not-be-read");
  expect(object(Buffer.concat(held.out).toString())["data"]).toContainEqual({
    provider: "openai", method: "key", state: "stored", credentialType: "api_key",
  });
});

test("a fresh runtime leaves ambient availability unobserved without probing it", async () => {
  vi.stubEnv("OPENAI_API_KEY", "ambient-value-must-not-be-read");
  const root = await mkdtemp(join(tmpdir(), "bot-auth-list-ambient-")); roots.push(root);
  const agentDir = join(root, "agent"); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(join(agentDir, "auth.json"), "{}", { mode: 0o600 });
  const held = boundary(fixture([]));
  held.value.authListRuntime = () => configuredAuthListRuntime({ agentDir, env: held.value.env, clock: held.value.clock });

  expect(await main(["auth", "list", "--json"], held.value)).toBe(0);
  expect(object(Buffer.concat(held.out).toString())["data"]).toContainEqual({
    provider: "openai", method: "key", state: "unobserved", credentialType: null,
  });
  expect(Buffer.concat(held.out).toString() + Buffer.concat(held.err).toString()).not.toContain("ambient-value-must-not-be-read");
});

test("models environment references stay unread and cannot change an unstored row", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-list-model-env-")); roots.push(root);
  const agentDir = join(root, "agent"); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(join(agentDir, "auth.json"), "{}", { mode: 0o600 });
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { "review-status": {
    baseUrl: "https://review.invalid/v1", api: "openai-completions", apiKey: "$REVIEW_STATUS_SECRET",
    models: [{ id: "review-model", contextWindow: 8192, maxTokens: 1024 }],
  } } }), { mode: 0o600 });
  const listing = async (secret: string): Promise<string> => {
    vi.stubEnv("REVIEW_STATUS_SECRET", secret);
    const snapshot = await configuredAuthListRuntime({ agentDir, env: {}, clock: boundary(fixture([])).value.clock });
    let statusCalls = 0;
    snapshot.runtime.getProviderAuthStatus = () => {
      statusCalls += 1;
      throw new Error("auth list must not inspect configured status");
    };
    const held = boundary(fixture([])); held.value.authListRuntime = () => Promise.resolve(snapshot);
    expect(await main(["auth", "list", "--json"], held.value)).toBe(0);
    expect(statusCalls).toBe(0);
    const output = Buffer.concat(held.out).toString();
    expect(object(output)["data"]).toContainEqual({
      provider: "review-status", method: "key", state: "unobserved", credentialType: null,
    });
    expect(output + Buffer.concat(held.err).toString()).not.toContain(secret);
    return output;
  };

  expect(await listing("first-environment-value")).toBe(await listing("second-environment-value"));
});

test("the current route stays separate from bare auth and warns once before its first store read", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-list-warning-")); roots.push(root);
  const retired = join(root, "credentials.json"); await writeFile(retired, "{}", { mode: 0o600 });
  const current = fixture([provider("current", "ambient-only")]);
  const legacy = fixture([provider("legacy", "key")]);
  legacy.runtime.checkAuth = () => Promise.resolve(undefined);
  const held = boundary(current);
  held.value.retiredCredentialPath = retired;
  held.value.beforeCredentialAccess = () => { current.events.push("warning"); };
  held.value.authRuntime = () => Promise.resolve(legacy.runtime);

  expect(await main(["auth", "list"], held.value)).toBe(0);
  expect(current.events).toEqual(["warning", "runtime", "list"]);
  expect(Buffer.concat(held.err).toString()).toBe("The retired Bot credential store is inactive; this command uses Pi's auth.json.\n");
  expect(Buffer.concat(held.out).toString()).toBe("current  ambient-only  unobserved\nShowing 1 of 1 providers.\n");

  const invalid = boundary(fixture([])); invalid.value.retiredCredentialPath = retired;
  expect(await main(["auth", "list", "--unknown"], invalid.value)).toBe(2);
  expect(Buffer.concat(invalid.err).toString()).not.toContain("retired Bot credential store");
  const help = boundary(fixture([])); help.value.retiredCredentialPath = retired;
  expect(await main(["auth", "list", "--help"], help.value)).toBe(0);
  expect(Buffer.concat(help.err).toString()).toBe("");
});

test("the auth list descriptor and generated help publish the exact contract", async () => {
  expect(CLI_CONTRACTS.find((held) => held.operation === ("auth.list" as never))).toEqual({
    operation: "auth.list", command: ["auth", "list"], output: { kind: "bot.auth.list", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "never", mutates: false, network: "never",
    options: [
      { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
      { name: "--limit", aliases: [], type: "integer", repeatable: false, default: 50, minimum: 1, maximum: 200 },
      { name: "--offset", aliases: [], type: "integer", repeatable: false, default: 0, minimum: 0, maximum: 2_147_483_647 },
    ],
    limits: { documentBytesExclusive: 1_048_576, humanCellBytes: 480, humanErrorBytes: 2_048,
      humanRowBytes: 4_096, identityBytes: 1_024, rowBytesExclusive: 4_096 },
  });
  const runtime = fixture([]), help = await invoke(["auth", "list", "--help"], runtime);
  expect(help.code, help.err).toBe(0);
  expect(help.out).toContain("usage: bot auth list [options]");
  expect(help.out).toContain("Output: bot.auth.list@1");
  expect(help.out).toContain("States are stored or unobserved. Unobserved does not mean unavailable.");
  expect(help.out).toContain("without resolving, probing, refreshing, or printing a credential");
  expect(runtime.events).toEqual([]);
});
