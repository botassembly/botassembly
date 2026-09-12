// The readings: lines `bot show`, `bot logs` and `bot session` compute FROM
// record events, which are "a reading of the record, not lines in it"
// (inspection.md) — what a run cost, where its stages worked, its events shown,
// and which sessions it holds. Nothing here touches the filesystem, the clock
// or a lock: events in, lines out, so `--json` can stay the record's own bytes
// while every other rendering is derived here (ticket 0099). Where a line has
// to know something the record cannot hold, the caller is asked (`scratchLines`).
import { attemptKey, scratchAttempt } from "./invocation.ts";
import { mapping, plainly } from "./model.ts";
import { field } from "./record-lines.ts";
import { compactMagnitude, renderRows, renderTable } from "./table.ts";
// What a run cost is the record's own arithmetic: the turn events carry the
// counts (record.md, "What it cost: tokens per stage, and in total"), and these
// sums are a reading of them — never a line in the record, never in `--json`.
type Spend = [input: number, output: number, total: number];
function count(event: Record<string, unknown>, name: string): number {
  const value = event[name];
  return validCount(value) ? value : 0;
}
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const countNames = ["input", "output", "cache_read", "cache_write", "total"] as const;
function turns(events: Record<string, unknown>[]): Record<string, unknown>[] {
  return events.filter((event) => event["event"] === "turn");
}
function spend(events: Record<string, unknown>[]): Spend {
  return events.reduce<Spend>((held, event) =>
    [held[0] + count(event, "input"), held[1] + count(event, "output"), held[2] + count(event, "total")], [0, 0, 0]);
}

function safeSpend(events: Record<string, unknown>[]): Spend | undefined {
  return events.every((event) => countNames.every((name) => validCount(event[name]))) ? spend(events) : undefined;
}

export function tokenTotal(events: Record<string, unknown>[]): number | null {
  const held = turns(events);
  return held.length === 0 ? null : safeSpend(held)?.[2] ?? null;
}

