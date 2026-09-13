import { bytewise } from "./model.ts";
import { CAUSES } from "./spine.ts";

export const RUN_LIST_CONTRACT = {
  operation: "run.list", result: { kind: "bot.run.list", schemaVersion: 1 },
  fields: ["id", "assembly", "flow", "startedAt", "endedAt", "duration", "state", "exit", "cause", "tokens"],
  states: ["ended", "running", "crashed", "incomplete", "invalid", "no-record", "bad-record", "bad-version", "unreadable"],
  causes: CAUSES,
  page: { minimum: 1, default: 20, maximum: 200 },
  filters: { values: 64, bytes: 2_048 },
  cursor: { encodedBytes: 8_192, decodedBytes: 6_144 },
  warnings: { count: 20, diagnosticBytes: 512, lineBytes: 1_024 },
  output: { summaryTextBytes: 1_024, cellBytes: 480, rowBytes: 4_096, pageBytesExclusive: 1_048_576 },
} as const;

export type RunListField = (typeof RUN_LIST_CONTRACT.fields)[number];
export type RunListState = (typeof RUN_LIST_CONTRACT.states)[number];

export interface RunListQuery {
  assemblies: string[]; flows: string[]; states: RunListState[]; causes: string[];
  fields: RunListField[]; json: boolean; count: boolean; limit: number;
  since?: number; until?: number; after?: string;
}

export interface CliFailure {
  code: "request-invalid" | "cursor-invalid" | "cursor-conflict" | "home-not-found" | "home-invalid" | "state-not-reached" | "dependency-failed" | "integrity-failed";
  cause: string; message: string; retryable: boolean; details: Record<string, unknown>; exit: 1 | 2 | 3 | 4 | 5;
}

export type RunListParse = { query: RunListQuery } | { failure: CliFailure };
interface OptionValue { value?: string; failure?: CliFailure }
interface Values { assemblies: string[]; flows: string[]; states: RunListState[]; causes: string[] }
interface Bounds { since?: number; until?: number }
interface Controls { fields: RunListField[]; limit: number; count: boolean; json: boolean; after?: string }

function invalid(cause: string, message: string, details: Record<string, unknown> = {}): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details, exit: 2 };
}

function timestamp(raw: string): number | undefined {
  const found = /^(\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.exec(raw);
  if (found === null || Number(found[1]) < 100) return undefined;
  const value = Date.parse(raw);
  return Number.isFinite(value) && new Date(value).toISOString() === raw ? value : undefined;
}

function optionValues(args: readonly string[], name: string): { values: string[]; missing: boolean } {
  const values: string[] = [];
  let missing = false;
  for (let at = 0; at < args.length; at += 1) {
    if (args[at] !== name) continue;
    const value = args[at + 1];
    if (value === undefined || value.startsWith("-")) missing = true;
    else values.push(value);
  }
  return { values, missing };
}

function singleton(args: readonly string[], name: string): OptionValue {
  const held = optionValues(args, name);
  if (held.missing) return { failure: invalid("value-missing", `Run list requires a value after ${name}.`, { option: name }) };
  if (held.values.length > 1) return { failure: invalid("option-repeated", `Run list accepts ${name} once.`, { option: name }) };
  return held.values[0] === undefined ? {} : { value: held.values[0] };
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values)].sort(bytewise);
}

function isField(value: string): value is RunListField {
  return RUN_LIST_CONTRACT.fields.some((field) => field === value);
}

export function isRunListState(value: string): value is RunListState {
  return RUN_LIST_CONTRACT.states.some((state) => state === value);
}

function isCause(value: string): boolean {
  return CAUSES.some((cause) => cause === value);
}

function parseFields(raw: string | undefined): { fields: RunListField[] } | { failure: CliFailure } {
  if (raw === undefined) return { fields: [...RUN_LIST_CONTRACT.fields] };
  const values = raw.split(",");
  if (values.some((value) => value.length === 0)) return { failure: invalid("field-empty", "Run list fields must not be empty.") };
  if (new Set(values).size !== values.length) return { failure: invalid("field-repeated", "Run list fields must not repeat.") };
  const unknown = values.find((value) => !isField(value));
  if (unknown !== undefined) return { failure: invalid("field-unknown", `Run list has no field named ${unknown}.`, { field: unknown }) };
  return { fields: values.filter(isField) };
}

function consumedIndexes(args: readonly string[], valued: readonly string[]): Set<number> {
  const consumed = new Set<number>();
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? "";
    if (["--json", "-j", "--count"].includes(word)) consumed.add(at);
    if (valued.includes(word)) { consumed.add(at); if (args[at + 1]?.startsWith("-") === false) consumed.add(at + 1); }
  }
  return consumed;
}

function syntaxFailure(args: readonly string[], valued: readonly string[]): CliFailure | undefined {
  const consumed = consumedIndexes(args, valued);
  const unknown = args.find((_, at) => !consumed.has(at));
  if (unknown !== undefined) return invalid("argument-unknown", `Run list does not accept ${unknown}.`, { argument: unknown });
  if (args.filter((word) => word === "--json" || word === "-j").length > 1) return invalid("option-repeated", "Run list accepts one JSON mode flag.", { option: "--json" });
  if (args.filter((word) => word === "--count").length > 1) return invalid("option-repeated", "Run list accepts --count once.", { option: "--count" });
  return ["--assembly", "--flow", "--state", "--cause"].map((name) => ({ name, held: optionValues(args, name) }))
    .filter(({ held }) => held.missing).map(({ name }) => invalid("value-missing", `Run list requires a value after ${name}.`, { option: name }))[0];
}

