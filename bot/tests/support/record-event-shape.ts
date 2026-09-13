import { isAbsolute } from "node:path";
import { ACCESS_OPERATIONS, mapping, sequenceName } from "../../src/model.ts";
import { CONTROL_TOOLS, isRecordEventName, type RecordEventName } from "../../src/record-events.ts";
import { CAUSES } from "../../src/spine.ts";

const causes = new Set<string>(CAUSES);
const checks = new Set(["output", "checklist", "schema", "gate", "select", "question"]);
const hooks = new Set(["before", "success", "failure"]);
const tools = new Set<string>(CONTROL_TOOLS);
const skillSources = new Set(["workspace", "assembly-root", "flow-local", "container-local", "stage-local"]);
const accessOperations = new Set<string>(ACCESS_OPERATIONS);
const identityEvents = new Set<RecordEventName>([
  "stage_carried", "stage_start", "prompt", "stage_end", "unreconciled", "provider_start", "turn", "provider_retry", "provider_transport",
  "gate_start", "check", "tool_call", "tool_denied", "subflow_call", "chose", "loop_done", "parallel_done", "fanout_start", "fanout_done", "hook",
]);

const integer = (value: unknown, least = 0): value is number => Number.isSafeInteger(value) && typeof value === "number" && value >= least;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const optionalText = (value: unknown): boolean => value === undefined || typeof value === "string";
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const installationId = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const validRepeat = (value: unknown): boolean => value === undefined || integer(value, 1);
const arrayOf = (value: unknown, accepts: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(accepts);
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));
const relativePath = (value: unknown): value is string => text(value) && !isAbsolute(value)
  && !value.includes("\\") && !value.includes("\u0000")
  && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
const relativeRootPath = (value: unknown): value is string => value === "." || relativePath(value);
const isoTimestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

function recordEventName(value: unknown): RecordEventName | undefined {
  return isRecordEventName(value) ? value : undefined;
}

function noIdentity(event: Record<string, unknown>): boolean {
  return event["stage"] === undefined && event["retry"] === undefined && event["repeat"] === undefined;
}

function writerStage(value: unknown): value is string {
  return value === "assembly" || typeof value === "string" && sequenceName(value.split("/")[0] ?? "");
}

function stageIdentity(event: Record<string, unknown>, optional = false): string | undefined {
  if (optional && noIdentity(event)) return "";
  const stage = event["stage"], retry = event["retry"], repeat = event["repeat"];
  return relativePath(stage) && writerStage(stage) && integer(retry, 1) && validRepeat(repeat)
    ? `${stage}\u0000${typeof repeat === "number" ? String(repeat) : ""}\u0000${String(retry)}`
    : undefined;
}

function ordinaryExit(cause: string): number[] {
  if (cause === "success") return [0];
  if (cause === "fault") return [2];
  if (cause === "timeout") return [1, 2];
  return [1];
}

function terminalPair(event: Record<string, unknown>, signal?: { number: number; name: string }): boolean {
  const cause = event["cause"], exit = event["exit"];
  if (typeof cause !== "string" || !causes.has(cause) || !integer(exit)) return false;
  if (cause === "signal") return signal === undefined ? [129, 130, 143].includes(exit) : exit === 128 + signal.number;
  return ordinaryExit(cause).includes(exit);
}

function hashedPath(value: unknown): boolean {
  return mapping(value) && exactKeys(value, ["path", "sha256"]) && relativePath(value["path"]) && sha(value["sha256"]);
}

function requestShape(value: unknown): boolean {
  return mapping(value) && exactKeys(value, ["path", "sha256", "bytes", "via"])
    && relativePath(value["path"]) && sha(value["sha256"]) && integer(value["bytes"]) && text(value["via"]);
}

function receivedItem(value: unknown): boolean {
  return mapping(value) && exactKeys(value, ["name", "path", "sha256"])
    && text(value["name"]) && relativePath(value["path"]) && sha(value["sha256"]);
}

