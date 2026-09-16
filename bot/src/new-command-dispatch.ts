import type { Writable } from "node:stream";
import { capabilitiesCommand } from "./capabilities.ts";
import { commandDescriptor, type NewOperation } from "./cli-contract.ts";
import { runListCommand } from "./run-list-command.ts";
import { runOutputCommand, runRequestCommand } from "./run-output-command.ts";
import { runRecordCommand } from "./run-record-command.ts";
import { runShowCommand } from "./run-show-command.ts";
import { runCheckCommand } from "./run-check-command.ts";
import { runChecklistCommand } from "./run-checklist-command.ts";
import { runEventsCommand } from "./run-events-command.ts";
import { runSessionCommand } from "./run-session-command.ts";
import { runSearchCommand } from "./run-search-command.ts";
import { homeBusyCommand } from "./home-busy-command.ts";
import { homeCommand } from "./home-command.ts";
import { intelligenceListCommand } from "./intelligence-list-command.ts";
import { assemblyCheckCommand } from "./assembly-check-command.ts";
import { assemblyListCommand } from "./assembly-list-command.ts";
import { assemblyCreateCommand } from "./assembly-create-command.ts";
import { assemblyUpdateCommand } from "./assembly-update-command.ts";
import { assemblyRemoveCommand } from "./assembly-remove-command.ts";
import type { Models } from "@earendil-works/pi-ai";
import type { AuthListRuntime, AuthLogoutRuntime, ModelRuntime } from "./model-runtime.ts";
import type { DriverClock } from "./process.ts";
import type { RunCommandBoundary } from "./run-command.ts";
import type { Provider } from "@earendil-works/pi-ai";

interface Boundary extends RunCommandBoundary {
  stdout(bytes: string | Uint8Array): void;
  rawStdout?(): Writable;
  stderr(bytes: string | Uint8Array): void;
  clock: DriverClock;
  afterAssemblyUpdateAside?: () => Promise<void>;
  afterAssemblyUpdateSelection?: () => Promise<void>;
  afterAssemblyUpdatePublish?: () => Promise<void>;
  authProvider?: (id: string) => Provider | undefined | Promise<Provider | undefined>;
  modelRuntime?: () => Promise<Models>;
  authListRuntime?: () => Promise<AuthListRuntime>;
  authRuntime?: () => Promise<ModelRuntime>;
  authLogoutRuntime?: () => Promise<AuthLogoutRuntime>;
  beforeCredentialAccess?: () => void;
  stdinIsTTY: boolean;
  readLine?: (hidden: boolean) => Promise<string>;
  signal?: AbortSignal;
  authPath?: string;
  authPathResolver?: () => Promise<string>;
  afterAuthImportDestinationLock?: (input: { temporary?: string }) => void | Promise<void>;
  afterAuthImportSourceLock?: (input: { temporary?: string }) => void | Promise<void>;
  beforeAuthImportRename?: (input: { temporary: string }) => void | Promise<void>;
  afterAuthImportResultPreflight?: (input: { maximumBytes: number }) => void | Promise<void>;
  afterAuthImportResultPrepared?: (input: { output: Buffer }) => void | Promise<void>;
}

type Handler = (args: string[], boundary: Boundary) => number | Promise<number>;

export const PI_CAPABLE_OPERATIONS = [
  "auth.import", "auth.list", "auth.login", "auth.logout", "model.list", "run.resume", "run.start",
] as const satisfies readonly NewOperation[];
type PiCapableOperation = (typeof PI_CAPABLE_OPERATIONS)[number];
type PiFreeOperation = Exclude<NewOperation, PiCapableOperation>;
const PI_CAPABLE_SET = new Set<NewOperation>(PI_CAPABLE_OPERATIONS);

function isPiCapable(operation: NewOperation): operation is PiCapableOperation {
  return PI_CAPABLE_SET.has(operation);
}

const piCapableHandlers: Record<PiCapableOperation, Handler> = {
  "auth.import": async (args, held) => (await import("./auth-import-command.ts")).authImportCommand(args, held),
  "auth.list": async (args, held) => (await import("./auth-list-command.ts")).authListCommand(args, held),
  "auth.login": async (args, held) => (await import("./auth-login-command.ts")).authLoginCommand(args, held),
  "auth.logout": async (args, held) => (await import("./auth-logout-command.ts")).authLogoutCommand(args, held),
  "model.list": async (args, held) => (await import("./model-list-command.ts")).modelListCommand(args, held),
  "run.resume": async (args, held) => (await import("./run-mutation-command.ts")).runResumeCommand(args, held),
  "run.start": async (args, held) => (await import("./run-mutation-command.ts")).runStartCommand(args, held),
};

const piFreeHandlers: Record<PiFreeOperation, Handler> = {
  "assembly.check": assemblyCheckCommand,
  "assembly.install": (args, held) => assemblyCreateCommand("assembly.install", args, held),
  "assembly.link": (args, held) => assemblyCreateCommand("assembly.link", args, held),
  "assembly.list": assemblyListCommand,
  "assembly.remove": assemblyRemoveCommand,
  "assembly.update": assemblyUpdateCommand,
  capabilities: capabilitiesCommand,
  "home.busy": homeBusyCommand,
  "home.show": (args, held) => homeCommand(args, held),
  "intelligence.list": intelligenceListCommand,
  "run.check": runCheckCommand,
  "run.checklist": runChecklistCommand,
  "run.events": runEventsCommand,
  "run.list": runListCommand,
  "run.output": runOutputCommand,
  "run.record": runRecordCommand,
  "run.request": runRequestCommand,
  "run.search": runSearchCommand,
  "run.session": runSessionCommand,
  "run.show": runShowCommand,
};

export function dispatchNewCommand(
  words: readonly string[], boundary: Boundary,
): number | Promise<number> | undefined {
  const descriptor = commandDescriptor(words);
  if (descriptor === undefined) return undefined;
  const args = words.slice(descriptor.command.length);
  return isPiCapable(descriptor.operation)
    ? piCapableHandlers[descriptor.operation](args, boundary)
    : piFreeHandlers[descriptor.operation](args, boundary);
}