function parsedValues(args: readonly string[]): { values: Values } | { failure: CliFailure } {
  const states = normalized(optionValues(args, "--state").values);
  const badState = states.find((value) => !isRunListState(value));
  if (badState !== undefined) return { failure: invalid("state-unknown", `Run list has no state named ${badState}.`, { state: badState }) };
  const causes = normalized(optionValues(args, "--cause").values);
  const badCause = causes.find((value) => !isCause(value));
  if (badCause !== undefined) return { failure: invalid("cause-unknown", `Run list has no cause named ${badCause}.`, { cause: badCause }) };
  const values = {
    assemblies: normalized(optionValues(args, "--assembly").values), flows: normalized(optionValues(args, "--flow").values),
    states: states.filter(isRunListState), causes,
  };
  const all = [...values.assemblies, ...values.flows, ...values.states, ...values.causes];
  if (all.length > RUN_LIST_CONTRACT.filters.values) return { failure: invalid("filter-limit", "Run list accepts at most 64 distinct filter values.") };
  if (all.reduce((bytes, value) => bytes + Buffer.byteLength(value), 0) > RUN_LIST_CONTRACT.filters.bytes) {
    return { failure: invalid("filter-bytes-limit", "Run list accepts at most 2,048 bytes of distinct filter values.") };
  }
  if ([...values.assemblies, ...values.flows].some((value) => /[\u0000-\u001F\u007F-\u009F]/u.test(value))) {
    return { failure: invalid("filter-control", "Run list assembly and flow filters must not contain control characters.") };
  }
  return { values };
}

function parsedBound(raw: string | undefined, name: "--since" | "--until"): { value?: number; failure?: CliFailure } {
  if (raw === undefined) return {};
  const value = timestamp(raw);
  return value === undefined
    ? { failure: invalid("timestamp-invalid", `Run list ${name} must be an RFC 3339 timestamp with an explicit offset.`, { option: name }) }
    : { value };
}

function parsedBounds(sinceRaw: string | undefined, untilRaw: string | undefined): { bounds: Bounds } | { failure: CliFailure } {
  const since = parsedBound(sinceRaw, "--since"), until = parsedBound(untilRaw, "--until");
  if (since.failure !== undefined) return { failure: since.failure };
  if (until.failure !== undefined) return { failure: until.failure };
  const sinceValue = since.value, untilValue = until.value;
  if (sinceValue !== undefined && untilValue !== undefined && sinceValue > untilValue) return { failure: invalid("time-order-invalid", "Run list --since must not be later than --until.") };
  return { bounds: { ...(sinceValue === undefined ? {} : { since: sinceValue }), ...(untilValue === undefined ? {} : { until: untilValue }) } };
}

function parsedLimit(raw: string | undefined): { limit: number } | { failure: CliFailure } {
  const limit = raw === undefined ? RUN_LIST_CONTRACT.page.default : Number(raw);
  return Number.isInteger(limit) && limit >= RUN_LIST_CONTRACT.page.minimum && limit <= RUN_LIST_CONTRACT.page.maximum
    ? { limit } : { failure: invalid("limit-invalid", "Run list limit must be an integer from 1 through 200.", { limit: raw }) };
}

function countConflict(args: readonly string[]): CliFailure | undefined {
  if (!args.includes("--count")) return undefined;
  const forbidden = ["--limit", "--after", "--fields"].find((name) => args.includes(name));
  return forbidden === undefined ? undefined
    : invalid("option-conflict", `Run list --count cannot be combined with ${forbidden}.`, { option: forbidden });
}

function cursorLimit(after: string | undefined): CliFailure | undefined {
  return after !== undefined && Buffer.byteLength(after) > RUN_LIST_CONTRACT.cursor.encodedBytes
    ? invalid("cursor-limit", "Run list cursor must not exceed 8,192 bytes.", { bytes: Buffer.byteLength(after) }) : undefined;
}

function parsedControls(args: readonly string[], values: Record<string, OptionValue>): { controls: Controls } | { failure: CliFailure } {
  const selected = parseFields(values["--fields"]?.value), limit = parsedLimit(values["--limit"]?.value);
  if ("failure" in selected) return selected;
  if ("failure" in limit) return limit;
  const conflict = countConflict(args);
  if (conflict !== undefined) return { failure: conflict };
  const after = values["--after"]?.value;
  const cursorFault = cursorLimit(after);
  if (cursorFault !== undefined) return { failure: cursorFault };
  return { controls: { fields: selected.fields, limit: limit.limit, count: args.includes("--count"),
    json: args.includes("--json") || args.includes("-j"), ...(after === undefined ? {} : { after }) } };
}

export function parseRunList(args: readonly string[]): RunListParse {
  const valued = ["--assembly", "--flow", "--state", "--cause", "--since", "--until", "--limit", "--after", "--fields"];
  const syntax = syntaxFailure(args, valued);
  if (syntax !== undefined) return { failure: syntax };
  const singles = ["--since", "--until", "--limit", "--after", "--fields"];
  const values = Object.fromEntries(singles.map((name) => [name, singleton(args, name)]));
  const singletonFailure = singles.map((name) => values[name]?.failure).find((held) => held !== undefined);
  if (singletonFailure !== undefined) return { failure: singletonFailure };
  const heldValues = parsedValues(args), bounds = parsedBounds(values["--since"]?.value, values["--until"]?.value);
  const controls = parsedControls(args, values);
  if ("failure" in heldValues) return heldValues;
  if ("failure" in bounds) return bounds;
  if ("failure" in controls) return controls;
  return { query: { ...heldValues.values, ...bounds.bounds, ...controls.controls } };
}
