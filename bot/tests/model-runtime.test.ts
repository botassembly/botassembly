import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateModelRuntimeOptions, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import {
  configuredAuthListRuntime, configuredAuthLogoutRuntime, configuredModelRuntime, configuredProviderCatalog, type ModelRuntimeFactory,
} from "../src/model-runtime.ts";
import type { DriverClock } from "../src/process.ts";
import { nativeModelRuntime } from "./support/native-model-runtime.ts";

const metadata = vi.hoisted(() => ({
  agent: "", auth: "", model: "", accessFailure: "", openFailure: "", closeFailure: "", ownerUid: 0, foreignUid: 1,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const withUid = <T extends object>(facts: T, uid: number): T => new Proxy(facts, {
    get: (target, property) => property === "uid" ? uid : Reflect.get(target, property, target),
  });
  return {
    ...actual,
    lstat: async (path: string) => {
      const facts = await actual.lstat(path);
      if (path === metadata.auth || path === metadata.model) return withUid(facts, metadata.foreignUid);
      return path === metadata.agent ? withUid(facts, metadata.ownerUid) : facts;
    },
    access: async (path: string, mode?: number) => {
      if (path === metadata.accessFailure) throw Object.assign(new Error("access fixture"), { code: "EACCES" });
      return actual.access(path, mode);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const path = args[0];
      if (path === metadata.openFailure) throw Object.assign(new Error("open fixture"), { code: "EACCES" });
      const handle = await actual.open(...args);
      if (path !== metadata.closeFailure) return handle;
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close();
        throw Object.assign(new Error("close fixture"), { code: "EIO" });
      };
      return handle;
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
  metadata.model = "";
  metadata.accessFailure = "";
  metadata.openFailure = "";
  metadata.closeFailure = "";
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

function credentialFreeRuntime(): Promise<ModelRuntime> {
  return nativeModelRuntime({
    credentials: { read: () => Promise.resolve(undefined), list: () => Promise.resolve([]), modify: (_provider, change) => change(undefined), delete: () => Promise.resolve() },
    modelsPath: null, refreshOnCreate: false,
  });
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

test("a missing agent directory and model file pass credential-free preflight", async () => {
  const held = await agentRoot("bot-model-runtime-missing-agent-");
  const missing = join(held.root, "missing-agent");
  let calls = 0;
  const runtime = await configuredProviderCatalog(input(missing, held.credentials, () => {
    calls += 1;
    return credentialFreeRuntime();
  }));
  expect(runtime).toBeDefined();
  expect(calls).toBe(1);
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
  const owner = vi.spyOn(process, "geteuid").mockReturnValue(ownerUid);
  let calls = 0;
  try {
    await expect(configuredModelRuntime(input(held.agent, held.credentials, (options) => {
      calls += 1;
      return factoryRuntime(options);
    }))).rejects.toThrow(/not owned by the effective user/u);
  } finally {
    owner.mockRestore();
  }
  expect(calls).toBe(0);
});

test("a private regular model file supplies custom models, environment values, commands, and headers", async () => {
  const held = await agentRoot("bot-model-runtime-link-");
  await writeFile(join(held.agent, "models.json"), JSON.stringify({ providers: { local: {
    baseUrl: "https://local.invalid/v1", api: "openai-completions", apiKey: "$BOT_RUNTIME_KEY",
    headers: { "x-environment": "${BOT_RUNTIME_HEADER}", "x-command": "!printf command-header" },
    models: [{ id: "operator-model", reasoning: true, contextWindow: 8192, maxTokens: 1024 }],
  } } }), { mode: 0o600 });
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

test("a world-writable agent path fails before the runtime factory is called", async () => {
  const held = await agentRoot("bot-model-runtime-trust-");
  let calls = 0;
  const factory: ModelRuntimeFactory = (options) => {
    calls += 1;
    return factoryRuntime(options);
  };
  await chmod(held.agent, 0o702);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(held.agent);
  expect(calls).toBe(0);

});

test("a foreign-owned agent directory fails before the runtime factory is called", async () => {
  const held = await agentRoot("bot-model-runtime-foreign-");
  const geteuid = process.geteuid;
  if (geteuid === undefined) throw new Error("ownership test requires POSIX ownership support");
  const uid = geteuid();
  const owner = vi.spyOn(process, "geteuid").mockReturnValue(uid + 1);
  let calls = 0;
  try {
    await expect(configuredModelRuntime(input(held.agent, held.credentials, (options) => {
      calls += 1;
      return factoryRuntime(options);
    }))).rejects.toThrow(/not owned by the effective user/u);
  } finally {
    owner.mockRestore();
  }
  expect(calls).toBe(0);
});

test.each([0, 1_000])("a foreign-owned model file fails for effective uid %i with an otherwise valid agent directory", async (ownerUid) => {
  const held = await agentRoot("bot-model-runtime-foreign-model-");
  const model = join(held.agent, "models.json");
  await writeFile(model, '{"providers":{}}', { mode: 0o600 });
  Object.assign(metadata, { agent: held.agent, model, ownerUid, foreignUid: ownerUid + 1 });
  const owner = vi.spyOn(process, "geteuid").mockReturnValue(ownerUid);
  let calls = 0;
  try {
    await expect(configuredModelRuntime(input(held.agent, held.credentials, (options) => {
      calls += 1;
      return factoryRuntime(options);
    }))).rejects.toThrow(/not owned by the effective user/u);
  } finally {
    owner.mockRestore();
  }
  expect(calls).toBe(0);
});

test("a model-file symbolic link is refused before the runtime factory regardless of its target", async () => {
  const held = await agentRoot("bot-model-runtime-file-shape-");
  const models = join(held.agent, "models.json");
  const target = join(held.root, "private-models.json");
  let calls = 0;
  const factory: ModelRuntimeFactory = (options) => {
    calls += 1;
    return factoryRuntime(options);
  };
  await writeFile(target, '{"providers":{}}', { mode: 0o600 });
  await symlink(target, models);
  await expect(configuredModelRuntime(input(held.agent, held.credentials, factory))).rejects.toThrow(/models\.json.*symbolic link/iu);
  expect(calls).toBe(0);
});

test("a model-file directory is refused before the runtime factory", async () => {
  const held = await agentRoot("bot-model-runtime-directory-");
  const models = join(held.agent, "models.json");
  await mkdir(models);
  let calls = 0;
  await expect(configuredModelRuntime(input(held.agent, held.credentials, () => {
    calls += 1;
    throw new Error("factory must not run");
  }))).rejects.toThrow(/models\.json.*regular file/iu);
  expect(calls).toBe(0);
});

test.each([0o644, 0o660, 0o400, 0o602, 0o606])("model-file mode %o is refused before the runtime factory", async (mode) => {
  const held = await agentRoot("bot-model-runtime-mode-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  await chmod(models, mode);
  let calls = 0;
  await expect(configuredModelRuntime(input(held.agent, held.credentials, () => {
    calls += 1;
    throw new Error("factory must not run");
  }))).rejects.toThrow(/models\.json.*0600/iu);
  expect(calls).toBe(0);
});

test("an unreadable private model file is refused before the runtime factory", async () => {
  const held = await agentRoot("bot-model-runtime-unreadable-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  metadata.openFailure = models;
  let calls = 0;
  await expect(configuredModelRuntime(input(held.agent, held.credentials, () => {
    calls += 1;
    throw new Error("factory must not run");
  }))).rejects.toThrow(/models\.json.*readable/iu);
  expect(calls).toBe(0);
});

test("effective-user opening succeeds even when a real-user access probe would fail", async () => {
  const held = await agentRoot("bot-model-runtime-effective-read-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  metadata.accessFailure = models;
  let calls = 0;
  await configuredProviderCatalog(input(held.agent, held.credentials, () => {
    calls += 1;
    return credentialFreeRuntime();
  }));
  expect(calls).toBe(1);
});

test("a failed read-only verification close refuses before the runtime factory", async () => {
  const held = await agentRoot("bot-model-runtime-close-failure-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  metadata.closeFailure = models;
  let calls = 0;
  await expect(configuredProviderCatalog(input(held.agent, held.credentials, () => {
    calls += 1;
    return credentialFreeRuntime();
  }))).rejects.toThrow(/models\.json.*read-only verification.*close/iu);
  expect(calls).toBe(0);
});

test.each([
  ["credential-free catalog", configuredProviderCatalog],
  ["configured model runtime", configuredModelRuntime],
  ["authentication list", configuredAuthListRuntime],
] as const)("%s validates models.json before its runtime factory", async (_name, build) => {
  const held = await agentRoot("bot-model-runtime-route-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  await chmod(models, 0o644);
  let calls = 0;
  await expect(build(input(held.agent, held.credentials, () => {
    calls += 1;
    throw new Error("factory must not run");
  }))).rejects.toThrow(/models\.json.*0600/iu);
  expect(calls).toBe(0);
});

test("the credential-free catalog does not validate an authentication file it does not use", async () => {
  const held = await agentRoot("bot-model-runtime-catalog-boundary-");
  const auth = join(held.agent, "auth.json");
  await writeFile(auth, "{}", { mode: 0o600 });
  await chmod(auth, 0o644);
  let calls = 0;
  await configuredProviderCatalog(input(held.agent, held.credentials, () => {
    calls += 1;
    return credentialFreeRuntime();
  }));
  expect(calls).toBe(1);
});

test("the authentication-only logout runtime does not validate or load model configuration", async () => {
  const held = await agentRoot("bot-model-runtime-logout-boundary-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  await chmod(models, 0o644);
  let options: CreateModelRuntimeOptions | undefined;
  const runtime = await configuredAuthLogoutRuntime(input(held.agent, held.credentials, (supplied) => {
    options = supplied;
    return factoryRuntime(supplied);
  }));
  expect(runtime).toBeDefined();
  expect(options).toMatchObject({ authPath: join(held.agent, "auth.json"), modelsPath: null });
});

test("POSIX configuration ownership uses the effective user rather than the real user", async () => {
  const held = await agentRoot("bot-model-runtime-effective-owner-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  Object.assign(metadata, { agent: held.agent, model: models, ownerUid: 1_001, foreignUid: 1_001 });
  const real = vi.spyOn(process, "getuid").mockReturnValue(2_002);
  const effective = vi.spyOn(process, "geteuid").mockReturnValue(1_001);
  try {
    const runtime = await configuredProviderCatalog(input(held.agent, held.credentials, credentialFreeRuntime));
    expect(runtime).toBeDefined();
  } finally {
    real.mockRestore();
    effective.mockRestore();
  }
});

test("a platform without effective-user ownership support makes no filesystem claim", async () => {
  const held = await agentRoot("bot-model-runtime-no-effective-owner-");
  const models = join(held.agent, "models.json");
  await writeFile(models, '{"providers":{}}', { mode: 0o600 });
  await chmod(models, 0o644);
  const descriptor = Object.getOwnPropertyDescriptor(process, "geteuid");
  if (descriptor === undefined) throw new Error("process.geteuid descriptor is missing");
  let calls = 0;
  try {
    Object.defineProperty(process, "geteuid", { configurable: true, value: undefined });
    await configuredProviderCatalog(input(held.agent, held.credentials, () => {
      calls += 1;
      return credentialFreeRuntime();
    }));
  } finally {
    Object.defineProperty(process, "geteuid", descriptor);
  }
  expect(calls).toBe(1);
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
