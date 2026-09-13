import { stat } from "node:fs/promises";
import { join } from "node:path";
import { jsonObject } from "./check.ts";
import { readRunState, runNames } from "./inspection.ts";
import { bytewise, errorCode, mapping, plainly } from "./model.ts";
import { hashBytes } from "./record.ts";
import type { RunStateFact } from "./run-state.ts";
import { jsonValue } from "./schema-check.ts";
import { isRunListState, RUN_LIST_CONTRACT, type CliFailure, type RunListField, type RunListQuery, type RunListState } from "./run-list-query.ts";
import { CAUSES } from "./spine.ts";
import { compactMagnitude, elapsedAge } from "./table.ts";
import { boundedText as bounded, inertText as inert, newCommandFailure, type CommandResult } from "./new-command-result.ts";

interface RunSummary {
  id: string; assembly: string | null; flow: string | null; startedAt: string | null; endedAt: string | null; duration: number | null;
  state: RunListState; exit: number | null; cause: string | null; tokens: number | null;
}

interface Warning { id: string; code: string; diagnostic: string }
interface SemanticFilters { assemblies: string[]; flows: string[]; states: RunListState[]; causes: string[]; since?: number; until?: number }
interface CursorData { version: 1; homeHash: string; through: string; after: string; membership: string; filters: SemanticFilters }
interface Selection { through: string | null; candidates: string[]; stableNames: string[]; filters: SemanticFilters }
interface Scan { rows: RunSummary[]; warnings: Warning[]; matched: number; warningCount: number; examined?: string }
export type RunListResult = CommandResult;

function failure(code: CliFailure["code"], cause: string, message: string, exit: CliFailure["exit"], retryable: boolean, details: Record<string, unknown> = {}): CliFailure {
  return { code, cause, message, retryable, details, exit };
}

function warning(id: string, code: string, diagnostic: string): Warning {
  return { id, code, diagnostic: bounded(plainly(diagnostic).replace(/[\r\n]/gu, " "), RUN_LIST_CONTRACT.warnings.diagnosticBytes) };
}

function boundedFact(fact: RunStateFact): { summary: RunSummary; warnings: Warning[] } {
  const state = isRunListState(fact.state) ? fact.state : "invalid";
  const summary: RunSummary = { id: fact.id, assembly: fact.assembly, flow: fact.flow, startedAt: fact.startedAt,
    endedAt: fact.endedAt, duration: fact.duration,
    state, exit: fact.exit, cause: fact.cause, tokens: fact.tokens };
  const textFields = ["assembly", "flow", "startedAt", "endedAt", "cause"] as const;
  const tooLarge = textFields.filter((name) => summary[name] !== null
    && Buffer.byteLength(summary[name] ?? "") > RUN_LIST_CONTRACT.output.summaryTextBytes);
  for (const name of tooLarge) summary[name] = null;
  const warnings: Warning[] = [];
  if (fact.says !== undefined) warnings.push(warning(fact.id, state, fact.says));
  if (tooLarge.length > 0) {
    warnings.push(warning(fact.id, "summary-field-too-large", `Summary fields exceed 1,024 bytes: ${tooLarge.join(", ")}.`));
  }
  return { summary, warnings };
}

async function readSummary(home: string, id: string, withTokens: boolean): Promise<{ summary?: RunSummary; warnings: Warning[] }> {
  const fact = await readRunState(home, id, withTokens);
  return fact === undefined ? { warnings: [] } : boundedFact(fact);
}

function semantic(query: RunListQuery): SemanticFilters {
  return { assemblies: query.assemblies, flows: query.flows, states: query.states, causes: query.causes,
    ...(query.since === undefined ? {} : { since: query.since }), ...(query.until === undefined ? {} : { until: query.until }) };
}

function membership(names: readonly string[]): string {
  return hashBytes(Buffer.from(names.join("\0")));
}

function cursorText(cursor: CursorData): string | undefined {
  const decoded = Buffer.from(jsonObject(cursor));
  const encoded = decoded.toString("base64url");
  return decoded.length <= RUN_LIST_CONTRACT.cursor.decodedBytes && encoded.length <= RUN_LIST_CONTRACT.cursor.encodedBytes
    ? encoded : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const held = value.filter((item) => typeof item === "string");
  return held.length === value.length ? held : undefined;
}

function states(value: unknown): RunListState[] | undefined {
  const held = strings(value);
  if (held === undefined || held.some((state) => !isRunListState(state))) return undefined;
  return held.filter(isRunListState);
}

function cursorLists(value: Record<string, unknown>): Pick<SemanticFilters, "assemblies" | "flows" | "states" | "causes"> | undefined {
  const assemblies = strings(value["assemblies"]), flows = strings(value["flows"]);
  const heldStates = states(value["states"]), causes = strings(value["causes"]);
  return assemblies === undefined || flows === undefined || heldStates === undefined || causes === undefined
    ? undefined : { assemblies, flows, states: heldStates, causes };
}

