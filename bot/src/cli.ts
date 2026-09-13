#!/usr/bin/env node
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { helpScreen, newHelpScreen } from "./help.ts";
import { credentialPath } from "./invocation.ts";
import { exitFlushed, ordinaryProcessOutput, processRawStdout } from "./process-output.ts";
import { dispatchNewCommand } from "./new-command-dispatch.ts";
import type { RunCommandBoundary } from "./run-command.ts";
import type { DriverClock } from "./process.ts";
import { readByteStream } from "./stdin.ts";
import type { AuthListRuntime, AuthLogoutRuntime, ModelRuntime } from "./model-runtime.ts";
import { CLI_CONTRACTS } from "./cli-contract.ts";
import type { Models, Provider } from "@earendil-works/pi-ai";

export interface CliBoundary extends RunCommandBoundary {
  /** Whether a terminal is watching, which is what decides progress. */
  stdout(bytes: string | Uint8Array): void; rawStdout?(): Writable; stderr(bytes: string | Uint8Array): void;
  /** How a login reads one typed line, injectable like `models` below so a
   *  witness can script a login without a terminal. */
  readLine?: (hidden: boolean) => Promise<string>;
  /** Pi's public authentication file, resolved with its agent directory. */
  authPath?: string;
  authPathResolver?: () => Promise<string>;
  authRuntime?: () => Promise<ModelRuntime>;
  authLogoutRuntime?: () => Promise<AuthLogoutRuntime>;
  authListRuntime?: () => Promise<AuthListRuntime>;
  modelRuntime?: () => Promise<Models>;
  authProvider?: (id: string) => Provider | undefined | Promise<Provider | undefined>;
  signal?: AbortSignal;
  /** Retired Bot store used only for the transition-preservation warning. */
  retiredCredentialPath?: string;
  afterAssemblyUpdateAside?: () => Promise<void>;
  afterAssemblyUpdateSelection?: () => Promise<void>;
  afterAssemblyUpdatePublish?: () => Promise<void>;
  afterAuthImportDestinationLock?: (input: { temporary?: string }) => void | Promise<void>;
  afterAuthImportSourceLock?: (input: { temporary?: string }) => void | Promise<void>;
  beforeAuthImportRename?: (input: { temporary: string }) => void | Promise<void>;
  afterAuthImportResultPreflight?: (input: { maximumBytes: number }) => void | Promise<void>;
  afterAuthImportResultPrepared?: (input: { output: Buffer }) => void | Promise<void>;
}

interface Clearable { clear(): void }

function clearable(value: unknown): value is Clearable {
  return typeof value === "object" && value !== null && "clear" in value && typeof value.clear === "function";
}

function processClock(): DriverClock {
  return {
    milliseconds: () => performance.now(),
    timestamp: () => new Date().toISOString(),
    setTimeout(callback, milliseconds) {
      const timer = setTimeout(callback, milliseconds);
      return { clear: () => { clearTimeout(timer); } };
    },
    clearTimeout(handle) {
      if (clearable(handle)) handle.clear();
    },
  };
}

async function processStdin(): Promise<Buffer> {
  return readByteStream(process.stdin);
}

