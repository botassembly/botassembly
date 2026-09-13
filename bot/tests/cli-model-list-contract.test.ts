import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels, fauxProvider, type Api, type Model, type Models, type ModelsRefreshOptions, type ModelsRefreshResult, type Provider } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS, NEW_COMMAND_ERROR_BYTES } from "../src/cli-contract.ts";
import { mapping } from "../src/model.ts";
import { configuredModelRuntime } from "../src/model-runtime.ts";

interface Invocation { code: number; out: string; err: string }
interface FixtureRuntime { models: Models; refreshes: ModelsRefreshOptions[]; events: string[] }

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function listedModel(provider: string, id: string, contextWindow = 8_192, maxTokens = 1_024): Model<Api> {
  const held = fauxProvider({ provider, models: [{ id, reasoning: true, contextWindow, maxTokens,
    cost: { input: 1.25, output: 2.5, cacheRead: 0, cacheWrite: 0 } }] }).models[0];
  return held;
}

function fixtureRuntime(
  before: readonly Model<Api>[], after = before,
  settlement: ModelsRefreshResult = { aborted: false, errors: new Map() },
): FixtureRuntime {
  let current = before;
  const refreshes: ModelsRefreshOptions[] = [], events: string[] = [];
  const providers = new Map([...before, ...after].map((model) => [model.provider, { id: model.provider } as Provider]));
  const models = {
    getProvider: (id: string) => providers.get(id),
    getProviders: () => [...providers.values()],
    getModels: (provider?: string) => current.filter((model) => provider === undefined || model.provider === provider),
    getAvailable: (provider?: string) => Promise.resolve(current.filter((model) => provider === undefined || model.provider === provider)),
    checkAuth: (provider: string) => Promise.resolve(providers.has(provider) ? { source: "fixture" } : undefined),
    refresh: (options?: ModelsRefreshOptions) => {
      events.push("refresh"); refreshes.push(options ?? {}); current = after; return Promise.resolve(settlement);
    },
  } as unknown as Models;
  return { models, refreshes, events };
}

function boundary(runtime: FixtureRuntime, env: NodeJS.ProcessEnv = {}): { value: CliBoundary; out: Buffer[]; err: Buffer[] } {
  const out: Buffer[] = [], err: Buffer[] = [];
  return { out, err, value: {
    cwd: "/", env, stdinIsTTY: true, stderrIsTTY: false, readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { out.push(Buffer.from(bytes)); }, stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-11T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
    modelRuntime: () => { runtime.events.push("runtime"); return Promise.resolve(runtime.models); },
    authProvider: (id) => runtime.models.getProvider(id),
  } };
}

async function invoke(args: string[], runtime: FixtureRuntime, env: NodeJS.ProcessEnv = {}): Promise<Invocation> {
  const held = boundary(runtime, env);
  const code = await main(args, held.value);
  return { code, out: Buffer.concat(held.out).toString(), err: Buffer.concat(held.err).toString() };
}

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected an object.");
  return value;
}

type ThrowSite = "runtime" | "available" | "auth" | "refresh" | "row";

function installSynchronousThrow(site: ThrowSite, held: CliBoundary, runtime: FixtureRuntime,
  model: Model<Api>, hostile: Error): void {
  if (site === "runtime") held.modelRuntime = () => { throw hostile; };
  if (site === "available") vi.spyOn(runtime.models, "getAvailable").mockImplementation(() => { throw hostile; });
  if (site === "auth") vi.spyOn(runtime.models, "checkAuth").mockImplementation(() => { throw hostile; });
  if (site === "refresh") vi.spyOn(runtime.models, "refresh").mockImplementation(() => { throw hostile; });
  if (site === "row") Object.defineProperty(model, "cost", { get: () => { throw hostile; } });
}

function synchronousThrowArgs(site: ThrowSite, json: boolean): string[] {
  return ["model", "list", ...(site === "auth" ? ["alpha", "--live"] : site === "refresh" ? ["--live"] : []),
    ...(json ? ["--json"] : [])];
}