function receivedShape(value: unknown): boolean {
  return arrayOf(value, receivedItem);
}

function optionsShape(value: unknown): boolean {
  return arrayOf(value, (item) => mapping(item) && exactKeys(item, ["name", "value", "rung"])
    && text(item["name"]) && (typeof item["value"] === "string" || typeof item["value"] === "number"
      && Number.isFinite(item["value"])) && text(item["rung"]));
}

function slotsShape(value: unknown): boolean {
  const required = ["pwd", "input", "output", "tmp", "skills"];
  return value === undefined || mapping(value) && exactKeys(value, [...required, "subflows"])
    && required.every((key) => text(value[key])) && (value["subflows"] === undefined || text(value["subflows"]));
}

function workdirShape(value: unknown): boolean {
  return value === undefined || mapping(value) && exactKeys(value, ["authored", "resolved"])
    && (value["authored"] === null || text(value["authored"])) && relativeRootPath(value["resolved"]);
}

function toolsShape(value: unknown): boolean {
  return value === undefined || arrayOf(value, (tool) => mapping(tool) && exactKeys(tool, ["name", "description"])
    && text(tool["name"]) && typeof tool["description"] === "string");
}

function skillsShape(value: unknown): boolean {
  return value === undefined || arrayOf(value, (skill) => mapping(skill) && exactKeys(skill, ["name", "source"])
    && text(skill["name"])
    && typeof skill["source"] === "string" && skillSources.has(skill["source"]));
}

function accessShape(value: unknown): boolean {
  return value === undefined || mapping(value)
    && Object.entries(value).every(([key, paths]) => accessOperations.has(key) && arrayOf(paths, text));
}

function stageStartShape(event: Record<string, unknown>): boolean {
  return receivedShape(event["received"]) && optionsShape(event["options"]) && slotsShape(event["slots"])
    && workdirShape(event["workdir"]) && toolsShape(event["tools"]) && skillsShape(event["skills"])
    && accessShape(event["access"]) && (event["session"] === undefined || relativePath(event["session"]));
}

function outputGroup(event: Record<string, unknown>): boolean {
  const absent = event["output"] === undefined && event["sealed"] === undefined && event["judged"] === undefined;
  return absent || hashedPath(event["output"]) && typeof event["sealed"] === "boolean" && typeof event["judged"] === "boolean";
}

function harnessPromptSource(value: Record<string, unknown>): boolean {
  return exactKeys(value, ["source", "system", "firstTurn"])
    && relativePath(value["system"])
    && relativePath(value["firstTurn"]);
}

function workspacePromptSource(value: Record<string, unknown>): boolean {
  const mode = value["mode"];
  return exactKeys(value, ["source", "mode", "name", "path"])
    && (mode === "announce" || mode === "use")
    && relativePath(value["path"])
    && (value["name"] === undefined || text(value["name"]));
}

function namedPromptSource(value: Record<string, unknown>): boolean {
  return exactKeys(value, ["source", "name", "path"])
    && text(value["name"])
    && relativePath(value["path"]);
}

function simplePromptSource(value: Record<string, unknown>): boolean {
  return exactKeys(value, ["source", "path"]) && relativePath(value["path"]);
}

const namedPromptSources = new Set(["skill", "helper", "input"]);
const simplePromptSources = new Set(["assembly", "flow", "stage", "schema", "request"]);

function promptSource(value: unknown): boolean {
  if (!mapping(value) || !text(value["source"])) return false;
  const source = value["source"];
  if (source === "harness") return harnessPromptSource(value);
  if (source === "workspace") return workspacePromptSource(value);
  if (namedPromptSources.has(source)) return namedPromptSource(value);
  return simplePromptSources.has(source) && simplePromptSource(value);
}

