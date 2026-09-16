import { join } from "node:path";
import type { Writable } from "node:stream";
import type { Models, Provider } from "@earendil-works/pi-ai";
import { credentialPath } from "./invocation.ts";
import type { AuthListRuntime, AuthLogoutRuntime, ModelRuntime } from "./model-runtime.ts";
import type { DriverClock } from "./process.ts";
import type { RunCommandBoundary } from "./run-command.ts";

export interface CliBoundary extends RunCommandBoundary {
  platform?: string;
  stdout(bytes: string | Uint8Array): void;
  rawStdout?(): Writable;
  stderr(bytes: string | Uint8Array): void;
  readLine?: (hidden: boolean) => Promise<string>;
  authPath?: string;
  authPathResolver?: () => Promise<string>;
  authRuntime?: () => Promise<ModelRuntime>;
  authLogoutRuntime?: () => Promise<AuthLogoutRuntime>;
  authListRuntime?: () => Promise<AuthListRuntime>;
  modelRuntime?: () => Promise<Models>;
  authProvider?: (id: string) => Provider | undefined | Promise<Provider | undefined>;
  signal?: AbortSignal;
  retiredCredentialPath?: string;
  beforeCredentialAccess?: () => void;
  afterAssemblyUpdateAside?: () => Promise<void>;
  afterAssemblyUpdateSelection?: () => Promise<void>;
  afterAssemblyUpdatePublish?: () => Promise<void>;
  afterAuthImportDestinationLock?: (input: { temporary?: string }) => void | Promise<void>;
  afterAuthImportSourceLock?: (input: { temporary?: string }) => void | Promise<void>;
  beforeAuthImportRename?: (input: { temporary: string }) => void | Promise<void>;
  afterAuthImportResultPreflight?: (input: { maximumBytes: number }) => void | Promise<void>;
  afterAuthImportResultPrepared?: (input: { output: Buffer }) => void | Promise<void>;
}

interface RuntimeBoundaryInput {
  cwd: string;
  env: NodeJS.ProcessEnv;
  clock: DriverClock;
  stdinIsTTY: boolean;
  stderrIsTTY: boolean;
  readStdin(): Promise<Buffer>;
  stdout(bytes: string | Uint8Array): void;
  rawStdout?(): Writable;
  stderr(bytes: string | Uint8Array): void;
  readLine?: (hidden: boolean) => Promise<string>;
  signal?: AbortSignal;
  platform?: string;
}

/** Build the one lazy Pi boundary used by both the invoked CLI and imported mutations. */
export function runtimeBoundary(input: RuntimeBoundaryInput): CliBoundary {
  const env = { ...input.env };
  let modelBoundary: Promise<{ agentDir: string; module: typeof import("./model-runtime.ts") }> | undefined;
  const resolveModelBoundary = () => {
    modelBoundary ??= import("./model-runtime.ts").then((module) => ({ module, agentDir: module.piAgentDirectory(env) }));
    return modelBoundary;
  };
  let runtime: Promise<ModelRuntime> | undefined;
  let authListRuntime: Promise<AuthListRuntime> | undefined;
  let authLogoutRuntime: Promise<AuthLogoutRuntime> | undefined;
  let catalog: Promise<ModelRuntime> | undefined;
  return {
    ...input, env,
    authPathResolver: async () => join((await resolveModelBoundary()).agentDir, "auth.json"),
    retiredCredentialPath: credentialPath(env),
    modelRuntime: () => {
      runtime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredModelRuntime({ agentDir, env, clock: input.clock }));
      return runtime;
    },
    authRuntime: () => {
      runtime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredModelRuntime({ agentDir, env, clock: input.clock }));
      return runtime;
    },
    authLogoutRuntime: () => {
      authLogoutRuntime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredAuthLogoutRuntime({ agentDir, env, clock: input.clock }));
      return authLogoutRuntime;
    },
    authListRuntime: () => {
      authListRuntime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredAuthListRuntime({ agentDir, env, clock: input.clock }));
      return authListRuntime;
    },
    authProvider: async (id) => {
      catalog ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredProviderCatalog({ agentDir, env, clock: input.clock }));
      return (await catalog).getProvider(id);
    },
  };
}

/** The CLI and imported collector share the same rejection-to-exit mapping. */
export async function settleCommand(work: Promise<number>, stderr: (bytes: string | Uint8Array) => void): Promise<number> {
  return work.catch((reason: unknown) => {
    stderr(`${reason instanceof Error ? reason.message : "The runtime failed."}\n`);
    return 2;
  });
}
