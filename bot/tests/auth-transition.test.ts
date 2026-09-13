import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { main } from "../src/cli.ts";
import { configuredAuthListRuntime, configuredModelRuntime, configuredProviderCatalog } from "../src/model-runtime.ts";
import { fileCredentialStore } from "../src/credentials.ts";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";
import { nativeModelRuntime } from "./support/native-model-runtime.ts";

const roots = tempRoots();
afterEach(() => { vi.unstubAllEnvs(); return roots.cleanup(); });

const WARNING = "The retired Bot credential store is inactive; this command uses Pi's auth.json.\n";
const SECRET = "not-a-real-key-0245";

async function fixture() {
  const { root, home } = await roots.scratch("bot-auth-transition-");
  const flow = join(home, "assemblies/review/flows/main");
  const agentDir = join(root, "pi-agent");
  const retired = join(root, "config/bot/credentials.json");
  await mkdir(flow, { recursive: true });
  await mkdir(agentDir, { mode: 0o700 });
  await mkdir(join(root, "config/bot"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
    writeFile(retired, JSON.stringify({ openai: { type: "api_key", key: SECRET } }), { mode: 0o600 }),
  ]);
  const output: Buffer[] = [], errors: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, output, errors);
  held.retiredCredentialPath = retired;
  held.authPath = join(agentDir, "auth.json");
  let runtime: Promise<ModelRuntime> | undefined;
  let catalog: Promise<ModelRuntime> | undefined;
  held.authRuntime = () => {
    runtime ??= configuredModelRuntime({ agentDir, env: held.env, clock: held.clock });
    return runtime;
  };
  held.modelRuntime = () => {
    runtime ??= configuredModelRuntime({ agentDir, env: held.env, clock: held.clock });
    return runtime;
  };
  held.authListRuntime = () => configuredAuthListRuntime({ agentDir, env: held.env, clock: held.clock });
  held.authProvider = async (id) => {
    if (id === faux.provider.id) return faux.provider;
    catalog ??= configuredProviderCatalog({ agentDir, env: held.env, clock: held.clock });
    return (await catalog).getProvider(id);
  };
  held.readLine = () => Promise.resolve(SECRET);
  return { root, home, retired, held, faux, output, errors };
}

test("every authentication surface warns once and leaves the retired store byte-for-byte rollback-readable", async () => {
  const held = await fixture();
  const beforeBytes = await readFile(held.retired);
  const before = await lstat(held.retired);
  held.faux.setResponses([fauxAssistantMessage("done")]);
  const firstOffset = Buffer.concat(held.errors).length;
  expect(await main(["run", "start", "review/main", "request", "--retries", "0"], held.held)).toBe(1);
  expect(Buffer.concat(held.errors).subarray(firstOffset).toString().split(WARNING).length - 1).toBe(1);
  const donor = (await runsIn(held.home)).at(-1);
  if (donor === undefined) throw new Error("fixture created no donor run");

  const surfaces = [
    ["run", "start", "review/main", "request"],
    ["run", "resume", donor],
    ["model", "list", "faux"],
    ["auth", "list"],
    ["auth", "login", "openai"],
    ["auth", "logout", "openai"],
  ] as const;
  for (const argv of surfaces) {
    held.faux.setResponses([writes("$OUTPUT", "done"), fauxAssistantMessage("done")]);
    const offset = Buffer.concat(held.errors).length;
    await main([...argv], held.held);
    const addition = Buffer.concat(held.errors).subarray(offset).toString();
    expect(addition.split(WARNING).length - 1, argv.join(" ")).toBe(1);
    expect(addition).not.toContain(SECRET);
  }

  const after = await lstat(held.retired);
  expect(await readFile(held.retired)).toEqual(beforeBytes);
  expect({ ino: after.ino, uid: after.uid, gid: after.gid, mode: after.mode & 0o777 })
    .toEqual({ ino: before.ino, uid: before.uid, gid: before.gid, mode: before.mode & 0o777 });
  expect(await fileCredentialStore(held.retired, held.held.clock).read("openai"))
    .toEqual({ type: "api_key", key: SECRET });
});

