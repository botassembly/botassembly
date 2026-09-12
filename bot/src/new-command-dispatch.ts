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
import { homeBusyCommand } from "./home-busy-command.ts";
import { homeCommand } from "./home-command.ts";
import { assemblyCheckCommand } from "./assembly-check-command.ts";
import { assemblyListCommand } from "./assembly-list-command.ts";
import { assemblyCreateCommand } from "./assembly-create-command.ts";
import { assemblyUpdateCommand } from "./assembly-update-command.ts";
import { assemblyRemoveCommand } from "./assembly-remove-command.ts";
import { modelListCommand } from "./model-list-command.ts";
import { authListCommand } from "./auth-list-command.ts";
import { authImportCommand } from "./auth-import-command.ts";
import type { Models } from "@earendil-works/pi-ai";
import type { AuthListRuntime, AuthLogoutRuntime, ModelRuntime } from "./model-runtime.ts";
import { authLoginCommand } from "./auth-login-command.ts";
import { authLogoutCommand } from "./auth-logout-command.ts";
import type { DriverClock } from "./process.ts";
import type { Provider } from "@earendil-works/pi-ai";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
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
  afterAuthImportDestinationLock?: (input: { temporary?: string }) => void | Promise<void>;
  afterAuthImportSourceLock?: (input: { temporary?: string }) => void | Promise<void>;
  beforeAuthImportRename?: (input: { temporary: string }) => void | Promise<void>;
  afterAuthImportResultPreflight?: (input: { maximumBytes: number }) => void | Promise<void>;
  afterAuthImportResultPrepared?: (input: { output: Buffer }) => void | Promise<void>;
}

type Handler = (args: string[], boundary: Boundary) => number | Promise<number>;

export function dispatchNewCommand(
  words: readonly string[], boundary: Boundary,
  runStart: (args: string[]) => number | Promise<number>, runResume: (args: string[]) => number | Promise<number>,
): number | Promise<number> | undefined {
  const handlers: Record<NewOperation, Handler> = {
    "assembly.check": assemblyCheckCommand,
    "assembly.install": (args, held) => assemblyCreateCommand("assembly.install", args, held),
    "assembly.link": (args, held) => assemblyCreateCommand("assembly.link", args, held),
    "assembly.list": assemblyListCommand,
    "assembly.remove": assemblyRemoveCommand,
    "assembly.update": assemblyUpdateCommand,
    "auth.import": authImportCommand,
    "auth.list": authListCommand,
    "auth.login": authLoginCommand,
    "auth.logout": authLogoutCommand,
    capabilities: capabilitiesCommand,
    "home.busy": homeBusyCommand,
    "home.show": (args, held) => homeCommand(args, held),
    "model.list": modelListCommand,
    "run.check": runCheckCommand,
    "run.checklist": runChecklistCommand,
    "run.events": runEventsCommand,
    "run.list": runListCommand,
    "run.output": runOutputCommand,
    "run.record": runRecordCommand,
    "run.request": runRequestCommand,
    "run.show": runShowCommand,
    "run.resume": (args) => runResume(args),
    "run.session": runSessionCommand,
    "run.start": (args) => runStart(args),
  };
  const descriptor = commandDescriptor(words);
  return descriptor === undefined ? undefined
    : handlers[descriptor.operation](words.slice(descriptor.command.length), boundary);
}
