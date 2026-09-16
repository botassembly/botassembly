import { Writable } from "node:stream";
import { flag, valued } from "./command-reading.ts";
import { runtimeBoundary, settleCommand } from "./cli-boundary.ts";
import { main } from "./cli.ts";
import { runMutationChild, MUTATION_FINAL_SETTLEMENT_MS, MUTATION_TERM_GRACE_MS } from "./mutation-child.ts";
import type { CommandResult } from "./new-command-result.ts";
import { processClock } from "./process-clock.ts";
import { decodeDocument, structuredContract, type AssemblyInstallDocument, type AssemblyLinkDocument, type AssemblyRemoveDocument, type AssemblyUpdateDocument, type AuthImportDocument, type AuthLoginDocument, type AuthLogoutDocument, type DocumentReading, type RunResultDocument } from "./command-document.ts";

export type { AssemblyCreationData, AssemblyInstallDocument, AssemblyLinkDocument, AssemblyRemoveDocument, AssemblyUpdateDocument, AssemblyUpdateOutcome, AuthImportDocument, AuthLoginDocument, AuthLogoutDocument, DocumentReading, ErrorDocument, RunResultCarried, RunResultCommon, RunResultData, RunResultDocument, RunResultOutput, RunResultReason, StageIdentity } from "./command-document.ts";

export { MUTATION_FINAL_SETTLEMENT_MS, MUTATION_TERM_GRACE_MS };

export interface RunStartReadingOptions {
  json?: boolean; correlation?: string; idFile?: string; in?: string; intelligence?: string;
  localContext?: "ignore" | "announce" | "use"; retries?: number; script?: string;
  timeout?: number; slots?: Readonly<Record<string, string>>; stdin?: Uint8Array; signal?: AbortSignal;
}
export interface RunResumeReadingOptions {
  json?: boolean; correlation?: string; idFile?: string; in?: string;
  slots?: Readonly<Record<string, string>>; signal?: AbortSignal;
}

function held(bytes: string | Uint8Array): Buffer { return typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes); }

async function mutationReading(
  args: string[], cwd: string, suppliedEnv: NodeJS.ProcessEnv,
  interaction: { readLine?: (hidden: boolean) => Promise<string>; signal?: AbortSignal } = {},
): Promise<CommandResult<number>> {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const boundary = runtimeBoundary({
    cwd, env: { ...suppliedEnv }, clock: processClock(), stdinIsTTY: interaction.readLine !== undefined, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(held(bytes)); },
    rawStdout: () => new Writable({ write: (bytes: Buffer, _encoding, done) => { stdout.push(Buffer.from(bytes)); done(); } }),
    stderr: (bytes) => { stderr.push(held(bytes)); },
    ...(interaction.readLine === undefined ? {} : { readLine: interaction.readLine }),
    ...(interaction.signal === undefined ? {} : { signal: interaction.signal }),
  });
  const exit = await settleCommand(main(args, boundary), (bytes) => { boundary.stderr(bytes); });
  return { exit, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}

export function assemblyInstallReading(home: string, source: string, options: { json?: boolean; name?: string }, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["assembly", "install", source, ...flag("--json", options.json), ...valued("--name", options.name), "--home", home], cwd, env);
}
export function assemblyInstallDocument(home: string, source: string, options: { name?: string }, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AssemblyInstallDocument>> {
  return assemblyInstallReading(home, source, { ...options, json: true }, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("assembly.install")));
}
export function assemblyLinkReading(home: string, source: string, options: { json?: boolean; name?: string }, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["assembly", "link", source, ...flag("--json", options.json), ...valued("--name", options.name), "--home", home], cwd, env);
}
export function assemblyLinkDocument(home: string, source: string, options: { name?: string }, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AssemblyLinkDocument>> {
  return assemblyLinkReading(home, source, { ...options, json: true }, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("assembly.link")));
}
export function assemblyRemoveReading(home: string, name: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["assembly", "remove", name, ...flag("--json", json), "--home", home], cwd, env);
}
export function assemblyRemoveDocument(home: string, name: string, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AssemblyRemoveDocument>> {
  return assemblyRemoveReading(home, name, true, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("assembly.remove")));
}
export function assemblyUpdateReading(home: string, name: string | undefined, json: boolean, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["assembly", "update", ...(name === undefined ? [] : [name]), ...flag("--json", json), "--home", home], cwd, env);
}
export function assemblyUpdateDocument(home: string, name: string | undefined, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AssemblyUpdateDocument>> {
  return assemblyUpdateReading(home, name, true, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("assembly.update")));
}
export function authImportReading(source: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["auth", "import", source, ...flag("--json", json)], cwd, env);
}
export function authImportDocument(source: string, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AuthImportDocument>> {
  return authImportReading(source, true, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("auth.import")));
}
export function authLoginReading(provider: string, options: { json?: boolean; readLine?: (hidden: boolean) => Promise<string>; signal?: AbortSignal }, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["auth", "login", provider, ...flag("--json", options.json)], cwd, env, options);
}
export function authLoginDocument(provider: string, options: { readLine?: (hidden: boolean) => Promise<string>; signal?: AbortSignal }, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AuthLoginDocument>> {
  return authLoginReading(provider, { ...options, json: true }, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("auth.login")));
}
export function authLogoutReading(provider: string, options: { json?: boolean; signal?: AbortSignal }, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return mutationReading(["auth", "logout", provider, ...flag("--json", options.json)], cwd, env, options);
}
export function authLogoutDocument(provider: string, options: { signal?: AbortSignal }, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<AuthLogoutDocument>> {
  return authLogoutReading(provider, { ...options, json: true }, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("auth.logout")));
}

function slotArgs(slots: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(slots ?? {}).flatMap(([name, value]) => [`--${name}`, value]);
}

export function runStartReading(home: string, target: string, request: string | undefined, options: RunStartReadingOptions, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  const args = ["run", "start", ...flag("--json", options.json), ...valued("--correlation", options.correlation),
    ...valued("--id-file", options.idFile), ...valued("--in", options.in), ...valued("--intelligence", options.intelligence),
    ...valued("--local-context", options.localContext), ...valued("--retries", options.retries), ...valued("--script", options.script),
    ...valued("--timeout", options.timeout), ...slotArgs(options.slots), "--home", home, "--", target,
    ...(request === undefined ? [] : [request])];
  return runMutationChild(args, cwd, env, {
    ...(request !== undefined || options.stdin === undefined ? {} : { stdin: options.stdin }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}
export function runStartDocument(home: string, target: string, request: string | undefined, options: Omit<RunStartReadingOptions, "json">, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<RunResultDocument>> {
  return runStartReading(home, target, request, { ...options, json: true }, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("run.start")));
}

export function runResumeReading(home: string, donor: string, options: RunResumeReadingOptions, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  const args = ["run", "resume", donor, ...flag("--json", options.json), ...valued("--correlation", options.correlation),
    ...valued("--id-file", options.idFile), ...valued("--in", options.in), ...slotArgs(options.slots), "--home", home];
  return runMutationChild(args, cwd, env, options.signal === undefined ? {} : { signal: options.signal });
}
export function runResumeDocument(home: string, donor: string, options: Omit<RunResumeReadingOptions, "json">, cwd: string, env: NodeJS.ProcessEnv): Promise<DocumentReading<RunResultDocument>> {
  return runResumeReading(home, donor, { ...options, json: true }, cwd, env)
    .then((result) => decodeDocument(result, structuredContract("run.resume")));
}
