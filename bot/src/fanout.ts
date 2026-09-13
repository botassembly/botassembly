import { join } from "node:path";
import { createAgentClock } from "./clock.ts";
import type { Execution, FlowSource, NodeResult } from "./execution.ts";
import { bytewise, mapping, stagePath, type FanoutNode, type StageNode } from "./model.ts";
import { runPool } from "./pool.ts";
import { childRecordAgrees } from "./child-record.ts";
import {
  fanoutDoneEvent,
  fanoutStartEvent,
  subflowCallEvent,
  type FanoutIdentity,
  type FanoutPlan,
  type HashedPath,
  type StageIdentity,
} from "./record-events.ts";
import { compactJson, hashBytes } from "./record.ts";
import { heldRecord } from "./record-lines.ts";
import { heldRunFile } from "./run-files.ts";
import { holdRunFile } from "./run-files.ts";
import { jsonValue } from "./schema-check.ts";
import { attemptKey } from "./invocation.ts";
import { closeHeldSources } from "./source-materialization.ts";
import { declaredSlots, workdirRoot } from "./runtime-slots.ts";
import { declinedSubflowChild, runSubflowChild, scopedSubflows, type SubflowBatchInput } from "./subflow-runtime.ts";
import type { SubflowRequest, SubflowToolDetail } from "./tools.ts";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const ITEM_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/u;

interface PlannedItem extends FanoutPlan {
  request: Buffer;
}

function identity(execution: Execution, node: FanoutNode): FanoutIdentity {
  return { stage: stagePath(node, execution.input.flow), retry: 1 };
}

function rejected(reason: string, held: StageIdentity): NodeResult {
  return { exit: 1, cause: "rejected", reason, outputs: [], terminalStage: held };
}

function faulted(reason: string, held: StageIdentity): NodeResult {
  return { exit: 2, cause: "fault", reason, outputs: [], terminalStage: held };
}

function plannedEntry(entry: unknown, seen: Set<string>): PlannedItem | string {
  if (!mapping(entry) || Object.keys(entry).length !== 2 || !("id" in entry) || !("input" in entry)) {
    return "Each fan-out item must contain exactly id and input.";
  }
  const id = entry["id"], input = entry["input"];
  if (typeof id !== "string" || !ITEM_ID.test(id)) return "Each fan-out id must use lowercase letters, digits, underscore, or hyphen.";
  if (!mapping(input)) return `Fan-out item ${id} must carry an input object.`;
  if (seen.has(id)) return `Fan-out item id ${id} appears more than once.`;
  seen.add(id);
  const request = Buffer.from(compactJson({ id, input }));
  return { item: id, call: 0, request_bytes: request.length, request_sha256: hashBytes(request), request };
}

function plan(node: FanoutNode, value: unknown): PlannedItem[] | string {
  if (!mapping(value)) return "The fan-out manifest root must be an object.";
  const items = value[node.items];
  if (!Array.isArray(items)) return `The fan-out member ${node.items} must be an array.`;
  if (items.length === 0) return `The fan-out member ${node.items} must not be empty.`;
  if (items.length > node.maxItems) return `The fan-out member ${node.items} exceeds max-items ${String(node.maxItems)}.`;
  const seen = new Set<string>();
  const planned: PlannedItem[] = [];
  for (const entry of items) {
    const held = plannedEntry(entry, seen);
    if (typeof held === "string") return held;
    planned.push(held);
  }
  planned.sort((left, right) => bytewise(left.item, right.item));
  return planned.map((item, index) => ({ ...item, call: index + 1 }));
}

function successfulChild(detail: SubflowToolDetail): detail is SubflowToolDetail & {
  started: true; exit: 0; cause: "success"; child: string;
} {
  return detail.started && detail.exit === 0 && detail.cause === "success" && typeof detail.child === "string";
}

interface VerifiedOutput { path: string; sha256: string; extension?: string }

function outputDescriptor(value: unknown): VerifiedOutput | undefined {
  if (!mapping(value)) return undefined;
  const path = value["path"], sha256 = value["sha256"];
  return typeof path === "string" && typeof sha256 === "string" ? { path, sha256 } : undefined;
}