function cursorBounds(value: Record<string, unknown>): Bounds | undefined {
  const since = value["since"], until = value["until"];
  if (since !== undefined && typeof since !== "number") return undefined;
  if (until !== undefined && typeof until !== "number") return undefined;
  return { ...(typeof since === "number" ? { since } : {}), ...(typeof until === "number" ? { until } : {}) };
}

interface Bounds { since?: number; until?: number }

function exactKeys(value: Record<string, unknown>, names: readonly string[]): boolean {
  const actual = Object.keys(value).sort(bytewise);
  return actual.length === names.length && actual.every((name, index) => name === [...names].sort(bytewise)[index]);
}

function cursorFilters(value: unknown): SemanticFilters | undefined {
  if (!mapping(value)) return undefined;
  const allowed = ["assemblies", "flows", "states", "causes", ...(value["since"] === undefined ? [] : ["since"]), ...(value["until"] === undefined ? [] : ["until"])];
  if (!exactKeys(value, allowed)) return undefined;
  const lists = cursorLists(value), bounds = cursorBounds(value);
  return lists === undefined || bounds === undefined ? undefined : { ...lists, ...bounds };
}

const MINIMUM_TIME = Date.parse("0100-01-01T00:00:00.000Z");
const MAXIMUM_TIME = Date.parse("9999-12-31T23:59:59.999Z");

function normalizedList(values: readonly string[]): boolean {
  const normalized = [...new Set(values)].sort(bytewise);
  return normalized.length === values.length && normalized.every((value, index) => value === values[index]);
}

function validTimes(filters: SemanticFilters): boolean {
  const times = [filters.since, filters.until].filter((value): value is number => value !== undefined);
  return times.every((value) => Number.isSafeInteger(value) && value >= MINIMUM_TIME && value <= MAXIMUM_TIME)
    && (filters.since === undefined || filters.until === undefined || filters.since <= filters.until);
}

function semanticCursor(held: CursorStrings, filters: SemanticFilters): boolean {
  const lists = [filters.assemblies, filters.flows, filters.states, filters.causes];
  const values = lists.flat();
  return [held.homeHash, held.membership].every((value) => /^[a-f0-9]{64}$/u.test(value))
    && lists.every(normalizedList)
    && filters.states.every(isRunListState)
    && filters.causes.every((cause) => CAUSES.some((known) => known === cause))
    && values.length <= RUN_LIST_CONTRACT.filters.values
    && values.reduce((bytes, value) => bytes + Buffer.byteLength(value), 0) <= RUN_LIST_CONTRACT.filters.bytes
    && [...filters.assemblies, ...filters.flows].every((value) => !/[\u0000-\u001F\u007F-\u009F]/u.test(value))
    && validTimes(filters);
}

interface CursorStrings { homeHash: string; through: string; after: string; membership: string }

function cursorStrings(value: Record<string, unknown>): CursorStrings | undefined {
  const held = [value["homeHash"], value["through"], value["after"], value["membership"]];
  if (!held.every((field) => typeof field === "string")) return undefined;
  return { homeHash: String(held[0]), through: String(held[1]), after: String(held[2]), membership: String(held[3]) };
}

function cursorBytes(raw: string): Buffer | undefined {
  if (raw.length > RUN_LIST_CONTRACT.cursor.encodedBytes || !/^[A-Za-z0-9_-]+$/u.test(raw)) return undefined;
  const bytes = Buffer.from(raw, "base64url");
  return bytes.length > RUN_LIST_CONTRACT.cursor.decodedBytes ? undefined : bytes;
}

function cursor(raw: string): CursorData | undefined {
  const bytes = cursorBytes(raw);
  if (bytes === undefined) return undefined;
  const parsed = jsonValue(bytes);
  if ("error" in parsed || !mapping(parsed.value)) return undefined;
  const value = parsed.value;
  if (!exactKeys(value, ["version", "homeHash", "through", "after", "membership", "filters"]) || value["version"] !== 1) return undefined;
  const held = cursorStrings(value), filters = cursorFilters(value["filters"]);
  if (held === undefined || filters === undefined || !semanticCursor(held, filters)) return undefined;
  const decoded: CursorData = { version: 1, homeHash: held.homeHash, through: held.through, after: held.after, membership: held.membership, filters };
  return cursorText(decoded) === raw ? decoded : undefined;
}

function sameFilters(first: SemanticFilters, second: SemanticFilters): boolean {
  return jsonObject(first) === jsonObject(second);
}

function oneOf(values: readonly string[], value: string | null): boolean {
  return values.length === 0 || value !== null && values.includes(value);
}