test("help, checks, inspections, and import refusal do not warn", async () => {
  const held = await fixture();
  for (const argv of [
    ["auth", "list", "--help"], ["capabilities"], ["assembly", "list"], ["assembly", "check", "review/main"],
    ["run", "list"], ["auth", "import", join(held.root, "never-read")],
  ]) {
    const offset = Buffer.concat(held.errors).length;
    await main(argv, held.held);
    expect(Buffer.concat(held.errors).subarray(offset).toString()).not.toContain(WARNING);
  }
});

test("help and specification publish the current authentication surface", async () => {
  const held = await fixture();
  await main([], held.held);
  const publications = [
    Buffer.concat(held.output).toString(),
    await readFile(new URL("../../specification/elements/auth.md", import.meta.url), "utf8"),
  ];
  const help = publications[0] ?? "";
  const specification = publications[1] ?? "";
  for (const surface of ["run start", "run resume", "model list", "auth list", "auth login", "auth logout"]) {
    expect(help).toContain(surface);
  }
  expect(specification).toMatch(/resolved agent directory/iu);
  expect(specification).toMatch(/default[\s\S]{0,30}(?:~|\$HOME)\/.pi\/agent\/auth\.json/iu);
  expect(specification).toMatch(/import[^.]*empty Pi authentication/iu);
  for (const surface of ["bot auth list", "bot auth login", "bot auth logout", "bot auth import"]) {
    expect(specification).toContain(surface);
  }
  const normalizedSpecification = specification.replace(/\s+/gu, " ");
  expect(normalizedSpecification).toContain("`bot run start`, `bot run resume`, and `bot model list`, plus `bot auth list`, `bot auth login`, and `bot auth logout`, warn once after validation and before authentication begins. Help, capabilities, assembly commands, checks, and record inspection do not warn. `bot auth import` is excluded from this warning and emits its import-specific result or failure.");

  const reference = await readFile(new URL("../../docs/src/content/docs/reference/auth.md", import.meta.url), "utf8");
  for (const anchor of ["authentication", "the-commands", "the-listing", "logging-in", "the-laws"]) {
    expect(reference).toContain(`/specification/running/#${anchor}`);
  }
  expect(reference).toContain("/guides/install-and-use/#credentials");
});

test("concurrent Pi runtime mutations refresh each other's stored credentials", async () => {
  const { root } = await roots.scratch("bot-auth-concurrent-");
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { mode: 0o700 });
  const options = { authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false } as const;
  const [first, second] = await Promise.all([nativeModelRuntime(options), nativeModelRuntime(options)]);
  const interaction = (key: string) => ({ prompt: () => Promise.resolve(key), notify: () => undefined });
  await Promise.all([
    first.login("openai", "api_key", interaction("first-key")),
    second.login("groq", "api_key", interaction("second-key")),
  ]);
  expect((await first.listCredentials()).map(({ providerId }) => providerId).sort()).toEqual(["groq", "openai"]);
  expect((await second.listCredentials()).map(({ providerId }) => providerId).sort()).toEqual(["groq", "openai"]);
});