// The environment is bot's from here on (ticket 0139 leg 1). The boundary took
// a REFERENCE to `process.env` until now, which is no snapshot at all: this
// copies it, and then the one variable that is the runtime's own leaves the
// live process behind. Every rung that reads it reads the copy — the boundary
// is the only environment src/ has ever consulted — while Pi's request-time
// `process.env` reads, which no injected option reaches, find nothing to find.
// One process per run (ADR 0005) makes the deletion per-run by construction.
// One variable, and it is the only one: BOT_AUTH went with ADR 0017, and a name
// the runtime does not read is not the runtime's to take out of anyone's shell.
export function processBoundary(): CliBoundary {
  const env = { ...process.env };
  const clock = processClock();
  let modelBoundary: Promise<{ agentDir: string; module: typeof import("./model-runtime.ts") }> | undefined;
  const resolveModelBoundary = () => {
    modelBoundary ??= import("./model-runtime.ts").then(async (module) => ({ module, agentDir: await module.piAgentDirectory() }));
    return modelBoundary;
  };
  let runtime: Promise<ModelRuntime> | undefined;
  let authListRuntime: Promise<AuthListRuntime> | undefined;
  let authLogoutRuntime: Promise<AuthLogoutRuntime> | undefined;
  let catalog: Promise<ModelRuntime> | undefined;
  delete process.env["BOT_HOME"];
  const output = ordinaryProcessOutput();
  return {
    cwd: process.cwd(), env, stdinIsTTY: process.stdin.isTTY, stderrIsTTY: process.stderr.isTTY,
    readStdin: processStdin,
    stdout: (bytes) => { output.write(bytes); },
    rawStdout: () => processRawStdout(),
    stderr: (bytes) => { process.stderr.write(bytes); },
    clock,
    authPathResolver: async () => join((await resolveModelBoundary()).agentDir, "auth.json"),
    retiredCredentialPath: credentialPath(env),
    modelRuntime: () => {
      runtime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredModelRuntime({ agentDir, env, clock }));
      return runtime;
    },
    authRuntime: () => {
      runtime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredModelRuntime({ agentDir, env, clock }));
      return runtime;
    },
    authLogoutRuntime: () => {
      authLogoutRuntime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredAuthLogoutRuntime({ agentDir, env, clock }));
      return authLogoutRuntime;
    },
    authListRuntime: () => {
      authListRuntime ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredAuthListRuntime({ agentDir, env, clock }));
      return authListRuntime;
    },
    authProvider: async (id) => {
      catalog ??= resolveModelBoundary().then(({ agentDir, module }) => module.configuredProviderCatalog({ agentDir, env, clock }));
      return (await catalog).getProvider(id);
    },
  };
}

function usage(command: string, message: string, boundary: CliBoundary): number {
  boundary.stderr(`request-invalid  ${command}\n  ${message}\n`);
  return 2;
}

export const commandNames = CLI_CONTRACTS.map((descriptor) => descriptor.command.join(" "));

export async function main(argv: string[], supplied?: CliBoundary): Promise<number> {
  const base = supplied ?? processBoundary();
  let warned = false;
  const boundary: CliBoundary = {
    ...base,
    beforeCredentialAccess: () => {
      if (warned) return;
      warned = true;
      if (base.retiredCredentialPath !== undefined) {
        if (lstatSync(base.retiredCredentialPath, { throwIfNoEntry: false }) !== undefined) {
          base.stderr("The retired Bot credential store is inactive; this command uses Pi's auth.json.\n");
        }
      }
      base.beforeCredentialAccess?.();
    },
  };
  const [command = ""] = argv;
  if (command === "--home") return usage("--home", "Put --home DIR after a command that accepts it. Example: bot run list --home ./bot-home.", boundary);
  const help = command.length === 0 || command === "--help" ? helpScreen("", []) : newHelpScreen(argv);
  if (help !== undefined) { boundary.stdout(help); return 0; }
  const newCommand = dispatchNewCommand(argv, boundary);
  if (newCommand !== undefined) return newCommand;
  return usage(command.length === 0 ? "bot" : command, `Use ${commandNames.join(", ")}.`, boundary);
}

// upstream: pi-ai holds provider connections (global-fetch keep-alive sockets)
// with no public close/dispose, so a COMPLETE run can leave a live handle
// holding the event loop and the process never exits (0017 F4). Exiting is
// therefore explicit — but only after both stdio streams confirm their flush,
// so piped output reaches the kernel complete before exit can truncate it.
export { exitFlushed };

// Invoked, not imported. Both sides are resolved to their real path because
// node resolves a module URL through symlinks while argv[1] keeps the link it
// was invoked through, so comparing the two spellings made this false for every
// symlinked checkout or bin link — and `bot` a silent exit-0 no-op (0070). It
// stays false on import: an importer's argv[1] is its own entry, not this file.
// The existsSync is the predicate being total, not a guard: `node --eval` puts
// a bare word in argv[1], and a word that names no file cannot name this one.
const invoked = process.argv[1];
if (invoked !== undefined && existsSync(invoked) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invoked)) {
  void main(process.argv.slice(2)).then(
    exitFlushed,
    (reason: unknown) => {
      process.stderr.write(`${reason instanceof Error ? reason.message : "The runtime failed."}\n`);
      exitFlushed(2);
    },
  );
}
