import type { CliDescriptor, NewOperation } from "./cli-contract.ts";
import { AUTH_LOGIN_CONTRACT, CLI_CONTRACTS, NEW_COMMAND_ERROR_BYTES } from "./cli-contract.ts";
import { RETIRED_CREDENTIAL_ADVISORY } from "./credential-advisory.ts";
import { mapping } from "./model.ts";
import type { CommandResult, ErrorDocument } from "./new-command-result.ts";
import type { RunListState } from "./run-list-query.ts";
import { jsonValue } from "./schema-check.ts";
import { ERROR_CAUSES, ERROR_CODES, type Cause, type ErrorCause, type ErrorCode } from "./spine.ts";

export type { ErrorDocument } from "./new-command-result.ts";
export type DocumentReading<D> = { kind: "document"; exit: number; document: D; command: CommandResult<number> }
  | { kind: "error"; exit: 1 | 2 | 3 | 4 | 5; error: ErrorDocument; command: CommandResult<number> };

export interface Page { limit: number; next: string | null; complete: boolean; through?: string | null }
export interface Summary { returned: number; matched?: number | null; warningCount?: number; warningsOmitted?: number }
export interface AssemblyCheckDocument { schemaVersion: 1; kind: "bot.assembly.check"; data: { target: string; hash: string | null; stages: Record<string, unknown>[] }; page: Page; summary: Summary; warnings: never[] }
export interface AssemblyListRow { name: string; kind: "installed" | "linked"; source: string | null; updated: string | null; target: string | null; broken: boolean; hash: string | null }
export interface AssemblyListDocument { schemaVersion: 1; kind: "bot.assembly.list"; data: Array<Partial<AssemblyListRow>>; page: Page; summary: Required<Summary>; warnings: never[] }
export interface CapabilitiesDocument { schemaVersion: 1; kind: "bot.capabilities"; data: { runtime: string; runtimeSource: "checkout" | "unknown"; runtimeDigest: string | null; runtimeTreeSha256: string; commands: readonly CliDescriptor[] } }
export interface HomeBusyDocument { schemaVersion: 1; kind: "bot.home.busy"; data: { busy: boolean } }
export interface HomePathReading { path: string; exists: boolean }
export interface HomeShowDocument { schemaVersion: 1; kind: "bot.home.show"; data: { home: string; initialized: boolean; installationId?: string; paths: { config: HomePathReading; runs: HomePathReading; assemblies: HomePathReading; installation: HomePathReading; cache: HomePathReading; piAuth: HomePathReading } } }
export interface IntelligenceRow { name: string; provider: string | null; model: string; reasoning: string }
export interface IntelligenceListDocument { schemaVersion: 1; kind: "bot.intelligence.list"; data: IntelligenceRow[] }
export interface CheckRecording { stage: string; repeat: number | null; retry: number; exit: number | null; capture: string; executableFile: string | null; executableSha256: string | null }
export interface RunCheckDocument { schemaVersion: 1; kind: "bot.run.check"; data: { run: string; check: string; recordings: CheckRecording[] } }
export interface ChecklistMark { stage: string; repeat: number | null; retry: number; item: number; decision: "done" | "skipped"; evidence: string | null; reason: string | null }
export interface RunChecklistDocument { schemaVersion: 1; kind: "bot.run.checklist"; data: { run: string; marks: ChecklistMark[] } }
export interface RunEventsDocument { schemaVersion: 1; kind: "bot.run.events"; data: { run: string; child: string | null; events: Array<Record<string, unknown>> } }
export interface RunListRow { id: string; assembly: string | null; flow: string | null; startedAt: string | null; endedAt: string | null; duration: number | null; state: RunListState; exit: number | null; cause: string | null; tokens: number | null; tokensStatus: "complete" | "partial" }
export interface DocumentWarning { id: string; code: string; diagnostic: string }
export interface RunListDocument { schemaVersion: 1; kind: "bot.run.list"; data: Array<Partial<RunListRow>>; page: Page; summary: Required<Summary>; warnings: DocumentWarning[] }
export interface RunSearchHit { run: string; stage: string | null; repeat: number | null; retry: number | null; file: string; line: number; text: string; omittedBytes: number }
export interface RunSearchDocument { schemaVersion: 1; kind: "bot.run.search"; data: { query: string; tool: { name: "rg" | "grep"; version: string }; hits: RunSearchHit[] }; page: Omit<Page, "through">; summary: { candidateFiles: number; returned: number } }
export type RunShowRootState = "ended" | "incomplete" | "running" | "crashed";
export type RunShowStageState = "carried" | "incomplete" | "unreconciled" | "ended";
export interface RunShowStage { identity: string; stage: string; repeat: number | null; attempt: number; state: RunShowStageState; exit: number | null; cause: Cause | null; scratch: string | null }
export interface RunShowSubflow { caller: string; attempt: number; call: number; subflow: string; item: string | null; started: boolean; child: string | null; exit: number | null; cause: Cause | null }
export interface RunShowWarning { code: "text-unavailable"; subject: string; field: string; omittedBytes: number }
export interface RunShowDocument { schemaVersion: 1; kind: "bot.run.show"; data: { run: string; state: RunShowRootState; startedAt: string | null; endedAt: string | null; exit: number | null; cause: Cause | null; stages: RunShowStage[]; subflows: RunShowSubflow[] }; summary: { stageCount: number; stagesIncluded: number; stagesOmitted: number; subflowCount: number; subflowsIncluded: number; subflowsOmitted: number; warningCount: number; warningsOmitted: number }; warnings: RunShowWarning[] }
export interface AssemblyCreationData { name: string; kind: "installed" | "linked"; changed: true }
export interface AssemblyInstallDocument { schemaVersion: 1; kind: "bot.assembly.install"; data: AssemblyCreationData & { kind: "installed" } }
export interface AssemblyLinkDocument { schemaVersion: 1; kind: "bot.assembly.link"; data: AssemblyCreationData & { kind: "linked" } }
export interface AssemblyRemoveDocument { schemaVersion: 1; kind: "bot.assembly.remove"; data: { name: string; kind: "installed" | "linked"; removed: true } }
export interface AssemblyUpdateOutcome { name: string; state: "updated" | "unchanged" | "failed"; reason: string }
export interface AssemblyUpdateDocument { schemaVersion: 1; kind: "bot.assembly.update"; data: { outcomes: AssemblyUpdateOutcome[] } }
export interface AuthImportDocument { schemaVersion: 1; kind: "bot.auth.import"; data: { imported: boolean; providerCount: number } }
export interface AuthLoginDocument { schemaVersion: 1; kind: "bot.auth.login"; data: { provider: string; authenticated: true; credentialType: "api_key" | "oauth" } }
export interface AuthLogoutDocument { schemaVersion: 1; kind: "bot.auth.logout"; data: { provider: string; result: "completed" } }
export type RunResultReason = { text: string; bytes: number; truncated: false } | { text: string; bytes: number; truncated: true };
interface RunResultOutputFacts { path: string; extension: string; bytes: number; sha256: string }
export type RunResultOutput = RunResultOutputFacts & (
  | { contentIncluded: true; encoding: "utf8" | "base64"; content: string }
  | { contentIncluded: false; encoding?: never; content?: never }
);
export interface StageIdentity { stage: string; repeat?: number; retry: number }
export type RunResultCarried = { count: number; identitiesIncluded: true; identities: StageIdentity[] }
  | { count: number; identitiesIncluded: false; identities?: never };