export interface Usage {
  stage: string;
  retry: number;
  provider: string;
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

function usageRow(event: Record<string, unknown>): Usage | undefined {
  const { stage, retry, provider, model } = event;
  if (typeof stage !== "string" || typeof retry !== "number" || typeof provider !== "string" || typeof model !== "string"
      || !countNames.every((name) => validCount(event[name]))) return undefined;
  return {
    stage, retry, provider, model,
    input: count(event, "input"), output: count(event, "output"),
    cache_read: count(event, "cache_read"), cache_write: count(event, "cache_write"), total: count(event, "total"),
  };
}

function addUsage(held: Usage, row: Usage): void {
  held.input += row.input;
  held.output += row.output;
  held.cache_read += row.cache_read;
  held.cache_write += row.cache_write;
  held.total += row.total;
}

/** Token totals per stage attempt and provider model, in record order. */
export function usage(events: Record<string, unknown>[]): Usage[] {
  if (safeSpend(turns(events)) === undefined) return [];
  const grouped = new Map<string, Usage>();
  for (const event of turns(events)) {
    const row = usageRow(event);
    if (row === undefined) continue;
    const retry = String(row.retry);
    // Length prefixes keep arbitrary stage, provider, and model names distinct.
    const key = `${String(row.stage.length)}:${row.stage}${retry}:${String(row.provider.length)}:${row.provider}${String(row.model.length)}:${row.model}`;
    const previous = grouped.get(key);
    if (previous === undefined) grouped.set(key, row);
    else addUsage(previous, row);
  }
  return [...grouped.values()];
}
// A stage's repeats are counted apart, the way the record names them
// (record.md#identity) — the one spelling of an identity a reading uses: the
// outcome rows print it, and `bot show`'s event column appends the attempt.
// The scratch key is NOT an identity spelled a second way, which is what it
// looked like here until 0122: it is a hash input the runtime spells too, so it
// is spelled beside the hash (`attemptKey`) and this file only calls it.
export function identityOf(event: Record<string, unknown>): string {
  return `${field(event, "stage")}${event["repeat"] === undefined ? "" : `#${field(event, "repeat")}`}`;
}
// A reason is the agent's or the machinery's own words and may run to a
// paragraph. One line per event is the law, so a clause carries its first line
// and no more of it; the whole is in the record and `--json` hands it over.
// Escaped before it is measured, not after (ticket 0165): the 120 bounds what
// the reader SEES, and a line of escapes is longer than the line it spells.
function said(event: Record<string, unknown>): string {
  const value = event["reason"];
  if (typeof value !== "string" || value.length === 0) return "";
  const first = plainly(value.split("\n")[0] ?? "");
  return ` — ${first.length > 120 ? `${first.slice(0, 119)}…` : first}`;
}
// "The exit code says whether; the cause says why" (record.md): one spelling of
// that pair, for a run's ending, a stage's and a subflow call's alike.
const ending = (event: Record<string, unknown>): string => `exit ${field(event, "exit")}, ${field(event, "cause")}`;
// A counted thing reads as English rather than as a field: one repeat, two
// repeats. Both spellings are given, because English does not derive the second
// from the first — one branch, three branches.
const many = (event: Record<string, unknown>, name: string, one: string, more: string): string =>
  `${field(event, name)} ${event[name] === 1 ? one : more}`;
// A list the record holds either as objects with a naming field or as bare
// strings — `received` and `declined` are both read through here.
const listed = (value: unknown, name: string): string[] =>
  (Array.isArray(value) ? value : []).map((held: unknown) => mapping(held) ? field(held, name) : typeof held === "string" ? held : "-");
const branchOf = (held: unknown): string =>
  mapping(held) ? `${field(held, "branch")} ${held["started"] === true ? ending(held) : "never started"}` : "-";
// What a person debugging would ask of THIS event, in words — one designed
// clause per event type, built from the fields that matter for it and no others
// (ticket 0164). `util.inspect` used to print every field of every event,
// braces and quotes and all: the record's own job, done a second time, which is
// not a reading. The event word and the cause word here are the RECORD's
// (record.md#what-it-names), so a reader who greps their own JSONL for a word
// off one of these lines finds it; everything else is plain English, and every
// number stays bare so it can be grepped too.
const CLAUSES: Record<string, (event: Record<string, unknown>) => string> = {
  run_start: (event) => {
    const request = mapping(event["request"]) ? event["request"] : {};
    const flow = event["flow"] === undefined ? "" : `/${field(event, "flow")}`;
    // The run's own name opens the reading because a run is named to `bot show`
    // by any prefix (inspection.md): the first thing a reader asks of a prefix
    // is which run it resolved to, and every other verb wants the whole name.
    return `${field(event, "run")}, ${field(event, "assembly")}${flow}${event["continued_from"] === undefined ? "" : ` continued from ${field(event, "continued_from")}`} from ${field(request, "path")}, ${many(request, "bytes", "byte", "bytes")} via ${field(request, "via")}, bot ${field(event, "runtime")}`;
  },
  run_end: (event) => `${ending(event)}${said(event)}`,
  stage_carried: (event) => `carried from ${field(event, "from")}`,
  stage_end: (event) => {
    const output = mapping(event["output"]) ? event["output"] : undefined;
    const wrote = output === undefined
      ? "wrote nothing"
      : `agent report: ${event["sealed"] === true ? "sealed" : "wrote"} ${field(output, "path")}${event["judged"] === true ? "" : ", nothing judged it"}`;
    return `${ending(event)}, ${wrote}${said(event)}`;
  },
  turn: (event) => {
    const cached = count(event, "cache_read") + count(event, "cache_write") === 0 ? "" : `, cache read: ${compactMagnitude(count(event, "cache_read"))}, cache write: ${compactMagnitude(count(event, "cache_write"))}`;
    // Every count in the clause is labelled the way the token summary labels
    // its own, so a reader meets one spelling — and `stop: stop` is a labelled
    // value rather than a word said twice, which is why the colon is here.
    return `input: ${compactMagnitude(count(event, "input"))}, output: ${compactMagnitude(count(event, "output"))}${cached}, total: ${compactMagnitude(count(event, "total"))}, stop: ${field(event, "stop")}, ${field(event, "model")} via ${field(event, "provider")}`;
  },
  provider_start: (event) => `${field(event, "model")} via ${field(event, "provider")}`,
  provider_transport: (event) => {
    if (event["source"] === "requested") return `${field(event, "transport")}, requested`; const error = mapping(event["error"]) ? event["error"] : {};
    return `${field(event, "transport")}, diagnostic-derived: configured ${field(event, "configured_transport")}, fallback ${event["fallback_transport"] === undefined ? "none" : field(event, "fallback_transport")}, phase ${field(event, "phase")}, events emitted ${event["events_emitted"] === true ? "true" : event["events_emitted"] === false ? "false" : "-"}; ${error["name"] === undefined ? "error" : field(error, "name")} ${field(error, "message")}${error["code"] === undefined ? "" : `, code ${field(error, "code")}`}`;
  },
  provider_retry: (event) => `attempt ${field(event, "attempt")}, delay ${field(event, "delay_ms")} ms`,
  gate_start: (event) => `gate started, ${field(event, "file")}`,
  // A gate names the file it ran, because a gate folder runs several and the
  // check word alone cannot say which one spoke.
  check: (event) => {
    const ran = event["file"] === undefined ? "" : `, ${field(event, "file")}`;
    if (event["exit"] === 0) return `${event["check"] === "gate" ? "authoritative gate verdict: " : ""}${field(event, "check")} passed${ran}`;
    const how = typeof event["exit"] === "number" ? `failed, exit ${field(event, "exit")}` : "never reported an exit";
    return `${event["check"] === "gate" ? "authoritative gate verdict: " : ""}${field(event, "check")} ${how}${ran} — see ${field(event, "capture")}`;
  },
  hook: (event) => {
    const how = typeof event["exit"] === "number" ? `exit ${field(event, "exit")}` : "never reported an exit";
    return `${field(event, "hook")} hook, ${how}${event["exit"] === 0 ? "" : ` — see ${field(event, "capture")}`}`;
  },
  prompt: (event) => {
    const sources = Array.isArray(event["prompt"]) ? event["prompt"].length : 0;
    return `constructed from ${String(sources)} ${sources === 1 ? "source" : "sources"}`;
  },
  // `refuse` decides `refuse`, and the tool's own word said twice is not a
  // sentence: the decision is named when it says something the tool did not.
  tool_call: (event) => {
    const item = event["item"] === undefined ? "" : ` item ${field(event, "item")}`;
    const decided = field(event, "decision");
    return `${field(event, "tool")}${item}${decided === field(event, "tool") ? "" : ` ${decided}`}${said(event)}`;
  },
  tool_denied: (event) => `${field(event, "tool")} denied at ${field(event, "boundary")} boundary`,
  loop_done: (event) => `${many(event, "repeats", "repeat", "repeats")}, ended by ${field(event, "ended_by")}${said(event)}`,
  parallel_done: (event) => {
    const branches = (Array.isArray(event["branches"]) ? event["branches"] : []).map(branchOf);
    // Semicolons: a branch spells its ending the way every other clause does, and that spelling holds a comma.
    return `${many(event, "width", "branch", "branches")}, ${field(event, "concurrent")} at a time: ${branches.join("; ")}`;
  },
  fanout_start: (event) => `${Array.isArray(event["plan"]) ? String(event["plan"].length) : "-"} planned items for ${field(event, "subflow")}, width ${field(event, "width")}`,
  fanout_done: (event) => `${ending(event)}, peak concurrency ${field(event, "concurrent")}${event["selected"] === undefined ? "" : `, selected ${field(event, "selected")}`}`,
  chose: (event) => {
    const declined = listed(event["declined"], "");
    const over = declined.length === 0 ? "" : ` over ${declined.join(", ")}`;
    return `${event["chose"] === undefined ? "nothing" : field(event, "chose")}${over}${said(event)}`;
  },
  subflow_call: (event) => {
    const input = mapping(event["input"]) ? `, ${many(event["input"], "bytes", "byte", "bytes")} in` : "";
    const outcome = event["started"] === true ? `, ${ending(event)}, child ${field(event, "child")}` : ", never started";
    const item = event["via"] === "fanout" ? ` for item ${field(event, "item")}` : "";
    const output = mapping(event["output"]) ? `, output ${field(event["output"], "path")}` : "";
    return `call ${field(event, "call")}${item} to ${field(event, "flow")}, depth ${field(event, "depth")}${input}${outcome}${output}${said(event)}`;
  },
  hash_drift: (event) => `${field(event, "file")} changed under the run — expected ${field(event, "expected")}, found ${field(event, "actual")}`,
  tmp_teardown: (event) => `temporary-directory teardown failed${said(event)}`,
  signal: (event) => `killed from outside by ${field(event, "name")}, ${field(event, "signal")}`,
  unreconciled: (event) => `never seen settle: started ${field(event, "started")}, stopped ${field(event, "stopped")}; its spend is in no total`,
};
function stageStartClause(event: Record<string, unknown>, seenSessions: Set<string>): string {
  const got = listed(event["received"], "name"), workdir = mapping(event["workdir"]) ? event["workdir"] : { authored: null };
  const where = workdir["authored"] === null ? ", inherited root" : `, workdir ${plainly(field(workdir, "authored"))} (${plainly(field(workdir, "resolved"))})`;
  const session = event["session"];
  const reading = typeof session !== "string" ? "" : `, ${seenSessions.has(session) ? "continued" : "new"} session`;
  if (typeof session === "string") seenSessions.add(session);
  return `read ${got.length === 0 ? "nothing" : got.join(", ")}${where}${reading}`;
}
export function showLine(event: Record<string, unknown>, seenSessions = new Set<string>()): string {
  const identity = event["stage"] === undefined ? "-" : `${identityOf(event)}/${field(event, "retry")}`;
  const clause = event["event"] === "stage_start" ? stageStartClause(event, seenSessions) : CLAUSES[field(event, "event")]?.(event) ?? "";
  return plainly(`${field(event, "ts")}  ${field(event, "event")}  ${identity}${clause === "" ? "" : `  ${clause}`}`);
}

function turnLines(events: Record<string, unknown>[]): Map<Record<string, unknown>, string> {
  const held = turns(events);
  const rows = held.map((event) => {
    const cached = count(event, "cache_read") + count(event, "cache_write") === 0 ? "" :
      ` cache read: ${compactMagnitude(count(event, "cache_read"))}, cache write: ${compactMagnitude(count(event, "cache_write"))},`;
    return [
      `${field(event, "ts")}  turn  ${identityOf(event)}/${field(event, "retry")}`,
      `input: ${compactMagnitude(count(event, "input"))},`,
      `output: ${compactMagnitude(count(event, "output"))},${cached}`,
      `total: ${compactMagnitude(count(event, "total"))},`,
      `stop: ${field(event, "stop")}, ${field(event, "model")} via ${field(event, "provider")}`,
    ];
  });
  const rendered = renderRows(rows[0]?.map(() => ({ label: "" })) ?? [], rows, "\u00a0");
  return new Map(held.map((event, at) => [event, rendered[at] ?? ""]));
}

/** Render event history with aligned turns and counted adjacent transports. */
export function showLines(events: Record<string, unknown>[]): string[] {
  const alignedTurns = turnLines(events);
  const seenSessions = new Set<string>();
  const rendered = events.map((event) => alignedTurns.get(event) ?? showLine(event, seenSessions));
  const counted: string[] = [];
  for (let at = 0; at < rendered.length; at += 1) {
    const line = rendered[at] ?? "";
    if (events[at]?.["event"] !== "provider_transport") { counted.push(line); continue; }
    let end = at + 1;
    while (end < rendered.length && events[end]?.["event"] === "provider_transport" && rendered[end] === line) end += 1;
    counted.push(end - at === 1 ? line : `${line} ×${String(end - at)}`);
    at = end - 1;
  }
  return counted;
}

function elapsed(events: Record<string, unknown>[], start: Record<string, unknown>, end: Record<string, unknown> | undefined): string {
  const final = end ?? events.at(-1);
  const began = Date.parse(field(start, "ts")), stopped = final === undefined ? began : Date.parse(field(final, "ts"));
  let seconds = Number.isFinite(began) && Number.isFinite(stopped) ? Math.max(0, Math.floor((stopped - began) / 1_000)) : 0;
  const units: [number, string][] = [[86_400, "d"], [3_600, "h"], [60, "m"], [1, "s"]];
  const parts: string[] = [];
  for (const [size, suffix] of units) {
    const amount = Math.floor(seconds / size);
    if (amount > 0) parts.push(`${String(amount)}${suffix}`);
    seconds %= size;
  }
  return parts.length === 0 ? "0s" : parts.join(" ");
}

function lastEvent(events: Record<string, unknown>[], name: string): Record<string, unknown> | undefined {
  let held: Record<string, unknown> | undefined;
  for (const event of events) if (event["event"] === name) held = event;
  return held;
}

function stageVerdict(events: Record<string, unknown>[]): string {
  const end = lastEvent(events, "stage_end");
  if (end !== undefined) return field(end, "cause");
  return lastEvent(events, "stage_carried") === undefined ? "unfinished" : "carried";
}

function stageOutcomeRows(events: Record<string, unknown>[]): string[][] {
  const stages = new Map<string, Record<string, unknown>[]>();
  for (const event of events) {
    if (!["stage_carried", "stage_start", "turn", "stage_end"].includes(field(event, "event")) || typeof event["stage"] !== "string") continue;
    const identity = identityOf(event);
    stages.set(identity, [...(stages.get(identity) ?? []), event]);
  }
  const rows = [...stages].map(([identity, held]) => {
    const spent = safeSpend(turns(held));
    return [identity, stageVerdict(held), ...spendCells(spent)];
  });
  rows.push(["total", "", ...spendCells(safeSpend(turns(events)))]);
  return rows;
}

function spendCells(spent: Spend | undefined): string[] {
  return spent === undefined ? ["input: -", "output: -", "total: -"]
    : [`input: ${compactMagnitude(spent[0])}`, `output: ${compactMagnitude(spent[1])}`, `total: ${compactMagnitude(spent[2])}`];
}

/** Derive the outcome-first human reading entirely from held events. */
export function outcomeLines(events: Record<string, unknown>[]): string[] {
  const start = events.find((event) => event["event"] === "run_start") ?? {};
  const end = lastEvent(events, "run_end");
  const facts = [
    `outcome  ${end === undefined ? "unfinished" : `${field(end, "exit")}/${field(end, "cause")}`}`,
    `assembly  ${field(start, "assembly")}`,
    `flow  ${field(start, "flow")}`,
    `wall time  ${elapsed(events, start, end)}`,
  ];
  const reason = end?.["reason"];
  if (end?.["exit"] !== 0 && typeof reason === "string" && reason.length > 0) facts.push(`error  ${reason}`);
  return [...facts.map(plainly), ...renderTable([
    { label: "stage" }, { label: "verdict" }, { label: "input", align: "right" },
    { label: "output", align: "right" }, { label: "total", align: "right" },
  ], stageOutcomeRows(events))];
}
// Where a stage worked, which a reader can no longer guess: the scratch tree
// names nothing below the run now (ticket 0067), so the side holding the run's
// name says it. A reading of the record like the cost lines, never a line in
// it — `--json` stays the record's own bytes.
//
// Scratch is a cache the OS may empty (slots.md), so a path is stat'd before it
// is offered — and one that names nothing now is not offered at all (ticket
// 0164). It used to print with the word `gone` beside it, which is a dead path
// dressed as somewhere to go; a path still there prints exactly the line it
// always printed (ticket 0140). The question is ASKED here and answered by the
// caller — this file still touches no filesystem, which is what lets the
// record's own readings be tested without one.
export function scratchLines(events: Record<string, unknown>[], root: string, gone: (path: string) => boolean): string[] {
  const held = new Set<string>();
  for (const event of events) {
    if (event["event"] !== "stage_start" || typeof event["stage"] !== "string") continue;
    const repeat = typeof event["repeat"] === "number" ? event["repeat"] : undefined;
    const path = scratchAttempt(root, attemptKey(event["stage"], repeat));
    if (!gone(path)) held.add(plainly(`-  scratch  ${identityOf(event)}  ${path}`));
  }
  return [...held];
}
export interface SessionChoice { stage: string; path: string; repeat?: number }
// A session the record points at and the runtime no longer has: named as the
// missing file it is, never rendered as a stage that did nothing.
export const missingSession = (choice: SessionChoice): string => plainly(`${choice.stage}  -  no-session  ${choice.path}`);
export function allSessionChoices(events: Record<string, unknown>[]): SessionChoice[] {
  const unique = new Map<string, SessionChoice>();
  for (const event of events) {
    if (event["event"] !== "stage_start" || typeof event["stage"] !== "string" || typeof event["session"] !== "string") continue;
    const repeat = typeof event["repeat"] === "number" ? event["repeat"] : undefined;
    unique.set(`${event["session"]}\0${String(repeat ?? "")}`, { stage: event["stage"], path: event["session"], ...(repeat === undefined ? {} : { repeat }) });
  }
  return [...unique.values()].sort((a, b) => (a.repeat ?? 0) - (b.repeat ?? 0));
}
export function sessionChoices(events: Record<string, unknown>[], stage: string): SessionChoice[] {
  return allSessionChoices(events).filter((choice) => choice.stage === stage);
}
