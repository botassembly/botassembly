// Bot's one Pi ModelRuntime construction boundary. The process composition
// root resolves the agent directory once; every other caller injects that
// resolved path. Local model configuration is trusted operator input, but Bot
// admits it only through the ownership and mode checks recorded in ADR 0030.
import { constants, type Stats } from "node:fs";
import { access, lstat, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { CredentialSynchronizationError, ModelRuntime, getAgentDir, type CreateModelRuntimeOptions } from "@earendil-works/pi-coding-agent";
import type { CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { errorCode } from "./model.ts";
import type { DriverClock } from "./process.ts";

export type ModelRuntimeFactory = (options: CreateModelRuntimeOptions) => Promise<ModelRuntime>;
export type { ModelRuntime };

type CredentialSynchronizationSettlement = { operation: "login"; providerId: string; credentialType: "api_key" | "oauth" } | { operation: "logout"; providerId: string };

export function credentialSynchronizationSettlement(reason: unknown): CredentialSynchronizationSettlement | undefined {
  if (!(reason instanceof CredentialSynchronizationError)) return undefined;
  const providerId: unknown = reason.providerId, credentialType: unknown = reason.operation === "login" ? reason.credential?.type : undefined;
  if (typeof providerId !== "string") return undefined;
  if (credentialType === "api_key" || credentialType === "oauth") return { operation: "login", providerId, credentialType };
  return reason.operation === "logout" ? { operation: "logout", providerId } : undefined;
}

export interface ConfiguredModelRuntimeInput {
  agentDir: string;
  env: NodeJS.ProcessEnv;
  clock: DriverClock;
  factory?: ModelRuntimeFactory;
}

export interface AuthListRuntime {
  runtime: ModelRuntime;
  credentials: readonly CredentialInfo[];
}

export type AuthLogoutRuntime = ModelRuntime;

function unsafe(path: string, sentence: string): Error {
  return new Error(`Unsafe Pi model configuration at ${path}: ${sentence}`);
}

function owned(path: string, facts: Stats, uid: number): void {
  if (facts.uid !== uid) throw unsafe(path, "the path is not owned by the current user.");
}

async function existing(path: string): Promise<Stats | undefined> {
  return lstat(path).then(
    (facts) => facts,
    (reason: unknown) => {
      if (errorCode(reason) === "ENOENT") return undefined;
      throw reason;
    },
  );
}

async function validateAgentDirectory(path: string, uid: number): Promise<void> {
  const facts = await existing(path);
  if (facts === undefined) return;
  if (!facts.isDirectory()) throw unsafe(path, "the agent path is not a directory.");
  owned(path, facts, uid);
  if ((facts.mode & 0o777) !== 0o700) throw unsafe(path, "the agent directory must have mode 0700.");
}

async function validateAuthFile(path: string, uid: number): Promise<void> {
  const facts = await existing(path);
  if (facts === undefined) return;
  if (facts.isSymbolicLink()) throw unsafe(path, "the authentication path is a symbolic link.");
  if (!facts.isFile()) throw unsafe(path, "the authentication path is not a regular file.");
  owned(path, facts, uid);
  if ((facts.mode & 0o777) !== 0o600) throw unsafe(path, "the authentication file must have mode 0600.");
  await access(path, constants.R_OK);
}

async function validateModelsFile(path: string, uid: number): Promise<void> {
  const link = await existing(path);
  if (link === undefined) return;
  if (link.isSymbolicLink() && link.uid !== uid) throw unsafe(path, "the symlink is not owned by the current user.");
  const resolved = link.isSymbolicLink() ? await realpath(path) : path;
  const facts = link.isSymbolicLink() ? await stat(resolved) : link;
  if (!facts.isFile()) throw unsafe(resolved, "the resolved model configuration is not a regular file.");
  owned(resolved, facts, uid);
  if ((facts.mode & 0o002) !== 0) throw unsafe(resolved, "the path is world-writable.");
  await access(resolved, constants.R_OK);
}

function runtimeError(runtime: ModelRuntime): Error | undefined {
  const message = runtime.getError();
  return message === undefined ? undefined : new Error(`Pi model runtime failed: ${message}`);
}

const NO_CREDENTIALS: CredentialStore = {
  read: () => Promise.resolve(undefined),
  list: () => Promise.resolve([]),
  modify: (_providerId, change) => change(undefined),
  delete: () => Promise.resolve(),
};

async function validateModelBoundary(input: ConfiguredModelRuntimeInput): Promise<string> {
  const modelsPath = join(input.agentDir, "models.json");
  const getuid = process.getuid;
  if (getuid !== undefined) {
    const uid = getuid();
    await validateAgentDirectory(input.agentDir, uid);
    await validateModelsFile(modelsPath, uid);
  }
  return modelsPath;
}

async function validateAuthBoundary(input: ConfiguredModelRuntimeInput): Promise<{ authPath: string; modelsPath: string }> {
  const authPath = join(input.agentDir, "auth.json");
  const modelsPath = await validateModelBoundary(input);
  const getuid = process.getuid;
  if (getuid !== undefined) await validateAuthFile(authPath, getuid());
  return { authPath, modelsPath };
}

async function validateCredentialBoundary(input: ConfiguredModelRuntimeInput): Promise<string> {
  const authPath = join(input.agentDir, "auth.json");
  const getuid = process.getuid;
  if (getuid !== undefined) {
    const uid = getuid();
    await validateAgentDirectory(input.agentDir, uid);
    await validateAuthFile(authPath, uid);
  }
  return authPath;
}

/** Resolve Pi's default once at the process boundary, never in runtime work. */
export function piAgentDirectory(): string {
  return getAgentDir();
}

/** Load provider identity without touching Pi's authentication store. */
export async function configuredProviderCatalog(input: ConfiguredModelRuntimeInput): Promise<ModelRuntime> {
  const modelsPath = await validateModelBoundary(input);
  const runtime = await (input.factory ?? ModelRuntime.create)({
    credentials: NO_CREDENTIALS, modelsPath, refreshOnCreate: false, allowModelNetwork: false,
  });
  const loaded = runtimeError(runtime);
  if (loaded !== undefined) throw loaded;
  return runtime;
}

export async function configuredModelRuntime(input: ConfiguredModelRuntimeInput): Promise<ModelRuntime> {
  const { authPath, modelsPath } = await validateAuthBoundary(input);
  const runtime = await (input.factory ?? ModelRuntime.create)({
    authPath,
    modelsPath,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const loaded = runtimeError(runtime);
  if (loaded !== undefined) throw loaded;
  await runtime.listCredentials({ signal: new AbortController().signal }).catch(() => {
    throw unsafe(authPath, "the authentication file is unreadable or corrupt.");
  });
  await runtime.refresh({ allowNetwork: false });
  const refreshed = runtimeError(runtime);
  if (refreshed !== undefined) throw refreshed;
  return runtime;
}

/** Build the auth-list snapshot without resolving credential values or refreshing providers. */
export async function configuredAuthListRuntime(input: ConfiguredModelRuntimeInput): Promise<AuthListRuntime> {
  const { authPath, modelsPath } = await validateAuthBoundary(input);
  const runtime = await (input.factory ?? ModelRuntime.create)({
    authPath,
    modelsPath,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const loaded = runtimeError(runtime);
  if (loaded !== undefined) throw loaded;
  const credentials = await runtime.listCredentials({ signal: new AbortController().signal }).catch(() => {
    throw unsafe(authPath, "the authentication file is unreadable or corrupt.");
  });
  return { runtime, credentials };
}

/** Build a credential mutation runtime without loading or refreshing model configuration. */
export async function configuredAuthLogoutRuntime(input: ConfiguredModelRuntimeInput): Promise<AuthLogoutRuntime> {
  const authPath = await validateCredentialBoundary(input);
  const runtime = await (input.factory ?? ModelRuntime.create)({
    authPath, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
  });
  const loaded = runtimeError(runtime);
  if (loaded !== undefined) throw loaded;
  return runtime;
}
