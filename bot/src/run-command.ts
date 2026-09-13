import type { Models, MutableModels } from "@earendil-works/pi-ai";
import { resolve } from "node:path";
import { runOnlyOptions } from "./flags.ts";
import { resolveInvocationTokens, type InvocationResolve } from "./reader.ts";
import { runCommand, type RunDependencies, type RunOutcome, type RunRequest, type StartedRunResult } from "./run.ts";
import { scriptedMessages } from "./scripted-model.ts";
import type { DriverClock } from "./process.ts";
import type { Refusal } from "./spine.ts";

export interface RunCommandBoundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdinIsTTY: boolean;
  stderrIsTTY: boolean;
  readStdin(): Promise<Buffer>;
  stderr(bytes: string | Uint8Array): void;
  clock: DriverClock;
  models?: MutableModels;
  modelRuntime?: () => Promise<Models>;
  beforeCredentialAccess?: () => void;
  createGating?: RunDependencies["createGating"];
  executeFlow?: RunDependencies["executeFlow"];
  captured?: RunDependencies["captured"];
  copyingCarried?: RunDependencies["copyingCarried"];
}

export type RunOperation =
  | { kind: "usage"; command: string; message: string }
  | { kind: "faults"; faults: Refusal[] }
  | { kind: "result"; result: RunOutcome | StartedRunResult };

function splitRunArguments(args: string[]): { controls: string[]; suffix: string[] } {
  const marker = args.indexOf("--");
  return marker < 0 ? { controls: args, suffix: [] } : { controls: args.slice(0, marker), suffix: args.slice(marker) };
}

async function requestFor(read: Extract<InvocationResolve, { status: "resolved" }>, boundary: RunCommandBoundary): Promise<RunRequest | undefined> {
  if (read.invocation.request !== undefined) {
    return { bytes: Buffer.from(read.invocation.request.body), extension: read.invocation.requestExtension, via: read.invocation.request.via };
  }
  if (boundary.stdinIsTTY) return undefined;
  const bytes = await boundary.readStdin();
  return bytes.length === 0 ? undefined : { bytes, extension: "txt", via: "stdin" };
}

function suppliedScript(file: string | undefined, boundary: RunCommandBoundary) {
  return file === undefined ? undefined : scriptedMessages(file, boundary.cwd);
}

function modelSource(boundary: RunCommandBoundary, script: ReturnType<typeof suppliedScript>): Pick<RunDependencies, "models" | "modelRuntime" | "script"> {
  if (script !== undefined) return { script };
  if (boundary.models !== undefined) return { models: boundary.models };
  return boundary.modelRuntime === undefined ? {} : { modelRuntime: boundary.modelRuntime };
}

function dependencies(boundary: RunCommandBoundary, idFile: string | undefined, script?: ReturnType<typeof suppliedScript>): RunDependencies {
  return {
    cwd: boundary.cwd, clock: boundary.clock, env: boundary.env,
    ...(idFile === undefined ? {} : { idFile: resolve(boundary.cwd, idFile) }),
    progress: (line) => { if (boundary.stderrIsTTY) boundary.stderr(`${line}\n`); },
    ...modelSource(boundary, script),
    ...(boundary.createGating === undefined ? {} : { createGating: boundary.createGating }),
    ...(boundary.executeFlow === undefined ? {} : { executeFlow: boundary.executeFlow }),
    ...(boundary.captured === undefined ? {} : { captured: boundary.captured }),
    ...(boundary.copyingCarried === undefined ? {} : { copyingCarried: boundary.copyingCarried }),
  };
}

export async function runOperation(args: string[], boundary: RunCommandBoundary, correlation?: string): Promise<RunOperation> {
  const split = splitRunArguments(args);
  const options = runOnlyOptions(split.controls);
  if (options.missing !== undefined) return { kind: "usage", command: options.missing, message: `Supply a value for ${options.missing}.` };
  const script = suppliedScript(options.script, boundary);
  const read = resolveInvocationTokens([...options.args, ...split.suffix], boundary.cwd, boundary.env);
  if (read.status === "refused") return { kind: "faults", faults: read.result.faults ?? [] };
  const request = await requestFor(read, boundary);
  if (request === undefined) {
    const held = read.invocation.faults;
    const none = { code: "request-invalid" as const, path: read.invocation.target, sentence: "Give exactly one request." };
    return { kind: "faults", faults: held.length > 0 ? held : [none] };
  }
  boundary.beforeCredentialAccess?.();
  const result = await runCommand(read, request, dependencies(boundary, options.idFile, script), undefined, correlation);
  return "faults" in result ? { kind: "faults", faults: result.faults } : { kind: "result", result };
}

export function resumeDependencies(boundary: RunCommandBoundary, idFile: string | undefined): RunDependencies {
  boundary.beforeCredentialAccess?.();
  return dependencies(boundary, idFile);
}
