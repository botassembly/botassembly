// A resume is a new run seeded from sealed work in a dead donor. This module
// proves the donor and plans that seed; run.ts owns the new record and copies it.
import { isUtf8 } from "node:buffer";
import { join } from "node:path";
import type { FlowSource } from "./execution.ts";
import { isRunLive, runNames } from "./inspection.ts";
import { mapping, stagePath, type Flow, type StageNode } from "./model.ts";
import { type HashedPath, type StageIdentity } from "./record-events.ts";
import { CAPTURE, compactJson, hashBytes, prehashAssembly } from "./record.ts";
import { heldRecord } from "./record-lines.ts";
import { normalizedRunPath } from "./record-operation.ts";
import { heldRunFile } from "./run-files.ts";
import { CAUSES, type Cause, type Refusal } from "./spine.ts";

interface CarriedStage { identity: StageIdentity; output?: HashedPath; outputBytes?: Buffer; at: number }
export interface Continuation {
  from: string;
  donorDirectory: string;
  skip: number;
  carried: CarriedStage[];
  sources: FlowSource[];
  failure?: { name: string; bytes: Buffer };
}

export interface ResumeDonor {
  name: string;
  directory: string;
  assembly: string;
  assemblyHash: string;
  flow?: string;
  request: { bytes: Buffer; extension: string; via: "argument" | "task" | "stdin" };
  events: Record<string, unknown>[];
}

const unavailable = (name: string, cause: string): Refusal => ({ code: "request-invalid", path: name, sentence: `Cannot resume from run ${name}; ${cause}` });

function outputOf(event: Record<string, unknown>): HashedPath | undefined {
  const output = event["output"];
  return mapping(output) && typeof output["path"] === "string" && typeof output["sha256"] === "string"
    ? { path: output["path"], sha256: output["sha256"] }
    : undefined;
}

function sameStage(event: Record<string, unknown>, stage: string): boolean {
  return event["stage"] === stage && event["repeat"] === undefined && typeof event["retry"] === "number"
    && Number.isSafeInteger(event["retry"]) && event["retry"] >= 1;
}

function latest(events: Record<string, unknown>[], predicate: (event: Record<string, unknown>) => boolean): [number, Record<string, unknown>] | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && predicate(event)) return [index, event];
  }
  return undefined;
}

function successfulOutput(event: Record<string, unknown>): HashedPath | undefined {
  return event["event"] === "stage_end" && event["exit"] === 0 && event["cause"] === "success" && event["sealed"] === true && event["judged"] === true
    ? outputOf(event)
    : event["event"] === "stage_carried" ? outputOf(event) : undefined;
}

function source(node: StageNode, directory: string, output: HashedPath): FlowSource {
  return { name: node.name, extension: node.extension, diskPath: join(directory, ...output.path.split("/")), record: output };
}

interface PlannedStage { identity: StageIdentity; output: HashedPath; at: number; source: FlowSource }

function stagePlan(events: Record<string, unknown>[], directory: string, flow: Flow, node: StageNode): PlannedStage | undefined {
  const stage = stagePath(node, flow);
  const held = latest(events, (event) => sameStage(event, stage) && (event["event"] === "stage_end" || event["event"] === "stage_carried"));
  if (held === undefined) return undefined;
  const [at, event] = held;
  const output = successfulOutput(event);
  if (output === undefined) return undefined;
  const retry = event["retry"];
  if (typeof retry !== "number") return undefined;
  return { identity: { stage, retry }, output, at, source: source(node, directory, output) };
}

function executionPrefix(donor: ResumeDonor, flow: Flow): Pick<Continuation, "skip" | "carried" | "sources"> {
  let skip = 0;
  let sources: FlowSource[] = [];
  const carried: CarriedStage[] = [];
  // A resumed run only reuses the plain beginning of its root sequence. Once a
  // container appears, its own control state must be executed afresh.
  for (const node of flow.sequence.nodes) {
    if (node.kind !== "STAGE") break;
    const planned = stagePlan(donor.events, donor.directory, flow, node);
    if (planned === undefined) break;
    skip += 1;
    sources = [planned.source];
    carried.push({ identity: planned.identity, output: planned.output, at: planned.at });
  }
  return { skip, carried, sources };
}

const FAILURE_MAX_BYTES = 4_096;
const FAILURE_NAME = "bot-resume-prior-failure";

function cause(value: unknown): value is Cause {
  return CAUSES.some((candidate) => candidate === value);
}

