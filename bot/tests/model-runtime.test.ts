import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateModelRuntimeOptions, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { configuredModelRuntime, type ModelRuntimeFactory } from "../src/model-runtime.ts";
import type { DriverClock } from "../src/process.ts";
import { nativeModelRuntime } from "./support/native-model-runtime.ts";

const metadata = vi.hoisted(() => ({ agent: "", auth: "", link: "", target: "", ownerUid: 0, foreignUid: 1 }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const withUid = <T extends object>(facts: T, uid: number): T => new Proxy(facts, {
    get: (target, property) => property === "uid" ? uid : Reflect.get(target, property, target),
  });
  return {
    ...actual,
    lstat: async (path: string) => {
      const facts = await actual.lstat(path);
      if (path === metadata.auth) return withUid(facts, metadata.foreignUid);
      return path === metadata.agent || path === metadata.link ? withUid(facts, metadata.ownerUid) : facts;
    },
    stat: async (path: string) => {
      const facts = await actual.stat(path);
      return path === metadata.target ? withUid(facts, metadata.foreignUid) : facts;
    },
  };
});

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => 0,
  timestamp: () => "2026-09-11T00:00:00.000Z",
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  vi.unstubAllEnvs();
  metadata.agent = "";
  metadata.auth = "";
  metadata.link = "";
  metadata.target = "";
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function agentRoot(prefix: string): Promise<{ root: string; agent: string; credentials: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const agent = join(root, "agent");
  await mkdir(agent, { mode: 0o700 });
  return { root, agent, credentials: join(root, "bot", "credentials.json") };
}

function input(agent: string, credentials: string, factory?: ModelRuntimeFactory) {
  return {
    agentDir: agent,
    env: { XDG_CONFIG_HOME: join(credentials, "..", "..") },
    clock,
    ...(factory === undefined ? {} : { factory }),
  };
}

function factoryRuntime(options: CreateModelRuntimeOptions): Promise<ModelRuntime> {
  if (options.authPath === undefined) throw new Error("configured runtime supplied no test authentication path");
  return nativeModelRuntime({ ...options, authPath: options.authPath });
}

test("runtime creation loads no missing model file, performs one offline refresh, and never starts a stream", async () => {
  const held = await agentRoot("bot-model-runtime-missing-");
  let options: CreateModelRuntimeOptions | undefined;
  const native = await nativeModelRuntime({ authPath: join(held.root, "empty-auth.json"), modelsPath: null, refreshOnCreate: false });
  const refresh = vi.spyOn(native, "refresh");
  const stream = vi.spyOn(native, "streamSimple");
  const runtime = await configuredModelRuntime(input(held.agent, held.credentials, (supplied) => {
    options = supplied;
    return Promise.resolve(native);
  }));

  expect(runtime).toBe(native);
  expect(options).toMatchObject({ authPath: join(held.agent, "auth.json"), modelsPath: join(held.agent, "models.json"), refreshOnCreate: false, allowModelNetwork: false });
  expect(options).not.toHaveProperty("credentials");
  expect(refresh).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledWith({ allowNetwork: false });
  expect(stream).not.toHaveBeenCalled();
});

test("a native runtime derives no credential state from an operator-home canary", async () => {
  const checkout = await realpath(process.cwd());
  const operator = await mkdtemp(join(checkout, ".bot-operator-canary-"));
  roots.push(operator);
  const operatorAgent = join(operator, ".pi", "agent");
  await mkdir(operatorAgent, { recursive: true, mode: 0o700 });
  await writeFile(join(operatorAgent, "auth.json"), JSON.stringify({
    openai: { type: "api_key", key: "operator-canary-must-not-load" },
  }), { mode: 0o600 });
  expect(join(operator, ".pi", "agent").startsWith(tmpdir())).toBe(false);
  vi.stubEnv("HOME", operator);
  vi.stubEnv("PI_CODING_AGENT_DIR", operatorAgent);

  const held = await agentRoot("bot-model-runtime-canary-"), authPath = join(held.agent, "auth.json");
  const runtime = await nativeModelRuntime({ authPath, modelsPath: null, refreshOnCreate: false });
  expect(await runtime.listCredentials()).toEqual([]);
});