function finalStageOutput(
  ending: Record<string, unknown>, flow: SubflowBatchInput["currentFlow"],
): { final: StageNode; retry: number } | undefined {
  const final = flow.sequence.nodes.at(-1);
  const retry = ending["retry"];
  if (final?.kind !== "STAGE" || ending["stage"] !== stagePath(final, flow) || ending["repeat"] !== undefined) return undefined;
  return typeof retry === "number" && Number.isSafeInteger(retry) && retry >= 1 ? { final, retry } : undefined;
}

function acceptedStageEnding(ending: Record<string, unknown> | undefined): ending is Record<string, unknown> {
  return ending?.["exit"] === 0 && ending["cause"] === "success"
    && ending["sealed"] === true && ending["judged"] === true;
}

function successfulOutput(
  record: Awaited<ReturnType<typeof heldRecord>>, flow: SubflowBatchInput["currentFlow"],
): VerifiedOutput | undefined {
  const ending = record === undefined ? undefined : [...record.events].reverse().find((event) => event["event"] === "stage_end");
  if (record?.classification !== "valid" || !acceptedStageEnding(ending)) return undefined;
  const owner = finalStageOutput(ending, flow);
  if (owner === undefined) return undefined;
  const output = outputDescriptor(ending["output"]);
  const path = `stages/${stagePath(owner.final, flow)}/1/${String(owner.retry)}/output.${owner.final.extension}`;
  return output?.path === path ? { ...output, extension: owner.final.extension } : undefined;
}

async function sourceFor(
  execution: Execution, item: PlannedItem, detail: SubflowToolDetail, flow: SubflowBatchInput["currentFlow"],
): Promise<FlowSource | undefined> {
  if (!successfulChild(detail)) return undefined;
  const childDirectory = join(execution.input.writer.runDirectory, ...detail.child.split("/"));
  const record = await heldRecord(childDirectory);
  if (record === undefined || !await childRecordAgrees(
    execution.input.writer.runDirectory, detail.child,
    { flow: detail.flow, input: detail.input, exit: detail.exit, cause: detail.cause }, record,
  )) return undefined;
  const output = successfulOutput(record, flow);
  if (output === undefined) return undefined;
  const held = await holdRunFile(childDirectory, output.path);
  if (!("copy" in held) || held.sha256 !== output.sha256) {
    if ("copy" in held) await held.close();
    return undefined;
  }
  return {
    name: item.item, extension: output.extension ?? "txt",
    diskPath: join(childDirectory, ...output.path.split("/")),
    record: { path: `${detail.child}/${output.path}`, sha256: output.sha256 }, held,
  };
}

function machinery(detail: SubflowToolDetail): boolean {
  return !detail.started || detail.exit === 2 || detail.exit === undefined;
}

function resultFor(details: SubflowToolDetail[], missingOutputs: ReadonlySet<number>, held: StageIdentity): NodeResult | undefined {
  const impossible = details.find((detail) => machinery(detail) || missingOutputs.has(detail.call));
  const failed = impossible ?? details.find((detail) => detail.exit !== 0);
  if (failed === undefined) return undefined;
  const impossibleOutcome = machinery(failed) || missingOutputs.has(failed.call);
  return {
    exit: impossibleOutcome ? 2 : failed.exit ?? 2,
    cause: impossibleOutcome ? "fault" : failed.cause ?? "fault",
    reason: failed.reason ?? `Fan-out item ${String(failed.call)} failed.`, outputs: [], terminalStage: held,
  };
}

function unstarted(input: SubflowBatchInput, node: FanoutNode, item: PlannedItem): SubflowToolDetail {
  return { call: item.call, flow: node.subflow, depth: input.currentCallChainDepth + 1, started: false, reason: "The run was signalled." };
}

function itemEvent(
  execution: Execution, held: StageIdentity, node: FanoutNode, item: PlannedItem,
  detail: SubflowToolDetail, output: FlowSource | undefined,
) {
  const common = {
    ts: execution.input.clock.timestamp(), identity: held, call: item.call, flow: node.subflow,
    depth: detail.depth, via: "fanout" as const, item: item.item,
    ...(output === undefined ? {} : { output: output.record }),
  };
  if (detail.started && detail.input !== undefined && detail.child !== undefined) return startedItemEvent(common, detail);
  return subflowCallEvent({
    ...common, started: false, ...(detail.input === undefined ? {} : { input: detail.input }),
    ...(detail.reason === undefined ? {} : { reason: detail.reason }),
  });
}

