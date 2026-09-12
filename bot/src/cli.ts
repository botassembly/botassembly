#!/usr/bin/env node
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { helpScreen, newHelpScreen } from "./help.ts";
import { credentialPath } from "./invocation.ts";
import { refusalLines } from "./check.ts";
import { plainly } from "./model.ts";
import type { Refusal } from "./spine.ts";
import { exitFlushed, processRawStdout } from "./process-output.ts";
import { dispatchNewCommand } from "./new-command-dispatch.ts";
import { newCommandFailure } from "./new-command-result.ts";
import { parseRunResume, parseRunStart, renderRunStart, runMutationFailure, runMutationRefusal, type RunStartRequest } from "./run-start.ts";
import { resumeDependencies, runOperation, type RunCommandBoundary, type RunOperation } from "./run-command.ts";
import type { CliFailure } from "./run-list-query.ts";
import { resumeOperation } from "./resume.ts";
import type { DriverClock } from "./process.ts";
import { readByteStream } from "./stdin.ts";
import { configuredAuthListRuntime, configuredAuthLogoutRuntime, configuredModelRuntime, configuredProviderCatalog, piAgentDirectory } from "./model-runtime.ts";
import { CLI_CONTRACTS } from "./cli-contract.ts";
import type { Provider } from "@earendil-works/pi-ai";

export interface CliBoundary extends RunCommandBoundary {
  /** Whether a terminal is watching, which is what decides progress. */
  stdout(bytes: string | Uint8Array): void; rawStdout?(): Writable; stderr(bytes: string | Uint8Array): void;
  /** How a login reads one typed line, injectable like `models` below so a
   *  witness can script a login without a terminal. */
  readLine?: (hidden: boolean) => Promise<string>;
  /** Pi's public authentication file, resolved with its agent directory. */
  authPath?: string;
  authRuntime?: () => ReturnType<typeof configuredModelRuntime>;
  authLogoutRuntime?: () => ReturnType<typeof configuredAuthLogoutRuntime>;
  authListRuntime?: () => ReturnType<typeof configuredAuthListRuntime>;
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
  const agentDir = piAgentDirectory();
  let runtime: ReturnType<typeof configuredModelRuntime> | undefined;
  let authListRuntime: ReturnType<typeof configuredAuthListRuntime> | undefined;
  let authLogoutRuntime: ReturnType<typeof configuredAuthLogoutRuntime> | undefined;
  let catalog: ReturnType<typeof configuredProviderCatalog> | undefined;
  delete process.env["BOT_HOME"]; process.stdout.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") throw error; });
  return {
    cwd: process.cwd(), env, stdinIsTTY: process.stdin.isTTY, stderrIsTTY: process.stderr.isTTY,
    readStdin: processStdin,
    stdout: (bytes) => { process.stdout.write(bytes); },
    rawStdout: () => processRawStdout(),
    stderr: (bytes) => { process.stderr.write(bytes); },
    clock,
    authPath: join(agentDir, "auth.json"),
    retiredCredentialPath: credentialPath(env),
    modelRuntime: () => { runtime ??= configuredModelRuntime({ agentDir, env, clock }); return runtime; },
    authRuntime: () => { runtime ??= configuredModelRuntime({ agentDir, env, clock }); return runtime; },
    authLogoutRuntime: () => { authLogoutRuntime ??= configuredAuthLogoutRuntime({ agentDir, env, clock }); return authLogoutRuntime; },
    authListRuntime: () => { authListRuntime ??= configuredAuthListRuntime({ agentDir, env, clock }); return authListRuntime; },
    authProvider: async (id) => {
      catalog ??= configuredProviderCatalog({ agentDir, env, clock });
      return (await catalog).getProvider(id);
    },
  };
}

function usage(command: string, message: string, boundary: CliBoundary): number {
  boundary.stderr(`request-invalid  ${command}\n  ${message}\n`);
  return 2;
}

function writeFaults(boundary: CliBoundary, faults: readonly Refusal[], json: boolean): void {
  const text = json ? refusalLines([...faults]) : faults.flatMap((fault) => [`${fault.code}  ${fault.path}`, `  ${fault.sentence}`]);
  boundary.stderr(`${text.join("\n")}\n`);
}