test("an existing Pi auth store requires an owner-only real file and directory", async () => {
  const held = await agentRoot("bot-model-runtime-auth-trust-");
  const auth = join(held.agent, "auth.json");
  let calls = 0;
  const factory: ModelRuntimeFactory = (options) => {
    calls += 1;
    return factoryRuntime(options);
  };
  await chmod(held.agent, 0o755);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(/0700/u);
  await chmod(held.agent, 0o700);
  await writeFile(auth, "{}", { mode: 0o644 });
  await chmod(auth, 0o644);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(/0600/u);
  await rm(auth);
  const target = join(held.root, "auth-target.json");
  await writeFile(target, "{}", { mode: 0o600 });
  await symlink(target, auth);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(/symbolic link/u);
  expect(calls).toBe(0);
});

test("a corrupt Pi auth store fails through Pi's public reader before ordinary refresh", async () => {
  const held = await agentRoot("bot-model-runtime-auth-corrupt-");
  await writeFile(join(held.agent, "auth.json"), '{"openai":', { mode: 0o600 });
  let refreshes = 0;
  await expect(configuredModelRuntime(input(held.agent, held.credentials, async (options) => {
    const native = await factoryRuntime(options);
    vi.spyOn(native, "refresh").mockImplementation(() => { refreshes += 1; return Promise.resolve({ aborted: false, errors: new Map() }); });
    return native;
  }))).rejects.toThrow(/auth\.json/iu);
  expect(refreshes).toBe(0);
});

test.each([0, 1_000])("a foreign-owned Pi auth file fails for effective uid %i", async (ownerUid) => {
  const held = await agentRoot("bot-model-runtime-foreign-auth-");
  const auth = join(held.agent, "auth.json");
  await writeFile(auth, "{}", { mode: 0o600 });
  Object.assign(metadata, { agent: held.agent, auth, ownerUid, foreignUid: ownerUid + 1 });
  const owner = vi.spyOn(process, "getuid").mockReturnValue(ownerUid);
  let calls = 0;
  try {
    await expect(configuredModelRuntime(input(held.agent, held.credentials, (options) => {
      calls += 1;
      return factoryRuntime(options);
    }))).rejects.toThrow(/not owned by the current user/u);
  } finally {
    owner.mockRestore();
  }
  expect(calls).toBe(0);
});

test("an owner-controlled model symlink supplies custom models, environment values, commands, and headers", async () => {
  const held = await agentRoot("bot-model-runtime-link-");
  const target = join(held.root, "operator-models.json");
  await writeFile(target, JSON.stringify({ providers: { local: {
    baseUrl: "https://local.invalid/v1", api: "openai-completions", apiKey: "$BOT_RUNTIME_KEY",
    headers: { "x-environment": "${BOT_RUNTIME_HEADER}", "x-command": "!printf command-header" },
    models: [{ id: "operator-model", reasoning: true, contextWindow: 8192, maxTokens: 1024 }],
  } } }), { mode: 0o600 });
  await symlink(target, join(held.agent, "models.json"));
  vi.stubEnv("BOT_RUNTIME_KEY", "runtime-key-placeholder");
  vi.stubEnv("BOT_RUNTIME_HEADER", "environment-header");

  const runtime = await configuredModelRuntime(input(held.agent, held.credentials));
  const model = runtime.getModel("local", "operator-model");
  expect(model).toBeDefined();
  if (model === undefined) return;
  const auth = await runtime.getAuth(model);
  expect(auth?.auth.apiKey).toBe("runtime-key-placeholder");
  expect(auth?.auth.headers).toMatchObject({ "x-environment": "environment-header", "x-command": "command-header" });
});

test("Pi provider-owned file authentication is available through the configured runtime", async () => {
  const held = await agentRoot("bot-model-runtime-provider-file-");
  const providerCredential = join(held.root, "provider-owned.json");
  await writeFile(providerCredential, "{}", { mode: 0o600 });
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", providerCredential);
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "local-project");
  vi.stubEnv("GOOGLE_CLOUD_LOCATION", "local-location");

  const runtime = await configuredModelRuntime(input(held.agent, held.credentials));
  expect((await runtime.getAvailable()).some((model) => model.provider === "google-vertex")).toBe(true);
});