interface FanoutItemCommon {
  ts: string;
  identity: StageIdentity;
  call: number;
  flow: string;
  depth: number;
  via: "fanout";
  item: string;
  output?: HashedPath;
}

function startedItemEvent(
  common: FanoutItemCommon, detail: SubflowToolDetail,
) {
  if (detail.input === undefined || detail.child === undefined) throw new Error("A started fan-out item lost its child identity.");
  if (detail.exit !== undefined && detail.cause !== undefined) return subflowCallEvent({
    ...common, started: true, input: detail.input, child: detail.child, exit: detail.exit, cause: detail.cause,
    ...(detail.reason === undefined ? {} : { reason: detail.reason }),
  });
  return subflowCallEvent({
    ...common, started: true, input: detail.input, child: detail.child,
    reason: detail.reason ?? "Child record machinery failed.",
  });
}

interface ManifestPlan { planned: PlannedItem[]; bytes: Buffer; size: number; source: FlowSource }

async function manifestPlan(
  execution: Execution, node: FanoutNode, sources: FlowSource[], held: StageIdentity,
): Promise<ManifestPlan | NodeResult> {
  const source = sources[0];
  if (source === undefined || sources.length !== 1 || source.extension !== "json") {
    return rejected("FANOUT requires one preceding JSON output.", held);
  }
  const manifest = await heldRunFile(execution.input.writer.runDirectory, source.record.path);
  if (manifest.kind === "too-large") return rejected("The fan-out manifest exceeds one MiB.", held);
  if (manifest.kind !== "held") return faulted("The fan-out manifest could not be read from its sealed output.", held);
  if (manifest.size > MAX_MANIFEST_BYTES || hashBytes(manifest.bytes) !== source.record.sha256) {
    return faulted("The fan-out manifest did not match its sealed output.", held);
  }
  const parsed = jsonValue(manifest.bytes);
  if ("error" in parsed) return rejected("The fan-out manifest must be valid UTF-8 JSON.", held);
  const planned = plan(node, parsed.value);
  return typeof planned === "string" ? rejected(planned, held) : { planned, bytes: manifest.bytes, size: manifest.size, source };
}

async function runItems(
  node: FanoutNode, planned: PlannedItem[], childInput: SubflowBatchInput,
): Promise<{ details: SubflowToolDetail[]; concurrent: number }> {
  const pool = await runPool({
    items: planned, width: node.width, cancelled: () => childInput.signal.abort.aborted,
    run: async (item) => {
      const request: SubflowRequest = { flow: node.subflow, input: item.request.toString("utf8") };
      const detail = await runSubflowChild(childInput, request, item.call, {
        bytes: item.request, extension: "json", retained: true, exposeAnswer: false,
      })
        .then((settled) => settled, (reason: unknown): SubflowToolDetail => (
          declinedSubflowChild(childInput, request, item.call, reason)
        ));
      return { value: detail, stop: false };
    },
  });
  return {
    details: planned.map((item, index) => pool.values[index] ?? unstarted(childInput, node, item)),
    concurrent: pool.concurrent,
  };
}

async function publishItems(
  execution: Execution, held: StageIdentity, node: FanoutNode, planned: PlannedItem[], details: SubflowToolDetail[],
): Promise<{ outputs: FlowSource[]; missingOutputs: Set<number> }> {
  const outputs: FlowSource[] = [], missingOutputs = new Set<number>();
  let complete = false;
  try {
    for (const [index, detail] of details.entries()) {
      const item = planned[index];
      if (item === undefined) continue;
      const flow = childInputFlow(execution, node);
      const output = flow === undefined ? undefined : await sourceFor(execution, item, detail, flow);
      if (successfulChild(detail) && output === undefined) {
        detail.reason = `Fan-out item ${item.item} has no verified sealed output.`;
        missingOutputs.add(detail.call);
      }
      if (output !== undefined) outputs.push(output);
      await execution.input.writer.append(itemEvent(execution, held, node, item, detail, output));
    }
    complete = true;
    return { outputs, missingOutputs };
  } finally {
    if (!complete) await closeHeldSources(outputs);
  }
}

