import { basename, isAbsolute, relative } from "node:path";
import { jsonObject } from "./check.ts";
import { nothing, result, type InspectionResult } from "./inspection.ts";
import { mapping } from "./model.ts";
import { visitHeldRunLines } from "./session-lines.ts";
import { settledSessionLineToolReader } from "./session-decoder.ts";
import type { SettledTool } from "./session.ts";
import { byteMagnitude, compactMagnitude, renderTable } from "./table.ts";
import { expandSlotPath } from "./tools.ts";

type TranscriptState = "readable" | "missing" | "unreadable";

interface Attempt {
  stage: string;
  repeat?: number;
  retry: number;
  started: number;
  ended?: number;
  session: string;
  provider?: string; model?: string;
  turns: Record<string, unknown>[];
  end?: Record<string, unknown>;
  slots: Record<string, string>; received: string[];
  calls: SettledTool[];
  transcript: TranscriptState;
  access?: Record<string, string[]>;
  denied: { tool: string; boundary: string }[];
}

const unavailable = (): InspectionResult => nothing("This run has no readable stage explanation.");

function sameIdentity(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return left["stage"] === right["stage"] && left["repeat"] === right["repeat"] && left["retry"] === right["retry"];
}

function stringMap(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (!mapping(value)) return undefined;
  const strings: Record<string, string> = {};
  for (const [name, held] of Object.entries(value)) {
    if (typeof held !== "string") return undefined;
    strings[name] = held;
  }
  return strings;
}

function accessPolicy(value: unknown): Record<string, string[]> | undefined {
  if (!mapping(value)) return undefined;
  const access: Record<string, string[]> = {};
  for (const [operation, entries] of Object.entries(value)) {
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) return undefined;
    access[operation] = entries.flatMap((entry) => typeof entry === "string" ? [entry] : []);
  }
  return access;
}

function receivedPaths(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths: string[] = [];
  for (const held of value) {
    if (!mapping(held) || typeof held["path"] !== "string") return undefined;
    paths.push(held["path"]);
  }
  return paths;
}

const usageFields = ["input", "cache_read", "cache_write", "output", "total"] as const;

interface AttemptIdentity { stage: string; repeat?: number; retry: number; session: string }

function attemptIdentity(start: Record<string, unknown>): AttemptIdentity | undefined {
  const stage = start["stage"], repeat = start["repeat"], retry = start["retry"], session = start["session"];
  if (typeof stage !== "string" || typeof retry !== "number" || typeof session !== "string") return undefined;
  if (repeat !== undefined && typeof repeat !== "number") return undefined;
  return { stage, ...(typeof repeat === "number" ? { repeat } : {}), retry, session };
}

function validEnd(end: Record<string, unknown> | undefined, began: number, stopped: number): end is Record<string, unknown> {
  return end !== undefined && Number.isFinite(stopped) && stopped >= began && typeof end["exit"] === "number"
    && typeof end["cause"] === "string" && mapping(end["output"])
    && typeof end["sealed"] === "boolean" && typeof end["judged"] === "boolean";
}

interface ModelIdentity { provider: string; model: string }

function turnModel(turns: Record<string, unknown>[]): ModelIdentity | undefined {
  const first = turns[0], provider = first?.["provider"], model = first?.["model"];
  if (typeof provider !== "string" || typeof model !== "string") return undefined;
  const valid = turns.every((turn) => turn["provider"] === provider && turn["model"] === model
    && usageFields.every((field) => typeof turn[field] === "number"));
  return valid ? { provider, model } : undefined;
}

function hasValidModel(turns: Record<string, unknown>[], model: ModelIdentity | undefined): boolean {
  return turns.length === 0 || model !== undefined;
}

function hasValidEnding(
  end: Record<string, unknown> | undefined, began: number, stopped: number, model: ModelIdentity | undefined,
): boolean {
  return end === undefined || (model !== undefined && validEnd(end, began, stopped));
}

interface StartFacts {
  identity: AttemptIdentity;
  began: number;
  slots: Record<string, string>;
  received: string[];
}

function startFacts(start: Record<string, unknown>): StartFacts | undefined {
  const identity = attemptIdentity(start);
  const began = typeof start["ts"] === "string" ? Date.parse(start["ts"]) : Number.NaN;
  const slots = stringMap(start["slots"]), received = receivedPaths(start["received"]);
  if (identity === undefined) return undefined;
  if (!Number.isFinite(began)) return undefined;
  if (slots === undefined) return undefined;
  if (received === undefined) return undefined;
  return { identity, began, slots, received };
}

function recordedAccess(start: Record<string, unknown>): Record<string, string[]> | null | undefined {
  if (start["access"] === undefined) return undefined;
  return accessPolicy(start["access"]) ?? null;
}