function subflowInput(value: unknown): boolean {
  if (!mapping(value) || !sha(value["sha256"]) || !integer(value["bytes"])) return false;
  const inline = exactKeys(value, ["text", "sha256", "bytes"])
    && typeof value["text"] === "string" && value["path"] === undefined;
  const retained = exactKeys(value, ["path", "sha256", "bytes"])
    && relativePath(value["path"]) && value["text"] === undefined;
  return inline || retained;
}

function unstartedSubflow(event: Record<string, unknown>): boolean {
  return event["child"] === undefined && event["exit"] === undefined && event["cause"] === undefined;
}

function startedSubflow(event: Record<string, unknown>): boolean {
  if (!relativePath(event["child"]) || !subflowInput(event["input"])) return false;
  const incomplete = event["exit"] === undefined && event["cause"] === undefined && text(event["reason"]);
  return incomplete || terminalPair(event);
}

function fanoutOutput(event: Record<string, unknown>): boolean {
  const output = event["output"], child = event["child"];
  if (output === undefined) return true;
  if (!hashedPath(output) || !mapping(output) || typeof output["path"] !== "string" || typeof child !== "string") return false;
  return event["started"] === true && event["exit"] === 0 && event["cause"] === "success"
    && output["path"].startsWith(`${child}/`);
}

function subflowOrigin(event: Record<string, unknown>): boolean {
  if (event["via"] === undefined) return event["item"] === undefined && event["output"] === undefined;
  return event["via"] === "fanout" && event["repeat"] === undefined && text(event["item"]) && fanoutOutput(event);
}

function subflowShape(event: Record<string, unknown>): boolean {
  const core = integer(event["call"], 1) && text(event["flow"]) && integer(event["depth"])
    && typeof event["started"] === "boolean" && optionalText(event["reason"]);
  const input = event["input"] === undefined || subflowInput(event["input"]);
  if (!core || !input || !subflowOrigin(event)) return false;
  return event["started"] === true ? startedSubflow(event) : unstartedSubflow(event);
}

function fanoutPlan(value: unknown): boolean {
  return mapping(value) && exactKeys(value, ["item", "call", "request_bytes", "request_sha256"])
    && text(value["item"]) && integer(value["call"], 1) && integer(value["request_bytes"]) && sha(value["request_sha256"]);
}

function fanoutPlanShape(event: Record<string, unknown>): boolean {
  const plan = event["plan"], maximum = event["max_items"];
  if (!arrayOf(plan, fanoutPlan) || !Array.isArray(plan) || !integer(maximum, 1)) return false;
  if (plan.length === 0 || plan.length > maximum) return false;
  const items = plan.map((row) => mapping(row) && typeof row["item"] === "string" ? row["item"] : "");
  return plan.every((row, index) => mapping(row) && row["call"] === index + 1)
    && new Set(items).size === items.length
    && items.every((item, index) => index === 0 || Buffer.compare(Buffer.from(items[index - 1] ?? ""), Buffer.from(item)) < 0);
}

function fanoutSettings(event: Record<string, unknown>): boolean {
  const width = event["width"], maximum = event["max_items"];
  return event["repeat"] === undefined && text(event["items"]) && text(event["subflow"])
    && integer(width, 1) && integer(maximum, 1) && width <= maximum && maximum <= 32;
}

function fanoutManifest(event: Record<string, unknown>): boolean {
  const received = event["received"];
  return hashedPath(received) && mapping(received) && integer(event["manifest_bytes"])
    && event["manifest_bytes"] <= 1024 * 1024 && sha(event["manifest_sha256"])
    && received["sha256"] === event["manifest_sha256"];
}

function fanoutStartShape(event: Record<string, unknown>): boolean {
  return fanoutSettings(event) && fanoutManifest(event) && fanoutPlanShape(event);
}

