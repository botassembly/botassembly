// Bot's one Pi ModelRuntime construction boundary. The process composition
// root resolves the agent directory once; every other caller injects that
// resolved path. Local model configuration is trusted operator input, but Bot
// admits it only through the ownership and mode checks recorded in ADR 0030.
import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CreateModelRuntimeOptions, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { errorCode } from "./model.ts";
import type { DriverClock } from "./process.ts";

export type ModelRuntimeFactory = (options: CreateModelRuntimeOptions) => Promise<ModelRuntime>;
export type { ModelRuntime };

type PiModelRuntimeModule = typeof import("@earendil-works/pi-coding-agent");
let loadedPiModelRuntime: Promise<PiModelRuntimeModule> | undefined;

function piModelRuntime(): Promise<PiModelRuntimeModule> {
  loadedPiModelRuntime ??= import("@earendil-works/pi-coding-agent");
  return loadedPiModelRuntime;
}

async function modelRuntimeFactory(injected: ModelRuntimeFactory | undefined): Promise<ModelRuntimeFactory> {
  if (injected !== undefined) return injected;
  const { ModelRuntime: Runtime } = await piModelRuntime();
  return (options) => Runtime.create(options);
}

type CredentialSynchronizationSettlement = { operation: "login"; providerId: string; credentialType: "api_key" | "oauth" } | { operation: "logout"; providerId: string };

export async function credentialSynchronizationSettlement(reason: unknown): Promise<CredentialSynchronizationSettlement | undefined> {
  const { CredentialSynchronizationError } = await piModelRuntime();
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
  if (facts.uid !== uid) throw unsafe(path, "the path is not owned by the effective user.");
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
  await validatePrivateFile(path, uid, "authentication");
}

async function validatePrivateFile(path: string, uid: number, kind: "authentication" | "model configuration"): Promise<void> {
  const facts = await existing(path);
  if (facts === undefined) return;
  if (facts.isSymbolicLink()) throw unsafe(path, `the ${kind} path is a symbolic link; it must be a real regular file with mode 0600.`);
  if (!facts.isFile()) throw unsafe(path, `the ${kind} path must be a real regular file with mode 0600.`);
  owned(path, facts, uid);
  if ((facts.mode & 0o777) !== 0o600) throw unsafe(path, `the ${kind} file must have mode 0600.`);
  const handle = await open(path, constants.O_RDONLY).catch(() => {
    throw unsafe(path, `the ${kind} file must be readable through a read-only open.`);
  });
  await handle.close().catch(() => {
    throw unsafe(path, `the ${kind} file read-only verification handle could not close.`);
  });
}

async function validateModelsFile(path: string, uid: number): Promise<void> {
  await validatePrivateFile(path, uid, "model configuration");
}

function effectiveUser(): number | undefined {
  return typeof process.geteuid === "function" ? process.geteuid() : undefined;
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

async function validateModelBoundary(input: ConfiguredModelRuntimeInput, uid = effectiveUser()): Promise<string> {
  const modelsPath = join(input.agentDir, "models.json");
  if (uid !== undefined) {
    await validateAgentDirectory(input.agentDir, uid);
    await validateModelsFile(modelsPath, uid);
  }
  return modelsPath;
}

async function validateAuthBoundary(input: ConfiguredModelRuntimeInput): Promise<{ authPath: string; modelsPath: string }> {
  const authPath = join(input.agentDir, "auth.json");
  const uid = effectiveUser();
  const modelsPath = await validateModelBoundary(input, uid);
  if (uid !== undefined) await validateAuthFile(authPath, uid);
  return { authPath, modelsPath };
}

async function validateCredentialBoundary(input: ConfiguredModelRuntimeInput): Promise<string> {
  const authPath = join(input.agentDir, "auth.json");
  const uid = effectiveUser();
  if (uid !== undefined) {
    await validateAgentDirectory(input.agentDir, uid);
    await validateAuthFile(authPath, uid);
  }
  return authPath;
}

/** Resolve Pi's default once at the process boundary, never in runtime work. */
function normalizePiWindowsPath(input: string): string {
  if (process.platform !== "win32" || !input.startsWith("/") || input.startsWith("//") || input.includes("\\")) return input;
  const match = input.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/iu);
  return match?.[1] === undefined ? input : `${match[1].toUpperCase()}:\\${match[2]?.replaceAll("/", "\\") ?? ""}`;
}

function expandPiTilde(input: string): string {
  if (input === "~") return homedir();
  const prefixed = input.startsWith("~/") || (process.platform === "win32" && input.startsWith("~\\"));
  return prefixed ? join(homedir(), input.slice(2)) : input;
}

function normalizePiPath(input: string): string {
  const normalized = expandPiTilde(normalizePiWindowsPath(input));
  return /^file:\/\//u.test(normalized) ? fileURLToPath(normalized) : normalized;
}

export function piAgentDirectory(env: NodeJS.ProcessEnv): string {
  const configured = env["PI_CODING_AGENT_DIR"];
  return configured ? normalizePiPath(configured) : join(homedir(), ".pi", "agent");
}

/** Load provider identity without touching Pi's authentication store. */
export async function configuredProviderCatalog(input: ConfiguredModelRuntimeInput): Promise<ModelRuntime> {
  const modelsPath = await validateModelBoundary(input);
  const factory = await modelRuntimeFactory(input.factory);
  const runtime = await factory({
    credentials: NO_CREDENTIALS, modelsPath, refreshOnCreate: false, allowModelNetwork: false,
  });
  const loaded = runtimeError(runtime);
  if (loaded !== undefined) throw loaded;
  return runtime;
}

export async function configuredModelRuntime(input: ConfiguredModelRuntimeInput): Promise<ModelRuntime> {
  const { authPath, modelsPath } = await validateAuthBoundary(input);
  const factory = await modelRuntimeFactory(input.factory);
  const runtime = await factory({
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
  const factory = await modelRuntimeFactory(input.factory);
  const runtime = await factory({
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
  const factory = await modelRuntimeFactory(input.factory);
  const runtime = await factory({
    authPath, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
  });
  const loaded = runtimeError(runtime);
  if (loaded !== undefined) throw loaded;
  return runtime;
}