test.each(["run", "resume"] as const)("an expired OAuth refresh during a real %s retains concurrent Pi credential activity", async (surface) => {
  const { root, home } = await roots.scratch(`bot-auth-refresh-${surface}-`);
  const flow = join(home, "assemblies/review/flows/main");
  const agentDir = join(root, "agent");
  const authPath = join(agentDir, "auth.json");
  await mkdir(flow, { recursive: true });
  await mkdir(agentDir, { mode: 0o700 });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  const { held, faux } = realBoundary(root, home, [], []);
  let donor: string | undefined;
  if (surface === "resume") {
    faux.setResponses([fauxAssistantMessage("done")]);
    expect(await main(["run", "start", "review/main", "request", "--retries", "0"], held)).toBe(1);
    donor = (await runsIn(home)).at(-1);
    if (donor === undefined) throw new Error("fixture created no donor run");
  }
  const [runtime, concurrent] = await Promise.all([
    nativeModelRuntime({ authPath, modelsPath: null, refreshOnCreate: false }),
    nativeModelRuntime({ authPath, modelsPath: null, refreshOnCreate: false }),
  ]);
  let refreshStarted = (): void => undefined;
  const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
  let releaseRefresh = (): void => undefined;
  const release = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let armed = false;
  let refreshCount = 0;
  const nativeRefresh = runtime.refresh.bind(runtime);
  let registrationRefresh: ReturnType<ModelRuntime["refresh"]> | undefined;
  const refreshSpy = vi.spyOn(runtime, "refresh").mockImplementation((options) => {
    const refresh = nativeRefresh(options);
    registrationRefresh ??= refresh;
    return refresh;
  });
  runtime.registerNativeProvider({
    ...faux.provider,
    auth: { oauth: {
      name: "Refresh fixture",
      login: () => Promise.reject(new Error("unused login")),
      refresh: async () => {
        if (!armed) throw new Error("OAuth refresh ran before the contention witness was armed");
        refreshCount++;
        refreshStarted();
        await release;
        return { type: "oauth", refresh: "new-refresh", access: "fresh", expires: 4_102_444_800_000 };
      },
      toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
    } },
  });
  if (registrationRefresh === undefined) throw new Error("registration started no refresh");
  await registrationRefresh;
  refreshSpy.mockRestore();
  await writeFile(authPath, JSON.stringify({ faux: { type: "oauth", refresh: "old-refresh", access: "expired", expires: 0 } }), { mode: 0o600 });
  expect(await runtime.listCredentials()).toEqual([{ providerId: "faux", type: "oauth" }]);
  armed = true;
  faux.setResponses([writes("$OUTPUT", "done"), fauxAssistantMessage("done")]);
  Reflect.deleteProperty(held, "models");
  held.modelRuntime = () => Promise.resolve(runtime);
  const running = surface === "run"
    ? main(["run", "start", "review/main", "request"], held)
    : main(["run", "resume", donor ?? "missing-donor"], held);
  await started;
  const heldLock = await lstat(`${authPath}.lock`);
  expect(heldLock.isDirectory()).toBe(true);
  let promptCompleted = (): void => undefined;
  const completed = new Promise<void>((resolve) => { promptCompleted = resolve; });
  let activitySettled = false;
  const activity = concurrent.login("openai", "api_key", {
    prompt: () => { promptCompleted(); return Promise.resolve("concurrent-key"); },
    notify: () => undefined,
  });
  void activity.finally(() => { activitySettled = true; });
  await completed;
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(activitySettled).toBe(false);
  releaseRefresh();
  await expect(Promise.all([running, activity])).resolves.toMatchObject([0, { type: "api_key", key: "concurrent-key" }]);
  expect(refreshCount).toBe(1);
  expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({
    faux: { type: "oauth", refresh: "new-refresh", access: "fresh", expires: 4_102_444_800_000 },
    openai: { type: "api_key", key: "concurrent-key" },
  });
});

test("the retired store cannot authenticate an actual run while environment authentication remains available", async () => {
  const held = await fixture();
  const model = getBuiltinModels("openai")[0];
  if (model === undefined) throw new Error("fixture found no OpenAI model");
  await writeFile(join(held.home, "config.yaml"), `intelligences:\n  default: { provider: openai, model: ${model.id}, reasoning: medium }\n`);
  Reflect.deleteProperty(held.held, "models");
  const runtime = held.held.authRuntime;
  if (runtime === undefined) throw new Error("fixture supplied no Pi runtime");
  held.held.modelRuntime = runtime;
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(await main(["run", "start", "review/main", "request"], held.held)).toBe(2);
  expect(await (await runtime()).checkAuth("openai")).toBeUndefined();

  vi.stubEnv("OPENAI_API_KEY", SECRET);
  const environmentRuntime = await nativeModelRuntime({ authPath: join(held.root, "environment-auth.json"), modelsPath: null, refreshOnCreate: false });
  expect(await environmentRuntime.checkAuth("openai")).toMatchObject({ source: "OPENAI_API_KEY" });
});