function writeHumanRun(operation: RunOperation, json: boolean, boundary: CliBoundary): number {
  if (operation.kind === "usage") return usage(operation.command, operation.message, boundary);
  if (operation.kind === "faults") { writeFaults(boundary, operation.faults, json); return 2; }
  const result = operation.result;
  {
    if (result.output !== undefined) boundary.stdout(result.output);
    // trimEnd at the print site only: a gate-capture reason carries its own
    // newline; the record keeps the true bytes (0026 finding). The reason is
    // the run's own text, so `plainly` renders it safely. The cause word is
    // bot's and prints as it always did.
    if (result.exitCode !== 0) boundary.stderr(`${result.cause}${result.reason === undefined ? "" : `: ${plainly(result.reason.trimEnd())}`}\n`);
  }
  return result.exitCode;
}

async function runMutation(
  args: string[], boundary: CliBoundary, operationName: "run.start" | "run.resume",
  parse: (args: readonly string[]) => RunStartRequest | { failure: CliFailure; json: boolean },
  execute: (parsed: RunStartRequest, boundary: CliBoundary) => Promise<RunOperation>,
): Promise<number> {
  const parsed = parse(args);
  if ("failure" in parsed) {
    const result = newCommandFailure(operationName, parsed.failure, parsed.json);
    boundary.stderr(result.stderr); return result.exit;
  }
  const runBoundary = parsed.json ? { ...boundary, stderrIsTTY: false } : boundary;
  const attempted = await execute(parsed, runBoundary).then((operation) => ({ operation }), (reason: unknown) => ({ reason }));
  if ("reason" in attempted) {
    const result = newCommandFailure(operationName, runMutationFailure(operationName, attempted.reason), parsed.json);
    boundary.stderr(result.stderr); return result.exit;
  }
  const { operation } = attempted;
  if (!parsed.json) return writeHumanRun(operation, false, boundary);
  if (operation.kind === "usage") {
    const failure = { code: "request-invalid", cause: "request-invalid", message: operation.message,
      retryable: false, details: {}, exit: 2 } satisfies CliFailure;
    const result = newCommandFailure(operationName, failure, true);
    boundary.stderr(result.stderr); return result.exit;
  }
  if (operation.kind === "faults") {
    const result = newCommandFailure(operationName, runMutationRefusal(operationName, operation.faults), true);
    boundary.stderr(result.stderr); return result.exit;
  }
  if (!("run" in operation.result)) {
    const failure = prestartFailure(operationName, operation.result);
    const result = newCommandFailure(operationName, failure, true);
    boundary.stderr(result.stderr); return result.exit;
  }
  const label = operationName === "run.start" ? "Run start" : "Run resume";
  const result = renderRunStart(operation.result, operationName, label);
  boundary.stdout(result.stdout);
  boundary.stderr(result.stderr);
  return result.exit;
}

function prestartFailure(operationName: "run.start" | "run.resume", result: { exitCode: number; cause: string; reason?: string }): CliFailure {
  const integrity = result.exitCode === 5;
  return { code: integrity ? "integrity-failed" : "dependency-failed", cause: result.cause,
    message: result.reason ?? `${operationName} failed before the run began.`, retryable: !integrity,
    details: {}, exit: integrity ? 5 : 4 };
}

function runStart(args: string[], boundary: CliBoundary): Promise<number> {
  return runMutation(args, boundary, "run.start", parseRunStart,
    (parsed, runBoundary) => runOperation(parsed.args, runBoundary, parsed.correlation));
}

function runResume(args: string[], boundary: CliBoundary): Promise<number> {
  return runMutation(args, boundary, "run.resume", parseRunResume,
    (parsed, runBoundary) => resumeOperation(
      parsed.args, runBoundary, (idFile) => resumeDependencies(runBoundary, idFile), parsed.correlation,
    ));
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
  const newCommand = dispatchNewCommand(
    argv, boundary, (suffix) => runStart(suffix, boundary), (suffix) => runResume(suffix, boundary),
  );
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
