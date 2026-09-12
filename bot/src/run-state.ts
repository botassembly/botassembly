import type { HeldRecord } from "./record-lines.ts";
import { tokenTotal, usage, type Usage } from "./readings.ts";

export interface RunStateFact {
  id: string; assembly: string | null; flow: string | null; startedAt: string | null; endedAt: string | null; duration: number | null; state: string;
  legacyState: string; exit: number | null; cause: string | null; tokens: number | null; usage?: Usage[]; says?: string;
}

function text(event: Record<string, unknown>, name: string): string | null {
  const value = event[name]; return typeof value === "string" ? value : null;
}

function number(event: Record<string, unknown>, name: string): number | null {
  const value = event[name]; return typeof value === "number" ? value : null;
}

function timing(start: Record<string, unknown>, end: Record<string, unknown> | undefined): Pick<RunStateFact, "startedAt" | "endedAt" | "duration"> {
  const startedAt = text(start, "ts");
  if (end === undefined) return { startedAt, endedAt: null, duration: null };
  const endedAt = text(end, "ts");
  if (startedAt === null || endedAt === null) return { startedAt, endedAt, duration: null };
  return { startedAt, endedAt, duration: Date.parse(endedAt) - Date.parse(startedAt) };
}

function empty(id: string, state: string, says?: string): RunStateFact {
  return { id, assembly: null, flow: null, startedAt: null, endedAt: null, duration: null, state, legacyState: state, exit: null, cause: null, tokens: null,
    ...(says === undefined ? {} : { says }) };
}

function finalState(record: HeldRecord, end: Record<string, unknown> | undefined, live: boolean): string {
  if (!record.events.some((event) => event["event"] === "run_start")) return "incomplete";
  if (end !== undefined) return "ended";
  return live ? "running" : "crashed";
}

function readable(id: string, record: HeldRecord, live: boolean, withTokens: boolean, withUsage: boolean): RunStateFact {
  const start = record.events.find((event) => event["event"] === "run_start") ?? {};
  let end: Record<string, unknown> | undefined;
  for (const event of record.events) if (event["event"] === "run_end") end = event;
  return { id, assembly: text(start, "assembly"), flow: text(start, "flow"), ...timing(start, end),
    state: finalState(record, end, live), legacyState: record.classification === "incomplete" ? "incomplete" : finalState(record, end, live),
    exit: end === undefined ? null : number(end, "exit"),
    cause: end === undefined ? null : text(end, "cause"), tokens: withTokens ? tokenTotal(record.events) : null,
    ...(withUsage ? { usage: usage(record.events) } : {}), ...(record.notice === undefined ? {} : { says: record.notice }) };
}

export function runStateFact(id: string, record: HeldRecord | undefined, live: boolean, withTokens: boolean, withUsage: boolean): RunStateFact | undefined {
  if (record === undefined) return live ? undefined : empty(id, "no-record");
  if (record.fault !== undefined) return empty(id, record.fault.mark, record.fault.says);
  return readable(id, record, live, withTokens, withUsage);
}