export interface RunResultCommon { run: string; startedAt: string; installationId: string; exit: number; cause: Cause; reason?: RunResultReason; terminalStage?: StageIdentity; correlation?: string; donor?: string; carried?: RunResultCarried; output?: RunResultOutput }
export type RunResultData = RunResultCommon & ({ complete: true; endedAt: string } | { complete: false; endedAt?: never });
export interface RunResultDocument { schemaVersion: 1; kind: "bot.run.result"; data: RunResultData }

type FramingPolicy = "exclusive-json" | "authentication-interaction" | "authentication-advisory";
export interface StructuredContract { operation: NewOperation; reading: string; typed: string; kind: string; schemaVersion: 1; resultBytes: number; exclusive: boolean; framing: FramingPolicy }
type ResultLimit = "documentBytes" | "documentBytesExclusive" | "markdownPageBytesExclusive" | "recordBytes" | "resultBytes" | "resultBytesExclusive";
interface StructuredSource { operation: NewOperation; limit?: ResultLimit; framing?: Exclude<FramingPolicy, "exclusive-json"> }
const entries = [
  { operation: "assembly.check", limit: "markdownPageBytesExclusive" }, { operation: "assembly.install", limit: "resultBytes" },
  { operation: "assembly.link", limit: "resultBytes" }, { operation: "assembly.list", limit: "markdownPageBytesExclusive" },
  { operation: "assembly.remove", limit: "resultBytes" }, { operation: "assembly.update", limit: "resultBytes" },
  { operation: "auth.import", limit: "resultBytes" },
  { operation: "auth.login", limit: "resultBytes", framing: "authentication-interaction" },
  { operation: "auth.logout", limit: "resultBytes", framing: "authentication-advisory" },
  { operation: "capabilities", limit: "documentBytes" },
  { operation: "home.busy", limit: "documentBytes" },
  { operation: "home.show", limit: "documentBytes" }, { operation: "intelligence.list", limit: "documentBytes" },
  { operation: "run.check", limit: "recordBytes" }, { operation: "run.checklist", limit: "recordBytes" },
  { operation: "run.events", limit: "resultBytesExclusive" }, { operation: "run.list", limit: "markdownPageBytesExclusive" },
  { operation: "run.resume", limit: "resultBytes" }, { operation: "run.search", limit: "resultBytesExclusive" },
  { operation: "run.show", limit: "documentBytesExclusive" }, { operation: "run.start", limit: "resultBytes" },
] as const satisfies readonly StructuredSource[];
function functionStem(operation: string): string {
  const words = operation.split(".");
  return `${words[0] ?? ""}${words.slice(1).map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("")}`;
}
function expectedContract(source: StructuredSource, descriptors: readonly CliDescriptor[]): StructuredContract | undefined {
  const descriptor = descriptors.find((held) => held.operation === source.operation);
  if (descriptor === undefined || !("schemaVersion" in descriptor.output)) return undefined;
  const resultBytes = source.limit === undefined ? undefined : descriptor.limits[source.limit];
  if (resultBytes === undefined) return undefined;
  const stem = functionStem(source.operation), framing = source.framing ?? "exclusive-json";
  return { operation: source.operation, reading: source.operation === "run.list" ? "inspectRunList" : `${stem}Reading`,
    typed: `${stem}Document`, kind: descriptor.output.kind, schemaVersion: 1, resultBytes,
    exclusive: source.limit?.endsWith("Exclusive") === true || framing !== "exclusive-json", framing };
}