function attemptFrom(start: Record<string, unknown>, events: Record<string, unknown>[]): Attempt | undefined {
  const facts = startFacts(start);
  const end = events.find((event) => event["event"] === "stage_end" && sameIdentity(event, start));
  const stopped = typeof end?.["ts"] === "string" ? Date.parse(end["ts"]) : Number.NaN;
  const turns = events.filter((event) => event["event"] === "turn" && sameIdentity(event, start));
  const model = turnModel(turns);
  if (facts === undefined) return undefined;
  if (!hasValidModel(turns, model)) return undefined;
  if (!hasValidEnding(end, facts.began, stopped, model)) return undefined;
  const declaredAccess = recordedAccess(start);
  if (declaredAccess === null) return undefined;
  const denied = events.filter((event) => event["event"] === "tool_denied" && sameIdentity(event, start)
    && typeof event["tool"] === "string" && typeof event["boundary"] === "string")
    .map((event) => ({ tool: String(event["tool"]), boundary: String(event["boundary"]) }));
  return {
    ...facts.identity, started: facts.began, ...(end === undefined ? {} : { ended: stopped, end }), ...model,
    turns, slots: facts.slots, received: facts.received, calls: [], transcript: "unreadable", denied,
    ...(declaredAccess === undefined ? {} : { access: declaredAccess }),
  };
}

function sessionKey(attempt: Attempt): string {
  const repeat = attempt.repeat === undefined ? "-" : String(attempt.repeat);
  return `${String(attempt.session.length)}:${attempt.session}${String(attempt.stage.length)}:${attempt.stage}:${repeat}`;
}

function transcriptState(kind: string): TranscriptState {
  if (kind === "held") return "readable";
  return kind === "missing" ? "missing" : "unreadable";
}

async function readTools(directory: string, attempts: Attempt[]): Promise<void> {
  const groups = new Map<string, Attempt[]>();
  for (const attempt of attempts) groups.set(sessionKey(attempt), [...(groups.get(sessionKey(attempt)) ?? []), attempt]);
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;
    const calls = new Map<Attempt, SettledTool[]>();
    for (const attempt of group) calls.set(attempt, []);
    const read = settledSessionLineToolReader(first.stage, first.repeat);
    const held = await visitHeldRunLines(directory, first.session, (line) => {
      for (const call of read(line)) {
        const attempt = group.find((candidate) => call.settledAt >= candidate.started
          && (candidate.ended === undefined || call.settledAt <= candidate.ended));
        if (attempt !== undefined) calls.get(attempt)?.push(call);
      }
    });
    const transcript = transcriptState(held.kind);
    for (const attempt of group) {
      attempt.transcript = transcript;
      if (transcript === "readable") attempt.calls = calls.get(attempt) ?? [];
    }
  }
}

function sum(attempt: Attempt, field: string): number {
  return attempt.turns.reduce((total, turn) => total + (typeof turn[field] === "number" ? turn[field] : 0), 0);
}

function tokens(attempt: Attempt): Record<string, number> {
  return {
    freshInput: sum(attempt, "input"), cacheRead: sum(attempt, "cache_read"),
    cacheWrite: sum(attempt, "cache_write"), output: sum(attempt, "output"),
    recordedTotal: sum(attempt, "total"),
    largestTurnTotal: Math.max(...attempt.turns.map((turn) => typeof turn["total"] === "number" ? turn["total"] : 0)),
  };
}

function toolFacts(calls: SettledTool[]): Record<string, unknown> {
  const byName: Record<string, number> = {};
  const targets = new Map<string, { tool: string; target: string; count: number; order: number }>();
  calls.forEach((call, order) => {
    byName[call.name] = (byName[call.name] ?? 0) + 1;
    if (call.target === undefined) return;
    const key = `${String(call.name.length)}:${call.name}${call.target}`;
    const held = targets.get(key);
    if (held === undefined) targets.set(key, { tool: call.name, target: call.target, count: 1, order });
    else held.count += 1;
  });
  const largestResults = calls.map((call, order) => ({ call, order })).sort((a, b) => b.call.resultBytes - a.call.resultBytes || a.order - b.order)
    .slice(0, 5).map(({ call }) => ({ tool: call.name, ...(call.target === undefined ? {} : { target: call.target }), bytes: call.resultBytes }));
  const repeatedTargets = [...targets.values()].filter(({ count }) => count > 1).sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, 5).map(({ tool, target, count }) => ({ tool, target, count }));
  return {
    settled: calls.length, failures: calls.filter(({ failed }) => failed).length, byName,
    resultBytes: calls.reduce((total, call) => total + call.resultBytes, 0), largestResults, repeatedTargets,
  };
}