test("model list returns one sorted paged snapshot with exact nullable status", async () => {
  const sharedBefore = listedModel("zeta", "shared", 1_000, 100);
  const sharedAfter = listedModel("zeta", "shared", 2_000, 200);
  const runtime = fixtureRuntime(
    [sharedBefore, listedModel("alpha", "local")],
    [listedModel("beta", "live"), sharedAfter],
  );

  const result = await invoke(["model", "list", "--live", "--offset", "1", "--limit", "1", "--json"], runtime);

  expect(result).toMatchObject({ code: 0, err: "" });
  expect(object(result.out)).toEqual({
    schemaVersion: 1, kind: "bot.model.list",
    data: [{ provider: "beta", model: "live", contextWindow: 8_192, maxOutput: 1_024, reasoning: true,
      cost: { input: 1.25, output: 2.5 }, status: "live-only" }],
    page: { offset: 1, limit: 1, nextOffset: 2, complete: false },
    summary: { total: 3, returned: 1 },
  });
  expect(runtime.refreshes).toEqual([{ force: true, allowNetwork: true }]);

  const full = object((await invoke(["model", "list", "--live", "--json"], fixtureRuntime(
    [sharedBefore, listedModel("alpha", "local")], [listedModel("beta", "live"), sharedAfter],
  ))).out);
  expect(full["data"]).toEqual([
    expect.objectContaining({ provider: "alpha", model: "local", status: "local-only" }),
    expect.objectContaining({ provider: "beta", model: "live", status: "live-only" }),
    expect.objectContaining({ provider: "zeta", model: "shared", contextWindow: 2_000, maxOutput: 200, status: null }),
  ]);
});

test("ordinary and named listings use local availability without a requested catalog refresh", async () => {
  const runtime = fixtureRuntime([listedModel("zeta", "two"), listedModel("alpha", "one")]);
  const result = await invoke(["model", "list", "--json"], runtime);
  expect(result.code, result.err).toBe(0);
  expect(object(result.out)).toEqual({
    schemaVersion: 1, kind: "bot.model.list",
    data: [
      expect.objectContaining({ provider: "alpha", model: "one", status: null }),
      expect.objectContaining({ provider: "zeta", model: "two", status: null }),
    ],
    page: { offset: 0, limit: 50, nextOffset: null, complete: true }, summary: { total: 2, returned: 2 },
  });
  expect(runtime.refreshes).toEqual([]);
  expect(await invoke(["model", "list", "-j"], runtime)).toEqual(result);

  const named = await invoke(["model", "list", "zeta"], runtime);
  expect(named).toEqual({ code: 0,
    out: "zeta  two  8192  1024  reasoning  $1.25  $2.50\nShowing 1 of 1 models.\n", err: "" });

  const first = object((await invoke(["model", "list", "--offset", "0", "--limit", "1", "--json"], runtime)).out);
  const second = object((await invoke(["model", "list", "--offset", "1", "--limit", "1", "--json"], runtime)).out);
  expect(first["data"]).toEqual([expect.objectContaining({ provider: "alpha", model: "one" })]);
  expect(second["data"]).toEqual([expect.objectContaining({ provider: "zeta", model: "two" })]);
  expect(first["page"]).toEqual({ offset: 0, limit: 1, nextOffset: 1, complete: false });
  expect(second["page"]).toEqual({ offset: 1, limit: 1, nextOffset: null, complete: true });
});

test("live listing honors PI_OFFLINE and reports typed refresh settlements without stale rows", async () => {
  const offline = fixtureRuntime([listedModel("alpha", "old")], [listedModel("alpha", "new")]);
  expect((await invoke(["model", "list", "--live", "--json"], offline, { PI_OFFLINE: "1" })).code).toBe(0);
  expect(offline.refreshes).toEqual([{ force: true, allowNetwork: false }]);

  const named = fixtureRuntime([listedModel("alpha", "old")], [listedModel("alpha", "new")]);
  expect((await invoke(["model", "list", "alpha", "--live", "--json"], named)).code).toBe(0);
  expect(named.refreshes).toEqual([{ force: true, allowNetwork: true, providers: ["alpha"] }]);

  const aborted = await invoke(["model", "list", "--live", "--json"], fixtureRuntime(
    [listedModel("alpha", "stale")], [], { aborted: true, errors: new Map() },
  ));
  expect(aborted).toMatchObject({ code: 1, out: "" });
  expect(object(aborted.err)).toMatchObject({ error: {
    operation: "model.list", code: "state-not-reached", cause: "refresh-aborted", retryable: false,
  } });

  const failed = await invoke(["model", "list", "--live", "--json"], fixtureRuntime(
    [listedModel("alpha", "stale")], [], { aborted: false, errors: new Map([["alpha", new Error("secret provider detail")]]) },
  ));
  expect(failed).toMatchObject({ code: 4, out: "" });
  expect(object(failed.err)).toMatchObject({ error: {
    operation: "model.list", code: "dependency-failed", cause: "refresh-failed", retryable: true,
    message: "The live model catalog refresh failed for alpha.",
  } });
  expect(failed.err).not.toContain("secret provider detail");
});

test("model list rejects malformed requests before credential access", async () => {
  const invalid = [
    ["model", "list", "--live", "--live"], ["model", "list", "--json", "-j"],
    ["model", "list", "--offset", "-1"], ["model", "list", "--offset", "2147483648"],
    ["model", "list", "--limit", "0"], ["model", "list", "--limit", "201"],
    ["model", "list", "--offset"], ["model", "list", "--limit"],
    ["model", "list", "alpha", "beta"], ["model", "list", "--home", "/outside"],
    ["model", "list", "x".repeat(1_025)],
  ];
  for (const args of invalid) {
    const runtime = fixtureRuntime([]);
    const result = await invoke(args, runtime);
    expect(result.code, args.join(" ")).toBe(2);
    expect(result.out).toBe("");
    expect(runtime.events).toEqual([]);
    expect(Buffer.byteLength(result.err)).toBeLessThanOrEqual(2_049);
  }
});