export const STRUCTURED_COMMANDS: readonly StructuredContract[] = entries.map((source) => {
  const contract = expectedContract(source, CLI_CONTRACTS);
  if (contract === undefined) throw new Error("The structured command descriptor lacks its result contract.");
  return contract;
});

export function structuredRegistryFault(registry: readonly StructuredContract[], descriptors: readonly CliDescriptor[]): string | undefined {
  const operations = registry.map((entry) => entry.operation);
  if (new Set(operations).size !== operations.length) return "duplicate structured operation";
  const fields = ["reading", "typed", "kind", "schemaVersion", "resultBytes", "exclusive", "framing"] as const;
  for (const entry of registry) {
    const source = entries.find((held) => held.operation === entry.operation);
    const expected = source === undefined ? undefined : expectedContract(source, descriptors);
    if (source !== undefined && expected === undefined) return `${entry.operation} has the wrong resultBytes`;
    if (expected !== undefined) for (const field of fields) if (entry[field] !== expected[field]) return `${entry.operation} has the wrong ${field}`;
  }
  for (const descriptor of descriptors) {
    const found = registry.filter((entry) => entry.operation === descriptor.operation);
    const structured = "schemaVersion" in descriptor.output;
    if (structured && !["auth.list", "model.list"].includes(descriptor.operation) && found.length !== 1) return `${descriptor.operation} lacks one typed document`;
    if ((!structured || ["auth.list", "model.list"].includes(descriptor.operation)) && found.length !== 0) return `${descriptor.operation} must not have a typed document`;
    const one = found[0];
    if (one !== undefined && (!("schemaVersion" in descriptor.output)
      || one.kind !== descriptor.output.kind || one.schemaVersion !== descriptor.output.schemaVersion)) return `${descriptor.operation} has the wrong document identity`;
  }
  return undefined;
}
export function structuredContract(operation: NewOperation): StructuredContract {
  const found = STRUCTURED_COMMANDS.find((entry) => entry.operation === operation);
  if (found === undefined) throw new Error("The structured command registry is incomplete.");
  return found;
}