function fanoutDoneShape(event: Record<string, unknown>): boolean {
  if (event["repeat"] !== undefined || !terminalPair(event) || !integer(event["concurrent"])) return false;
  if (event["cause"] === "success") return event["exit"] === 0 && event["selected"] === undefined;
  if (event["cause"] === "signal") return event["selected"] === undefined;
  return text(event["selected"]);
}

function parallelBranch(value: unknown): boolean {
  if (!mapping(value) || !text(value["branch"]) || typeof value["started"] !== "boolean") return false;
  return value["started"]
    ? exactKeys(value, ["branch", "started", "exit", "cause"]) && terminalPair(value)
    : exactKeys(value, ["branch", "started"]) && value["exit"] === undefined && value["cause"] === undefined;
}

function parallelShape(event: Record<string, unknown>): boolean {
  const branches = event["branches"], concurrent = event["concurrent"], width = event["width"];
  if (!integer(width, 1) || !integer(concurrent) || !arrayOf(branches, parallelBranch)) return false;
  if (!Array.isArray(branches) || concurrent > Math.min(width, branches.length)) return false;
  return !branches.some((branch) => mapping(branch) && branch["started"] === true) || concurrent > 0;
}

function completeProvenance(event: Record<string, unknown>): boolean {
  const source = event["runtime_source"];
  const digest = event["runtime_digest"];
  const modelSource = event["model_source"];
  return (source === "checkout" || source === "unknown")
    && (digest === null || text(digest))
    && sha(event["lock_sha256"])
    && text(event["node"])
    && text(event["provider_adapter"])
    && sha(event["runtime_tree_sha256"])
    && (modelSource === undefined || modelSource === "scripted");
}

function provenanceShape(event: Record<string, unknown>): boolean {
  const keys = ["runtime_source", "runtime_digest", "lock_sha256", "node", "provider_adapter"];
  const present = keys.filter((key) => event[key] !== undefined);
  if (present.length === 0) return event["model_source"] === undefined;
  return present.length === keys.length && completeProvenance(event);
}

function requestedTransport(event: Record<string, unknown>): boolean {
  const diagnostic = ["configured_transport", "events_emitted", "phase", "error"]
    .filter((key) => event[key] !== undefined);
  return diagnostic.length === 0 && event["fallback_transport"] === undefined;
}

function transportError(value: unknown): boolean {
  if (!mapping(value) || !exactKeys(value, ["name", "message", "code"])) return false;
  const code = value["code"];
  return text(value["message"])
    && optionalText(value["name"])
    && (code === undefined || typeof code === "string" || typeof code === "number");
}

function diagnosticTransport(event: Record<string, unknown>): boolean {
  const configured = event["configured_transport"], fallback = event["fallback_transport"], error = event["error"];
  return (configured === "websocket" || configured === "sse")
    && (fallback === undefined || fallback === "websocket" || fallback === "sse")
    && typeof event["events_emitted"] === "boolean"
    && text(event["phase"])
    && transportError(error);
}

function providerTransportShape(event: Record<string, unknown>): boolean {
  const transport = event["transport"];
  if (transport !== "websocket" && transport !== "sse") return false;
  if (event["source"] === "requested") return requestedTransport(event);
  return event["source"] === "diagnostic" && diagnosticTransport(event);
}

function checkShape(event: Record<string, unknown>): boolean {
  if (typeof event["check"] !== "string" || !checks.has(event["check"])
      || !(integer(event["exit"]) || event["exit"] === null) || !relativePath(event["capture"])) return false;
  const executable = relativePath(event["file"]) && sha(event["sha256"]);
  const absent = event["file"] === undefined && event["sha256"] === undefined;
  return event["check"] === "gate" ? executable : absent;
}

function markCall(event: Record<string, unknown>): boolean {
  const decision = event["decision"];
  return integer(event["item"], 1)
    && text(event["evidence"])
    && (decision === "done" || decision === "skipped" && text(event["reason"]));
}

function continueCall(event: Record<string, unknown>): boolean {
  const decision = event["decision"];
  return (decision === "continue" || decision === "stop") && text(event["reason"]);
}