function matchingEnding(stage: Record<string, unknown>, run: Record<string, unknown>, path: string): boolean {
  if (run["exit"] !== stage["exit"] || run["cause"] !== stage["cause"]) return false;
  if (run["stage"] === undefined) return run["repeat"] === undefined && run["retry"] === undefined;
  return run["stage"] === path && run["repeat"] === undefined && run["retry"] === stage["retry"];
}

function utf8Prefix(bytes: Buffer, length: number): string {
  let end = Math.min(bytes.length, length);
  while (end > 0 && !isUtf8(bytes.subarray(0, end))) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

interface FailureFields { donor: string; stage: string; retry: number; exit: number; cause: Cause; reason: string | null }
function failureBytes(fields: FailureFields): Buffer {
  const original = fields.reason === null ? undefined : Buffer.from(fields.reason);
  const encoded = (reason: string | null, truncated: boolean): Buffer => Buffer.from(`${compactJson({
    kind: "bot.resume-prior-failure", donor_run: fields.donor, stage: fields.stage, retry: fields.retry,
    exit: fields.exit, cause: fields.cause, reason, reason_bytes: original?.length ?? 0, reason_truncated: truncated,
  })}\n`);
  const complete = encoded(fields.reason, false);
  if (complete.length <= FAILURE_MAX_BYTES || original === undefined) return complete;
  let low = 0;
  let high = Math.min(original.length, FAILURE_MAX_BYTES);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (encoded(utf8Prefix(original, middle), true).length <= FAILURE_MAX_BYTES) low = middle;
    else high = middle - 1;
  }
  return encoded(utf8Prefix(original, low), true);
}

function failureName(sources: readonly FlowSource[], carried: readonly CarriedStage[]): string {
  const names = new Set(sources.map((held) => held.name));
  const conflicts = (name: string): boolean => names.has(name)
    || carried.some(({ output }) => output?.path === `resume/${name}.json`);
  if (!conflicts(FAILURE_NAME)) return FAILURE_NAME;
  for (let suffix = 2; ; suffix += 1) if (!conflicts(`${FAILURE_NAME}-${String(suffix)}`)) return `${FAILURE_NAME}-${String(suffix)}`;
}

function unsuccessfulExit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value !== 0;
}

function failureCause(value: unknown): value is Cause {
  return cause(value) && value !== "success" && value !== "signal";
}