function withinTime(summary: RunSummary, query: RunListQuery): boolean {
  const started = summary.startedAt === null ? undefined : Date.parse(summary.startedAt);
  if (query.since !== undefined && (started === undefined || started < query.since)) return false;
  return query.until === undefined || started !== undefined && started <= query.until;
}

function matches(summary: RunSummary, query: RunListQuery): boolean {
  return oneOf(query.assemblies, summary.assembly) && oneOf(query.flows, summary.flow)
    && (query.states.length === 0 || query.states.includes(summary.state))
    && oneOf(query.causes, summary.cause) && withinTime(summary, query);
}

function project(summary: RunSummary, fields: readonly RunListField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((name) => [name, summary[name]]));
}

function humanValue(summary: RunSummary, field: RunListField, now: string): string {
  const value = summary[field];
  if (value === null) return "-";
  if (field === "startedAt" || field === "endedAt") return elapsedAge(String(value), now);
  if (field === "duration") return `${String(value)}ms`;
  if (field === "tokens") return compactMagnitude(Number(value));
  return String(value);
}

function cellWarnings(summary: RunSummary, fields: readonly RunListField[], now: string): Warning[] {
  return fields.flatMap((field) => {
    const omitted = inert(humanValue(summary, field, now), RUN_LIST_CONTRACT.output.cellBytes).omitted;
    return omitted === 0 ? [] : [warning(summary.id, "cell-truncated", `Run ${summary.id} field ${field} omits ${String(omitted)} escaped bytes.`)];
  });
}

function markdown(rows: readonly RunSummary[], fields: readonly RunListField[], now: string): Buffer {
  if (rows.length === 0) return Buffer.from("No runs match.\n");
  const heading = `| ${fields.join(" | ")} |`, rule = `| ${fields.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${fields.map((field) => inert(humanValue(row, field, now), RUN_LIST_CONTRACT.output.cellBytes).text).join(" | ")} |`);
  return Buffer.from(`${[heading, rule, ...body].join("\n")}\n`);
}

function errorResult(held: CliFailure, json: boolean): RunListResult {
  return newCommandFailure("run.list", held, json);
}

export function runListFailure(held: CliFailure, json: boolean): RunListResult {
  return errorResult(held, json);
}

function selected(home: string, query: RunListQuery, descending: string[]): Selection | CliFailure {
  const filters = semantic(query), resumed = query.after === undefined ? undefined : cursor(query.after);
  if (query.after !== undefined && resumed === undefined) return failure("cursor-invalid", "cursor-malformed", "Run list received an invalid cursor.", 2, false);
  const through = resumed?.through ?? descending[0] ?? null;
  const stableNames = descending.filter((name) => through !== null && bytewise(name, through) <= 0);
  if (resumed === undefined) return { through, candidates: stableNames, stableNames, filters };
  return resumedSelection(home, filters, stableNames, resumed.through, resumed);
}

function resumedSelection(home: string, filters: SemanticFilters, stableNames: string[], through: string, resumed: CursorData): Selection | CliFailure {
  if (resumed.homeHash !== hashBytes(Buffer.from(home)) || !sameFilters(resumed.filters, filters) || membership(stableNames) !== resumed.membership) {
    return failure("cursor-conflict", "membership-changed", "Run list cursor no longer matches this home and filter set.", 3, false);
  }
  const at = stableNames.indexOf(resumed.after);
  return at < 0 ? failure("cursor-conflict", "membership-changed", "Run list cursor no longer names its prior position.", 3, false)
    : { through, candidates: stableNames.slice(at + 1), stableNames, filters };
}

function isFailure(value: Selection | CliFailure): value is CliFailure {
  return "code" in value;
}

async function scan(home: string, query: RunListQuery, names: readonly string[], now: string): Promise<Scan> {
  const rows: RunSummary[] = [], warnings: Warning[] = [];
  let matched = 0, warningCount = 0;
  let examined: string | undefined;
  for (const name of names) {
    const one = await readSummary(home, name, !query.count);
    examined = name;
    if (one.summary === undefined || !matches(one.summary, query)) continue;
    matched += 1;
    if (!query.count) rows.push(one.summary);
    const foundWarnings = [...one.warnings, ...cellWarnings(one.summary, query.fields, now)];
    warningCount += foundWarnings.length;
    for (const found of foundWarnings) if (warnings.length < RUN_LIST_CONTRACT.warnings.count) warnings.push(found);
    if (!query.count && matched >= query.limit) break;
  }
  return { rows, warnings, matched, warningCount, ...(examined === undefined ? {} : { examined }) };
}

function summary(returned: number, matched: number | null, scanned: Scan): Record<string, unknown> {
  return { returned, matched, warningCount: scanned.warningCount, warningsOmitted: scanned.warningCount - scanned.warnings.length };
}