const ordinaryControlCalls: Record<string, (event: Record<string, unknown>) => boolean> = {
  refuse: (event) => event["decision"] === "refuse" && text(event["reason"]),
  fault: (event) => event["decision"] === "fault" && text(event["reason"]),
  continue: continueCall,
  select: (event) => text(event["decision"]) && text(event["reason"]),
  "clean-temp": (event) => event["decision"] === "clean" && event["reason"] === undefined,
};

function ordinaryControlCall(event: Record<string, unknown>): boolean {
  if (event["item"] !== undefined || event["evidence"] !== undefined) return false;
  return typeof event["tool"] === "string" && ordinaryControlCalls[event["tool"]]?.(event) === true;
}

function toolCallShape(event: Record<string, unknown>): boolean {
  const tool = event["tool"];
  if (typeof tool !== "string" || !tools.has(tool) || !text(event["decision"]) || !optionalText(event["reason"])) return false;
  return tool === "mark" ? markCall(event) : ordinaryControlCall(event);
}

function runCoreShape(event: Record<string, unknown>): boolean {
  return event["record"] === 1 && text(event["runtime"]) && text(event["run"])
    && text(event["assembly"]) && sha(event["assembly_hash"]) && requestShape(event["request"]);
}

function runWorkdirShape(event: Record<string, unknown>): boolean {
  return event["workdir"] === undefined || typeof event["workdir"] === "string" && isAbsolute(event["workdir"]);
}

function sourceIdentity(event: Record<string, unknown>): boolean {
  return event["runtime_source"] === undefined
    ? event["installation_id"] === undefined || installationId(event["installation_id"])
    : installationId(event["installation_id"]);
}

function runStartShape(event: Record<string, unknown>): boolean {
  return runCoreShape(event) && optionalText(event["flow"]) && optionalText(event["continued_from"])
    && (event["correlation"] === undefined || text(event["correlation"])
      && Buffer.byteLength(event["correlation"]) <= 256)
    && sourceIdentity(event)
    && runWorkdirShape(event) && provenanceShape(event);
}