test("the current command reads operator models from the same injected Pi runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-model-list-configured-")); roots.push(root);
  const agentDir = join(root, "agent"); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { local: {
    baseUrl: "https://local.invalid/v1", api: "openai-completions", apiKey: "fixture-key",
    models: [{ id: "operator-model", reasoning: true, contextWindow: 4096, maxTokens: 512 }],
  } } }), { mode: 0o600 });
  const clock = boundary(fixtureRuntime([])).value.clock;
  const models = await configuredModelRuntime({ agentDir, env: {}, clock });
  const runtime: FixtureRuntime = { models, refreshes: [], events: [] };

  const result = await invoke(["model", "list", "local", "--json"], runtime);
  expect(result.code, result.err).toBe(0);
  expect(object(result.out)["data"]).toEqual([expect.objectContaining({
    provider: "local", model: "operator-model", contextWindow: 4_096, maxOutput: 512, status: null,
  })]);
});

test("unknown providers and invalid runtime rows fail with no partial result", async () => {
  const unknown = await invoke(["model", "list", "missing", "--json"], fixtureRuntime([listedModel("alpha", "one")]));
  expect(unknown).toMatchObject({ code: 2, out: "" });
  expect(object(unknown.err)).toMatchObject({ error: { operation: "model.list", cause: "provider-unknown" } });

  const oversized = listedModel("alpha", "x".repeat(1_025));
  const invalid = await invoke(["model", "list", "--json"], fixtureRuntime([listedModel("alpha", "valid"), oversized]));
  expect(invalid).toMatchObject({ code: 5, out: "" });
  expect(object(invalid.err)).toMatchObject({ error: {
    operation: "model.list", code: "integrity-failed", cause: "model-invalid", retryable: false,
  } });
});

test("an unknown provider stops at safe provider metadata before warning or runtime construction", async () => {
  const runtime = fixtureRuntime([listedModel("alpha", "one")]);
  const held = boundary(runtime);
  held.value.beforeCredentialAccess = () => { runtime.events.push("warning"); };
  held.value.authProvider = (id) => { runtime.events.push(`catalog:${id}`); return undefined; };

  expect(await main(["model", "list", "missing", "--json"], held.value)).toBe(2);
  expect(runtime.events).toEqual(["catalog:missing"]);
  expect(object(Buffer.concat(held.err).toString())).toMatchObject({
    error: { operation: "model.list", code: "request-invalid", cause: "provider-unknown", retryable: false },
  });
});

test.each([
  ["runtime", "runtime-unavailable", "Pi model runtime could not be initialized."],
  ["available", "availability-unavailable", "Model availability could not be read."],
  ["auth", "authentication-unavailable", "Provider authentication status could not be read."],
  ["refresh", "refresh-failed", "The live model catalog refresh failed."],
] as const)("a rejected %s operation emits only its stable secret-safe failure", async (site, cause, message) => {
  const secret = "secret-fragment-from-pi";
  for (const json of [false, true]) {
    const runtime = fixtureRuntime([listedModel("alpha", "one")]);
    const held = boundary(runtime);
    held.value.authProvider = (id) => runtime.models.getProvider(id);
    if (site === "runtime") held.value.modelRuntime = () => Promise.reject(new Error(secret));
    if (site === "available") vi.spyOn(runtime.models, "getAvailable").mockRejectedValue(new Error(secret));
    if (site === "auth") vi.spyOn(runtime.models, "checkAuth").mockRejectedValue(new Error(secret));
    if (site === "refresh") vi.spyOn(runtime.models, "refresh").mockRejectedValue(new Error(secret));
    const args = ["model", "list", ...(site === "auth" ? ["alpha", "--live"] : site === "refresh" ? ["--live"] : []),
      ...(json ? ["--json"] : [])];

    expect(await main(args, held.value)).toBe(4);
    expect(Buffer.concat(held.out)).toHaveLength(0);
    const error = Buffer.concat(held.err).toString();
    expect(error).not.toContain(secret);
    if (json) expect(object(error)).toMatchObject({ error: {
      operation: "model.list", code: "dependency-failed", cause, message, retryable: true,
    } });
    else expect(error).toBe(`${message}\n`);
  }
});