function invariant(): never { throw new Error("The command result violated its structured document contract."); }
function oneLine(bytes: Buffer, contract: StructuredContract): unknown {
  const overBound = contract.exclusive ? bytes.length >= contract.resultBytes : bytes.length > contract.resultBytes;
  if (bytes.length === 0 || overBound || bytes.at(-1) !== 0x0a || bytes.subarray(0, -1).includes(0x0a) || bytes.subarray(0, -1).includes(0x0d)) invariant();
  const parsed = jsonValue(bytes.subarray(0, -1));
  return "error" in parsed ? invariant() : parsed.value;
}
function heldDocument(bytes: Buffer, contract: StructuredContract): unknown {
  const parsed = oneLine(bytes, contract);
  if (!mapping(parsed) || parsed["schemaVersion"] !== 1 || parsed["kind"] !== contract.kind) invariant();
  return parsed;
}
function heldError(bytes: Buffer, contract: StructuredContract): ErrorDocument {
  const parsed = oneLine(bytes, contract);
  if (!mapping(parsed) || parsed["schemaVersion"] !== 1 || parsed["kind"] !== "error" || !mapping(parsed["error"])) invariant();
  const held = parsed["error"];
  if (held["operation"] !== contract.operation || !ERROR_CODES.includes(held["code"] as ErrorCode)
    || !ERROR_CAUSES.includes(held["cause"] as ErrorCause) || typeof held["message"] !== "string"
    || Buffer.byteLength(held["message"]) > NEW_COMMAND_ERROR_BYTES || typeof held["retryable"] !== "boolean" || !mapping(held["details"])) invariant();
  return parsed as unknown as ErrorDocument;
}
function finalLine(stderr: Buffer): { prefix: Buffer; line: Buffer } {
  if (stderr.length === 0 || stderr.at(-1) !== 0x0a) invariant();
  const prior = stderr.lastIndexOf(0x0a, stderr.length - 2), start = prior < 0 ? 0 : prior + 1;
  return { prefix: stderr.subarray(0, start), line: stderr.subarray(start) };
}
function errorReading(command: CommandResult<number>, contract: StructuredContract, prefix: Buffer): Exclude<DocumentReading<never>, { kind: "document" }> {
  if (![1, 2, 3, 4, 5].includes(command.exit)) invariant();
  const split = finalLine(command.stderr), parsed = heldError(split.line, contract);
  if (!split.prefix.equals(prefix)) invariant();
  if (parsed.error.cause === "synchronization-failed") { if (command.stdout.length === 0) invariant(); heldDocument(command.stdout, contract); }
  else if (command.stdout.length !== 0) invariant();
  return { kind: "error", exit: command.exit as 1 | 2 | 3 | 4 | 5, error: parsed, command };
}

function exclusive(command: CommandResult<number>, contract: StructuredContract): DocumentReading<unknown> {
  if (command.stdout.length > 0 && command.stderr.length === 0) return { kind: "document", exit: command.exit, document: heldDocument(command.stdout, contract), command };
  if (command.stderr.length > 0 && command.stdout.length === 0) return errorReading(command, contract, Buffer.alloc(0));
  return invariant();
}

function advisory(command: CommandResult<number>, contract: StructuredContract): DocumentReading<unknown> {
  const bytes = Buffer.from(RETIRED_CREDENTIAL_ADVISORY);
  if (command.exit === 0) {
    if (command.stdout.length === 0 || command.stderr.length > 0 && !command.stderr.equals(bytes)) invariant();
    return { kind: "document", exit: command.exit, document: heldDocument(command.stdout, contract), command };
  }
  const split = finalLine(command.stderr);
  if (split.prefix.length > 0 && !split.prefix.equals(bytes)) invariant();
  return errorReading(command, contract, split.prefix);
}

function interaction(command: CommandResult<number>, contract: StructuredContract): DocumentReading<unknown> {
  const prefixMaximum = AUTH_LOGIN_CONTRACT.interactionTotalBytesExclusive + NEW_COMMAND_ERROR_BYTES;
  if (command.stderr.length >= prefixMaximum + AUTH_LOGIN_CONTRACT.resultBytes) invariant();
  if (command.exit === 0) {
    if (command.stdout.length === 0 || command.stderr.length >= prefixMaximum) invariant();
    return { kind: "document", exit: command.exit, document: heldDocument(command.stdout, contract), command };
  }
  const split = finalLine(command.stderr);
  if (split.prefix.length >= prefixMaximum) invariant();
  return errorReading(command, contract, split.prefix);
}

export function decodeDocument<D>(command: CommandResult<number>, contract: StructuredContract): DocumentReading<D> {
  const decoded = contract.framing === "exclusive-json" ? exclusive(command, contract)
    : contract.framing === "authentication-advisory" ? advisory(command, contract) : interaction(command, contract);
  return decoded as DocumentReading<D>;
}