type EventValidator = (event: Record<string, unknown>) => string | undefined;
const validators: Record<RecordEventName, EventValidator> = {
  run_start: (event) => runStartShape(event) ? undefined : "run_start requires its current writer fields",
  run_end: (event) => stageIdentity(event, true) !== undefined && terminalPair(event) && optionalText(event["reason"])
    ? undefined : "run_end requires a legal terminal pair and optional identity",
  stage_carried: (event) => text(event["from"]) && (event["output"] === undefined || hashedPath(event["output"]))
    ? undefined : "stage_carried has malformed provenance",
  stage_start: (event) => stageStartShape(event) ? undefined : "stage_start has malformed current writer fields",
  prompt: (event) => arrayOf(event["prompt"], promptSource) ? undefined : "prompt source has malformed current writer fields",
  stage_end: (event) => !terminalPair(event) ? "stage_end requires a legal terminal pair"
    : !outputGroup(event) ? "stage_end requires a complete output group"
      : optionalText(event["reason"]) ? undefined : "stage_end has a malformed reason",
  unreconciled: (event) => isoTimestamp(event["started"]) && isoTimestamp(event["stopped"])
    ? undefined : "unreconciled requires its time window",
  tmp_teardown: (event) => stageIdentity(event, true) !== undefined && text(event["reason"])
    ? undefined : "tmp_teardown requires its diagnostic and optional identity",
  turn: (event) => text(event["provider"]) && text(event["model"])
    && ["input", "output", "cache_read", "cache_write", "total"].every((key) => integer(event[key])) && text(event["stop"])
    ? undefined : "turn has malformed usage",
  provider_start: (event) => text(event["provider"]) && text(event["model"])
    ? undefined : "provider_start requires provider and model",
  provider_retry: (event) => integer(event["attempt"], 1) && integer(event["delay_ms"])
    ? undefined : "provider_retry has malformed attempt or delay",
  provider_transport: (event) => providerTransportShape(event) ? undefined : "provider_transport diagnostic has malformed current writer fields",
  gate_start: (event) => relativePath(event["file"]) && sha(event["sha256"])
    ? undefined : "gate_start has malformed executable identity",
  check: (event) => checkShape(event) ? undefined : "gate check file and hash relationship is malformed",
  tool_call: (event) => toolCallShape(event) ? undefined : "tool_call mark fields are malformed",
  tool_denied: (event) => text(event["tool"]) && text(event["boundary"]) ? undefined : "tool_denied requires tool and boundary",
  subflow_call: (event) => subflowShape(event) ? undefined : "subflow_call has malformed outcome",
  chose: (event) => text(event["chose"]) && arrayOf(event["declined"], text) && text(event["reason"])
    ? undefined : "chose has malformed selection",
  loop_done: (event) => integer(event["repeats"], 1) && typeof event["ended_by"] === "string"
    && new Set(["stop", "limit", "refused", "exhausted", "rejected", "blocked", "timeout", "fault"]).has(event["ended_by"]) && optionalText(event["reason"])
    ? undefined : "loop_done has malformed outcome",
  parallel_done: (event) => parallelShape(event) ? undefined : "parallel_done has malformed outcome",
  fanout_start: (event) => fanoutStartShape(event) ? undefined : "fanout_start has malformed plan",
  fanout_done: (event) => fanoutDoneShape(event) ? undefined : "fanout_done has malformed outcome",
  hook: (event) => typeof event["hook"] === "string" && hooks.has(event["hook"])
    && (integer(event["exit"]) || event["exit"] === null) && relativePath(event["capture"]) && sha(event["sha256"])
    ? undefined : "hook has malformed current writer fields",
  hash_drift: (event) => relativePath(event["file"]) && sha(event["expected"]) && sha(event["actual"])
    && event["expected"] !== event["actual"]
    ? undefined : "hash_drift has malformed hashes",
  signal: (event) => event["name"] === "SIGHUP" && event["signal"] === 1
    || event["name"] === "SIGINT" && event["signal"] === 2 || event["name"] === "SIGTERM" && event["signal"] === 15
    ? undefined : "signal has an unknown name and number pair",
};

/** Returns the first current shape-1 field rule this event violates. Unknown
 * fields are deliberately ignored. */
export function recordEventShape(event: Record<string, unknown>): string | undefined {
  const name = recordEventName(event["event"]);
  if (name === undefined) return "unknown event";
  if (!isoTimestamp(event["ts"])) return `${name} requires a strict ISO timestamp`;
  if (identityEvents.has(name) && stageIdentity(event) === undefined) return `${name} requires a legal stage identity`;
  return validators[name](event);
}

function providerFactKey(event: Record<string, unknown>): string | undefined {
  const identity = stageIdentity(event);
  return identity !== undefined && text(event["provider"]) && text(event["model"])
    ? `${identity}\u0000${event["provider"]}\u0000${event["model"]}`
    : undefined;
}

/** Checks writer-owned provider lifecycle agreement without making retained
 * record readability depend on a current writer detail. */
export function providerOperationStoryShape(events: readonly Record<string, unknown>[]): string | undefined {
  const pending = new Map<string, number>();
  for (const event of events) {
    if (event["event"] !== "provider_start" && event["event"] !== "turn") continue;
    const key = providerFactKey(event);
    if (key === undefined) return "provider operation has malformed identity";
    if (event["event"] === "provider_start") {
      pending.set(key, (pending.get(key) ?? 0) + 1);
      continue;
    }
    const starts = pending.get(key) ?? 0;
    if (starts === 0) return "turn has no preceding matching provider_start";
    pending.set(key, starts - 1);
  }
  return undefined;
}