test.each([
  ["runtime", 4, "dependency-failed", "runtime-unavailable", "Pi model runtime could not be initialized.", true],
  ["available", 4, "dependency-failed", "availability-unavailable", "Model availability could not be read.", true],
  ["auth", 4, "dependency-failed", "authentication-unavailable", "Provider authentication status could not be read.", true],
  ["refresh", 4, "dependency-failed", "refresh-failed", "The live model catalog refresh failed.", true],
  ["row", 5, "integrity-failed", "model-invalid", "The Pi model runtime returned invalid model metadata.", false],
] as const)("a synchronous %s throw emits a bounded stable failure", async (site, exit, code, cause, message, retryable) => {
  const secret = `credential_fragment_in_code_${"x".repeat(5_000)}`;
  for (const json of [false, true]) {
    const model = listedModel("alpha", "one"), runtime = fixtureRuntime([model]);
    const held = boundary(runtime), hostile = Object.assign(new Error(`message_${secret}`), { code: secret });
    installSynchronousThrow(site, held.value, runtime, model, hostile);

    expect(await main(synchronousThrowArgs(site, json), held.value)).toBe(exit);
    expect(Buffer.concat(held.out)).toHaveLength(0);
    const error = Buffer.concat(held.err).toString();
    expect(error).not.toContain("credential_fragment_in_code");
    expect(Buffer.byteLength(error)).toBeLessThanOrEqual(NEW_COMMAND_ERROR_BYTES + 1);
    if (json) expect(object(error)).toMatchObject({ error: {
      operation: "model.list", code, cause, message, retryable,
    } });
    else expect(error).toBe(`${message}\n`);
  }
});

test("empty and maximum pages stay within their complete output bounds", async () => {
  const empty = await invoke(["model", "list", "--json"], fixtureRuntime([]));
  expect(empty).toEqual({ code: 0, err: "", out: JSON.stringify({
    schemaVersion: 1, kind: "bot.model.list", data: [],
    page: { offset: 0, limit: 50, nextOffset: null, complete: true }, summary: { total: 0, returned: 0 },
  }) + "\n" });

  const models = Array.from({ length: 200 }, (_value, index) => listedModel(
    `provider-${String(index).padStart(3, "0")}-${"p".repeat(1_011)}`, `model-${String(index).padStart(3, "0")}`,
  ));
  const json = await invoke(["model", "list", "--limit", "200", "--json"], fixtureRuntime(models));
  const human = await invoke(["model", "list", "--limit", "200"], fixtureRuntime(models));
  expect(json.code, json.err).toBe(0);
  expect(human.code, human.err).toBe(0);
  expect(Buffer.byteLength(json.out)).toBeLessThan(1_048_576);
  expect(Buffer.byteLength(human.out)).toBeLessThan(1_048_576);
  expect(object(json.out)["summary"]).toEqual({ total: 200, returned: 200 });
  expect(human.out).toContain("Showing 200 of 200 models.\n");
});

test("the current route stays separate from legacy models and warns before runtime construction", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-model-list-warning-")); roots.push(root);
  const retired = join(root, "credentials.json"); await writeFile(retired, "{}", { mode: 0o600 });
  const runtime = fixtureRuntime([listedModel("alpha", "one")]);
  const held = boundary(runtime); held.value.retiredCredentialPath = retired;
  held.value.beforeCredentialAccess = () => { runtime.events.push("warning"); };
  const legacy = createModels(); legacy.setProvider(fauxProvider({ provider: "legacy", models: [{ id: "old" }] }).provider);
  held.value.models = legacy;

  expect(await main(["model", "list", "--json"], held.value)).toBe(0);
  expect(runtime.events).toEqual(["warning", "runtime"]);
  expect(Buffer.concat(held.err).toString()).toBe("The retired Bot credential store is inactive; this command uses Pi's auth.json.\n");

});

test("the model list descriptor and generated help publish the exact contract", async () => {
  expect(CLI_CONTRACTS.find((held) => held.operation === "model.list")).toEqual({
    operation: "model.list", command: ["model", "list"], output: { kind: "bot.model.list", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "never", mutates: false, network: "requested",
    options: [
      { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
      { name: "--limit", aliases: [], type: "integer", repeatable: false, default: 50, minimum: 1, maximum: 200 },
      { name: "--live", aliases: [], type: "boolean", repeatable: false },
      { name: "--offset", aliases: [], type: "integer", repeatable: false, default: 0, minimum: 0, maximum: 2_147_483_647 },
    ],
    limits: { documentBytesExclusive: 1_048_576, humanCellBytes: 480, humanErrorBytes: 2_048,
      humanRowBytes: 4_096, identityBytes: 1_024, rowBytesExclusive: 4_096 },
  });
  const runtime = fixtureRuntime([]), help = await invoke(["model", "list", "--help"], runtime);
  expect(help.code, help.err).toBe(0);
  expect(help.out).toContain("usage: bot model list [provider]");
  expect(help.out).toContain("Output: bot.model.list@1");
  expect(runtime.events).toEqual([]);
});