function countResult(query: RunListQuery, selection: Selection, scanned: Scan): RunListResult {
  if (!query.json) return { exit: 0, stdout: Buffer.from(`${String(scanned.matched)} runs match.\n`), stderr: warningOutput(scanned) };
  const document = { schemaVersion: RUN_LIST_CONTRACT.result.schemaVersion, kind: RUN_LIST_CONTRACT.result.kind, data: [],
    page: { limit: 0, next: null, through: selection.through, complete: true },
    summary: summary(0, scanned.matched, scanned), warnings: scanned.warnings };
  return { exit: 0, stdout: Buffer.from(`${jsonObject(document)}\n`), stderr: Buffer.alloc(0) };
}

function pageResult(home: string, query: RunListQuery, now: string, selection: Selection, scanned: Scan): RunListResult {
  const complete = scanned.examined === undefined || selection.candidates.indexOf(scanned.examined) === selection.candidates.length - 1;
  const next = complete || selection.through === null || scanned.examined === undefined ? null : cursorText({
    version: 1, homeHash: hashBytes(Buffer.from(home)), through: selection.through, after: scanned.examined,
    membership: membership(selection.stableNames), filters: selection.filters,
  });
  if (next === undefined) return errorResult(failure("integrity-failed", "cursor-limit", "Run list could not encode a bounded continuation cursor.", 5, false), query.json);
  const document = { schemaVersion: RUN_LIST_CONTRACT.result.schemaVersion, kind: RUN_LIST_CONTRACT.result.kind,
    data: scanned.rows.map((row) => project(row, query.fields)),
    page: { limit: query.limit, next, through: selection.through, complete },
    summary: summary(scanned.rows.length, null, scanned), warnings: scanned.warnings };
  const notice = next === null ? [] : [`More runs remain. Continue with --after ${next}.`];
  if (query.json) return { exit: 0, stdout: Buffer.from(`${jsonObject(document)}\n`), stderr: Buffer.alloc(0) };
  const warningLines = warningOutput(scanned).toString("utf8").trimEnd().split("\n").filter((line) => line.length > 0);
  const stderr = [...warningLines, ...notice];
  return { exit: 0, stdout: markdown(scanned.rows, query.fields, now), stderr: Buffer.from(stderr.length === 0 ? "" : `${stderr.join("\n")}\n`) };
}

function warningOutput(scanned: Scan): Buffer {
  const lines = scanned.warnings.map((held) => inert(`${held.id}: ${held.code}: ${held.diagnostic}`, RUN_LIST_CONTRACT.warnings.lineBytes).text);
  if (scanned.warningCount > scanned.warnings.length) lines.push(`${String(scanned.warningCount - scanned.warnings.length)} warnings omitted.`);
  return Buffer.from(lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

interface PathKind { kind: "directory" | "other" | "missing" | "error"; cause?: string }

async function pathKind(path: string): Promise<PathKind> {
  return stat(path).then(
    (held) => ({ kind: held.isDirectory() ? "directory" : "other" }),
    (reason: unknown) => errorCode(reason) === "ENOENT" ? { kind: "missing" } : { kind: "error", cause: errorCode(reason) ?? "filesystem-error" },
  );
}

async function homeFault(home: string): Promise<CliFailure | undefined> {
  const root = await pathKind(home);
  if (root.kind === "missing") return failure("home-not-found", "path-missing", `There is no bot home at ${home}.`, 1, false, { home });
  if (root.kind === "other") return failure("home-invalid", "path-not-directory", `The bot home at ${home} is not a directory.`, 1, false, { home });
  if (root.kind === "error") return failure("dependency-failed", root.cause ?? "filesystem-error", "Run list could not inspect the Bot home.", 4, true);
  const runs = await pathKind(join(home, "runs"));
  if (runs.kind === "directory" || runs.kind === "missing") return undefined;
  return failure("dependency-failed", runs.cause ?? "path-not-directory", "Run list could not inspect the runs directory.", 4, runs.kind === "error");
}

async function inspected(home: string, query: RunListQuery, now: string): Promise<RunListResult> {
  const unavailable = await homeFault(home);
  if (unavailable !== undefined) return errorResult(unavailable, query.json);
  const descending = [...await runNames(home)].sort((first, second) => bytewise(second, first));
  const selection = selected(home, query, descending);
  if (isFailure(selection)) return errorResult(selection, query.json);
  const scanned = await scan(home, query, selection.candidates, now);
  return query.count ? countResult(query, selection, scanned) : pageResult(home, query, now, selection, scanned);
}

export async function inspectRunList(home: string, query: RunListQuery, now: string): Promise<RunListResult> {
  return inspected(home, query, now).then(
    (result) => result,
    (reason: unknown) => errorResult(failure("dependency-failed", errorCode(reason) ?? "filesystem-error", "Run list could not read the Bot home.", 4, true), query.json),
  );
}