test("world-writable agent and model paths fail before the runtime factory is called", async () => {
  const held = await agentRoot("bot-model-runtime-trust-");
  let calls = 0;
  const factory: ModelRuntimeFactory = (options) => {
    calls += 1;
    return factoryRuntime(options);
  };
  await chmod(held.agent, 0o702);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(held.agent);
  expect(calls).toBe(0);

  await chmod(held.agent, 0o700);
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  await chmod(models, 0o602);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(models);
  expect(calls).toBe(0);
});

test("a foreign-owned agent directory fails before the runtime factory is called", async () => {
  const held = await agentRoot("bot-model-runtime-foreign-");
  const getuid = process.getuid;
  if (getuid === undefined) throw new Error("ownership test requires POSIX ownership support");
  const uid = getuid();
  const owner = vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
  let calls = 0;
  try {
    await expect(configuredModelRuntime(input(held.agent, held.credentials, (options) => {
      calls += 1;
      return factoryRuntime(options);
    }))).rejects.toThrow(/not owned by the current user/u);
  } finally {
    owner.mockRestore();
  }
  expect(calls).toBe(0);
});

test.each([0, 1_000])("a foreign-owned resolved model file fails for effective uid %i with an otherwise valid agent directory", async (ownerUid) => {
  const held = await agentRoot("bot-model-runtime-foreign-target-");
  const target = join(held.root, "foreign-models.json");
  const link = join(held.agent, "models.json");
  await writeFile(target, '{"providers":{}}', { mode: 0o600 });
  await symlink(target, link);
  Object.assign(metadata, { agent: held.agent, link, target, ownerUid, foreignUid: ownerUid + 1 });
  const owner = vi.spyOn(process, "getuid").mockReturnValue(ownerUid);
  let calls = 0;
  try {
    await expect(configuredModelRuntime(input(held.agent, held.credentials, (options) => {
      calls += 1;
      return factoryRuntime(options);
    }))).rejects.toThrow(/not owned by the current user/u);
  } finally {
    owner.mockRestore();
  }
  expect(calls).toBe(0);
});

test("unreadable and non-regular model paths fail before the runtime factory is called", async () => {
  const held = await agentRoot("bot-model-runtime-file-shape-");
  const models = join(held.agent, "models.json");
  let calls = 0;
  const factory: ModelRuntimeFactory = (options) => {
    calls += 1;
    return factoryRuntime(options);
  };
  await writeFile(models, '{"providers":{}}', { mode: 0o000 });
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow();
  expect(calls).toBe(0);

  await rm(models);
  await mkdir(models);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(/not a regular file/u);
  expect(calls).toBe(0);
});

test("corrupt configuration reports Pi's validation error before the ordinary refresh", async () => {
  const held = await agentRoot("bot-model-runtime-corrupt-");
  await writeFile(join(held.agent, "models.json"), "{", { mode: 0o600 });
  let native: ModelRuntime | undefined;
  let refreshes = 0;
  await expect(configuredModelRuntime(input(held.agent, held.credentials, async (options) => {
    native = await factoryRuntime(options);
    vi.spyOn(native, "refresh").mockImplementation(() => { refreshes += 1; return Promise.resolve({ aborted: false, errors: new Map() }); });
    return native;
  }))).rejects.toThrow(/Failed to parse models\.json/u);
  expect(native?.getAvailableSnapshot()).toEqual([]);
  expect(refreshes).toBe(0);
});

test("schema-invalid configuration reports Pi's validation error before the ordinary refresh", async () => {
  const held = await agentRoot("bot-model-runtime-invalid-");
  await writeFile(join(held.agent, "models.json"), '{"providers":{"broken":{"models":[]}}}', { mode: 0o600 });
  let native: ModelRuntime | undefined;
  let refreshes = 0;
  await expect(configuredModelRuntime(input(held.agent, held.credentials, async (options) => {
    native = await factoryRuntime(options);
    vi.spyOn(native, "refresh").mockImplementation(() => { refreshes += 1; return Promise.resolve({ aborted: false, errors: new Map() }); });
    return native;
  }))).rejects.toThrow(/Pi model runtime failed/u);
  expect(native?.getAvailableSnapshot()).toEqual([]);
  expect(refreshes).toBe(0);
});