function atOrBelow(root: string, target: string): boolean {
  const held = relative(root, target);
  return held === "" || (!held.startsWith("..") && !isAbsolute(held));
}

interface PathGroups { receivedInputs: string[]; skills: string[]; slots: string[]; outside: string[] }
interface CommandReferences {
  receivedInputs: string[]; skills: string[]; slots: string[]; outsideCommandScope: string[];
}
interface PathFacts extends PathGroups { commandReferences?: CommandReferences }

function groupedPaths(attempt: Attempt, paths: string[]): PathGroups {
  const grouped: PathGroups = { receivedInputs: [], skills: [], slots: [], outside: [] };
  const input = attempt.slots["input"], skills = attempt.slots["skills"];
  const otherSlots = Object.entries(attempt.slots).filter(([name]) => name !== "input" && name !== "skills").map(([, path]) => path);
  for (const path of paths) {
    if (attempt.received.includes(path) || (input !== undefined && atOrBelow(input, path))) grouped.receivedInputs.push(path);
    else if (skills !== undefined && atOrBelow(skills, path)) grouped.skills.push(path);
    else if (otherSlots.some((root) => atOrBelow(root, path))) grouped.slots.push(path);
    else grouped.outside.push(path);
  }
  return grouped;
}

function commandPaths(command: string): string[] {
  const argument = /(?:^|[\s,;()])(?:"(\/[^"\r\n]*)"|'(\/[^'\r\n]*)'|(\/[^\s,;()]*))/gu;
  return [...command.matchAll(argument)].map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter((path, at, all) => path.length > 0 && all.indexOf(path) === at);
}

function pathFacts(attempt: Attempt): PathFacts {
  const slotValues = Object.fromEntries(Object.entries(attempt.slots).map(([name, path]) => [name.toUpperCase(), path]));
  const paths = attempt.calls.filter((call) => ["read", "write", "edit"].includes(call.name) && call.target !== undefined)
    .map((call) => expandSlotPath(call.target ?? "", slotValues)).filter((path, at, all) => all.indexOf(path) === at);
  const grouped = groupedPaths(attempt, paths);
  const references = attempt.calls.filter((call) => call.name === "bash" && call.target !== undefined)
    .flatMap((call) => commandPaths(call.target ?? "")).filter((path, at, all) => all.indexOf(path) === at);
  if (references.length === 0) return grouped;
  const commandGroups = groupedPaths(attempt, references);
  return { ...grouped, commandReferences: {
    receivedInputs: commandGroups.receivedInputs, skills: commandGroups.skills, slots: commandGroups.slots,
    outsideCommandScope: commandGroups.outside,
  } };
}

function recordedModel(attempt: Attempt): Record<string, unknown> {
  return attempt.provider === undefined ? {} : { provider: attempt.provider, model: attempt.model };
}

function recordedUsage(attempt: Attempt): Record<string, unknown> {
  return attempt.turns.length === 0 ? { turns: 0 } : { turns: attempt.turns.length, tokens: tokens(attempt) };
}

function recordedEnding(attempt: Attempt): Record<string, unknown> {
  if (attempt.end === undefined) return { outcome: null };
  return {
    outcome: { exit: attempt.end["exit"], cause: attempt.end["cause"] }, output: attempt.end["output"],
    sealed: attempt.end["sealed"], judged: attempt.end["judged"],
  };
}

function transcriptFacts(attempt: Attempt): Record<string, unknown> {
  const status = attempt.end === undefined || attempt.transcript !== "readable" ? { transcript: attempt.transcript } : {};
  return attempt.transcript === "readable"
    ? { ...status, tools: toolFacts(attempt.calls), paths: pathFacts(attempt) }
    : status;
}

function deniedCalls(attempt: Attempt): Record<string, unknown> {
  const byTool: Record<string, number> = {}, byBoundary: Record<string, number> = {};
  for (const denial of attempt.denied) {
    byTool[denial.tool] = (byTool[denial.tool] ?? 0) + 1;
    byBoundary[denial.boundary] = (byBoundary[denial.boundary] ?? 0) + 1;
  }
  return { total: attempt.denied.length, byTool, byBoundary };
}

function documentRow(attempt: Attempt): Record<string, unknown> {
  return {
    stage: attempt.stage, ...(attempt.repeat === undefined ? {} : { repeat: attempt.repeat }), retry: attempt.retry,
    ...recordedEnding(attempt), ...recordedModel(attempt), ...recordedUsage(attempt), ...transcriptFacts(attempt),
    ...(attempt.access === undefined ? {} : { access: attempt.access, deniedCalls: deniedCalls(attempt) }),
  };
}