function childInputFlow(execution: Execution, node: FanoutNode) {
  return scopedSubflows(
    execution.input.assembly.subflows, execution.input.flow, undefined, execution.depth, execution.callChainDepth,
  ).get(node.subflow);
}

function selectedItem(
  planned: PlannedItem[], details: SubflowToolDetail[], missingOutputs: ReadonlySet<number>,
): string | undefined {
  const selected = details.find((detail) => machinery(detail) || missingOutputs.has(detail.call))
    ?? details.find((detail) => detail.exit !== 0);
  return selected === undefined ? undefined : planned[details.indexOf(selected)]?.item;
}

function childBatch(
  execution: Execution, held: StageIdentity, runChild: SubflowBatchInput["runChild"],
): SubflowBatchInput {
  return {
    calls: [], scope: scopedSubflows(execution.input.assembly.subflows, execution.input.flow, undefined,
      execution.depth, execution.callChainDepth), currentFlow: execution.input.flow, currentDepth: execution.depth,
    currentCallChainDepth: execution.callChainDepth, identity: held, writer: execution.input.writer,
    answersDirectory: join(execution.input.scratchDirectory, attemptKey(held.stage, held.repeat), "answers"),
    scratchDirectory: execution.input.scratchDirectory, metadata: execution.input.metadata,
    slots: declaredSlots(execution.input), workdirRoot: workdirRoot(execution), clock: createAgentClock(execution.input.clock),
    monotonic: () => execution.input.clock.milliseconds(), signal: execution.input.signal,
    toolSignal: execution.input.signal.abort, counter: { value: 0 },
    ...(execution.input.localStop === undefined ? {} : { callerStop: execution.input.localStop }), runChild,
  };
}

async function appendDone(
  execution: Execution, held: FanoutIdentity, result: NodeResult, concurrent: number,
  selected: string | undefined, outputs: FlowSource[],
): Promise<void> {
  const written = await execution.input.writer.append(fanoutDoneEvent({
    ts: execution.input.clock.timestamp(), identity: held, exit: result.exit, cause: result.cause,
    concurrent, ...(result.exit === 0 || result.cause === "signal" || selected === undefined ? {} : { selected }),
  })).then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
  if (written.ok) return;
  await closeHeldSources(outputs);
  throw written.error;
}

export async function runFanout(
  execution: Execution, node: FanoutNode, sources: FlowSource[], runChild: SubflowBatchInput["runChild"],
): Promise<NodeResult> {
  const held = identity(execution, node);
  const childInput = childBatch(execution, held, runChild);
  const signalBefore = execution.input.signal.exitCode();
  if (signalBefore !== undefined) return { exit: signalBefore, cause: "signal", outputs: [], terminalStage: held };
  const manifest = await manifestPlan(execution, node, sources, held);
  if (!("planned" in manifest)) return manifest;
  await execution.input.writer.append(fanoutStartEvent({
    ts: execution.input.clock.timestamp(), identity: held, received: manifest.source.record, items: node.items, subflow: node.subflow,
    width: node.width, maxItems: node.maxItems, manifestBytes: manifest.size, manifestSha256: hashBytes(manifest.bytes),
    plan: manifest.planned.map(({ request: _request, ...item }) => item),
  }));
  const { details, concurrent } = await runItems(node, manifest.planned, childInput);
  const { outputs, missingOutputs } = await publishItems(execution, held, node, manifest.planned, details);
  const signalled = execution.input.signal.exitCode();
  const failed = signalled === undefined ? resultFor(details, missingOutputs, held) : { exit: signalled, cause: "signal" as const, outputs: [], terminalStage: held };
  const result = failed ?? (outputs.length === manifest.planned.length
    ? { exit: 0, cause: "success" as const, outputs }
    : faulted("FANOUT did not produce one verified output per item.", held));
  const selected = selectedItem(manifest.planned, details, missingOutputs);
  if (result.exit !== 0) await closeHeldSources(outputs);
  await appendDone(execution, held, result, concurrent, selected, outputs);
  return result;
}