function availableReason(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function failedStage(event: Record<string, unknown> | undefined, path: string): Omit<FailureFields, "donor"> | undefined {
  if (event === undefined) return undefined;
  if (!sameStage(event, path)) return undefined;
  const exit = event["exit"], endingCause = event["cause"], reason = event["reason"], retry = event["retry"];
  if (!unsuccessfulExit(exit)) return undefined;
  if (!failureCause(endingCause)) return undefined;
  if (!availableReason(reason)) return undefined;
  if (typeof retry !== "number") return undefined;
  return { stage: path, retry, exit, cause: endingCause, reason: reason ?? null };
}

function priorFailure(donor: ResumeDonor, flow: Flow, prefix: Pick<Continuation, "skip" | "sources" | "carried">): Continuation["failure"] {
  const next = flow.sequence.nodes[prefix.skip];
  if (next?.kind !== "STAGE") return undefined;
  const path = stagePath(next, flow);
  const stageEvent = latest(donor.events, (event) => event["event"] === "stage_end")?.[1];
  const run = latest(donor.events, (event) => event["event"] === "run_end")?.[1];
  const stage = failedStage(stageEvent, path);
  if (stage === undefined || stageEvent === undefined || run === undefined || !matchingEnding(stageEvent, run, path)) return undefined;
  return {
    name: failureName(prefix.sources, prefix.carried),
    bytes: failureBytes({ donor: donor.name, ...stage }),
  };
}

async function verified(directory: string, output: HashedPath): Promise<Buffer | undefined> {
  if (!normalizedRunPath(output.path)) return undefined;
  const file = await heldRunFile(directory, output.path);
  return file.kind === "held" && hashBytes(file.bytes) === output.sha256 ? file.bytes : undefined;
}

function selectedDonor(matches: string[], requested: string): string | Refusal {
  return matches.length === 0 ? unavailable(requested, "no such run exists.") : matches.length === 1 && matches[0] !== undefined ? matches[0] : unavailable(requested, "more than one run matches. Name one run.");
}

interface RetainedRequest { path: string; sha256: string; bytes: number; via: "argument" | "task" | "stdin" }
function retainedVia(value: unknown): RetainedRequest["via"] | undefined {
  return value === "argument" || value === "task" || value === "stdin" ? value : undefined;
}
function retainedRequest(value: unknown): RetainedRequest | undefined {
  if (!mapping(value)) return undefined;
  const path = value["path"];
  const sha256 = value["sha256"];
  const bytes = value["bytes"];
  const via = retainedVia(value["via"]);
  if (typeof path !== "string" || !normalizedRunPath(path) || typeof sha256 !== "string" || typeof bytes !== "number" || !Number.isInteger(bytes)) return undefined;
  if (via === undefined || bytes < 0 || !/^[a-f0-9]{64}$/u.test(sha256)) return undefined;
  return { path, sha256, bytes, via };
}

function requestOf(start: Record<string, unknown>, name: string): (RetainedRequest & { extension: string }) | Refusal {
  const request = retainedRequest(start["request"]);
  const extension = request === undefined ? undefined : /^request\.([A-Za-z0-9]+)$/u.exec(request.path)?.[1];
  return request === undefined || extension === undefined ? unavailable(name, "its retained request is malformed.") : { ...request, extension };
}

async function donorCaptureMatches(directory: string, expected: string): Promise<boolean> {
  const actual = await prehashAssembly(join(directory, CAPTURE)).then((held) => held.sha256, () => undefined);
  return actual === expected;
}

interface StartedDonor { assembly: string; assemblyHash: string; flow?: string }
function startedDonor(event: Record<string, unknown> | undefined): StartedDonor | undefined {
  if (event === undefined) return undefined;
  const assembly = event["assembly"];
  const assemblyHash = event["assembly_hash"];
  const flow = event["flow"];
  if (typeof assembly !== "string" || typeof assemblyHash !== "string" || (flow !== undefined && typeof flow !== "string")) return undefined;
  return flow === undefined ? { assembly, assemblyHash } : { assembly, assemblyHash, flow };
}

async function retainedBytes(directory: string, request: RetainedRequest): Promise<Buffer | undefined> {
  const file = await heldRunFile(directory, request.path);
  return file.kind === "held" && file.bytes.length === request.bytes && hashBytes(file.bytes) === request.sha256 ? file.bytes : undefined;
}

async function readableDonor(directory: string): Promise<Awaited<ReturnType<typeof heldRecord>> | undefined> {
  const record = await heldRecord(directory);
  return record !== undefined && record.fault === undefined && record.classification === "valid" ? record : undefined;
}

/** Select and validate a donor before a new run directory exists. */
export async function resumeDonor(home: string, requested: string): Promise<ResumeDonor | Refusal> {
  const name = selectedDonor((await runNames(home)).filter((candidate) => candidate.startsWith(requested)), requested);
  if (typeof name !== "string") return name;
  const directory = join(home, "runs", name);
  if (isRunLive(directory)) return unavailable(name, "it is held by a live run. Wait for it to end.");
  const record = await readableDonor(directory);
  if (record === undefined) return unavailable(name, `record ${join(directory, "record.jsonl")} cannot be read.`);
  const start = record.events.find((event) => event["event"] === "run_start");
  const details = startedDonor(start);
  if (details === undefined) return unavailable(name, "its run start is malformed.");
  if (!(await donorCaptureMatches(directory, details.assemblyHash))) return unavailable(name, "the assembly changed since that run. Re-run fresh.");
  const request = requestOf(start ?? {}, name);
  if ("code" in request) return request;
  const bytes = await retainedBytes(directory, request);
  if (bytes === undefined) return unavailable(name, "its retained request cannot be verified.");
  return { name, directory, ...details, request: { bytes, extension: request.extension, via: request.via }, events: record.events };
}

export async function continuationFor(donor: ResumeDonor, flow: Flow): Promise<Continuation | Refusal> {
  const prefix = executionPrefix(donor, flow);
  const failure = priorFailure(donor, flow, prefix);
  const carried: CarriedStage[] = [];
  for (const stage of prefix.carried) {
    if (stage.output === undefined) {
      carried.push(stage);
      continue;
    }
    const outputBytes = await verified(donor.directory, stage.output);
    if (outputBytes === undefined) return unavailable(donor.name, `sealed output ${stage.output.path} cannot be read.`);
    carried.push({ ...stage, outputBytes });
  }
  return { from: donor.name, donorDirectory: donor.directory, ...prefix, carried, ...(failure === undefined ? {} : { failure }) };
}