function tokenLines(attempt: Attempt): string[] {
  const spend = tokens(attempt);
  return renderTable([{ label: "token measure" }, { label: "tokens", align: "right" }], [
    ["fresh input", compactMagnitude(spend["freshInput"] ?? 0)], ["cache read", compactMagnitude(spend["cacheRead"] ?? 0)],
    ["cache write", compactMagnitude(spend["cacheWrite"] ?? 0)], ["output", compactMagnitude(spend["output"] ?? 0)],
    ["recorded total", compactMagnitude(spend["recordedTotal"] ?? 0)], ["largest turn", compactMagnitude(spend["largestTurnTotal"] ?? 0)],
  ]);
}

function detailLines(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const held of value) {
    if (!mapping(held) || typeof held["tool"] !== "string") continue;
    const amount = typeof held["bytes"] === "number" ? held["bytes"] : held["count"];
    const target = typeof held["target"] === "string" ? held["target"] : "-";
    if (typeof amount === "number") lines.push(`${label}  ${held["tool"]}  ${String(amount)}  ${target}`);
  }
  return lines;
}

function renderedPaths(paths: PathFacts): string[] {
  const accessed = ([
    ["receivedInputs", paths.receivedInputs], ["skills", paths.skills],
    ["slots", paths.slots], ["outside", paths.outside],
  ] as const).flatMap(([group, held]) => held.map((path) => `${group}  ${path}`));
  const references = paths.commandReferences;
  if (references === undefined) return accessed;
  return [...accessed, ...([
    ["receivedInputs", references.receivedInputs], ["skills", references.skills], ["slots", references.slots],
  ] as const).flatMap(([group, held]) => held.map((path) => `command reference  ${group}  ${path}`)),
  ...references.outsideCommandScope.map((path) => `outside-command-scope  ${path}`)];
}

function attemptLines(attempt: Attempt): string[] {
  const identity = `${attempt.stage}${attempt.repeat === undefined ? "" : `#${String(attempt.repeat)}`}/${String(attempt.retry)}`;
  const lines = attempt.turns.length === 0 ? [] : ["", `${identity} tokens`, ...tokenLines(attempt)];
  if (attempt.transcript !== "readable") return [...lines, "", `${identity} transcript  ${attempt.transcript}`];
  const tools = toolFacts(attempt.calls), paths = pathFacts(attempt), names = tools["byName"];
  const resultBytes = typeof tools["resultBytes"] === "number" ? tools["resultBytes"] : 0;
  return [
    ...lines, ...(lines.length === 0 ? [""] : []),
    `tools  settled ${String(tools["settled"])}  failures ${String(tools["failures"])}  result bytes ${byteMagnitude(resultBytes)}`,
    ...(mapping(names) ? [`by name  ${Object.entries(names).map(([name, count]) => `${name} ${String(count)}`).join(", ") || "-"}`] : []),
    ...detailLines(tools["largestResults"], "largest result"), ...detailLines(tools["repeatedTargets"], "repeated target"),
    ...renderedPaths(paths),
  ];
}

function humanRows(attempts: Attempt[]): string[] {
  const rows = renderTable(
    [{ label: "stage" }, { label: "repeat" }, { label: "retry" }, { label: "outcome" }, { label: "model" }, { label: "turns", align: "right" }],
    attempts.map((attempt) => [attempt.stage, attempt.repeat === undefined ? "-" : String(attempt.repeat), String(attempt.retry),
      attempt.end === undefined ? "no terminal stage outcome recorded" : `${String(attempt.end["exit"])} / ${String(attempt.end["cause"])}`,
      attempt.provider === undefined ? "no model" : `${attempt.provider}/${String(attempt.model)}`, String(attempt.turns.length)]),
  );
  return [...rows, ...attempts.flatMap(attemptLines)];
}

/** Join completed and interrupted stage attempts to their streamed settled tool work. */
export async function explainRun(directory: string, events: Record<string, unknown>[], stage: string | undefined, json: boolean): Promise<InspectionResult> {
  const starts = events.filter((event) => event["event"] === "stage_start" && (stage === undefined || event["stage"] === stage));
  if (starts.length === 0) return stage === undefined ? unavailable() : nothing(`This run has no stage named ${stage}.`);
  const attempts = starts.map((start) => attemptFrom(start, events));
  if (attempts.some((attempt) => attempt === undefined)) return unavailable();
  const readable = attempts.filter((attempt) => attempt !== undefined);
  await readTools(directory, readable);
  return result(json
    ? [jsonObject({ schemaVersion: 1, run: basename(directory), stages: readable.map(documentRow) })]
    : humanRows(readable));
}
