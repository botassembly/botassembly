import { join } from "node:path";
import { childRecordAgrees } from "./child-record.ts";
import { heldRecord, type HeldRecord } from "./record-lines.ts";
import { normalizedRunPath } from "./record-operation.ts";

export interface VerifiedConsumption { tokens: number | null; tokensStatus: "complete" | "partial" }

const COUNTERS = ["input", "output", "cache_read", "cache_write", "total"] as const;
const safeCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => safeCount(value) && value > 0;

function operationKey(event: Record<string, unknown>): string | undefined {
  const stage = event["stage"], repeat = event["repeat"], retry = event["retry"];
  const provider = event["provider"], model = event["model"];
  if (typeof stage !== "string" || stage.length === 0 || repeat !== undefined && !positive(repeat) || !positive(retry)
      || typeof provider !== "string" || typeof model !== "string") return undefined;
  const repeatKey = repeat === undefined ? "omitted" : `value:${String(repeat)}`;
  return `${String(stage.length)}:${stage}:${repeatKey}:${String(retry)}:${String(provider.length)}:${provider}:${String(model.length)}:${model}`;
}

interface LocalState { tokens: number; complete: boolean; overflow: boolean; starts: Map<string, number> }

function noteProviderStart(state: LocalState, event: Record<string, unknown>): void {
  const key = operationKey(event);
  if (key === undefined) { state.complete = false; return; }
  state.starts.set(key, (state.starts.get(key) ?? 0) + 1);
}

function noteTurn(state: LocalState, event: Record<string, unknown>): void {
  if (!COUNTERS.every((name) => safeCount(event[name]))) { state.complete = false; return; }
  const total = event["total"];
  if (!safeCount(total) || !Number.isSafeInteger(state.tokens + total)) { state.overflow = true; return; }
  state.tokens += total;
  const key = operationKey(event), waiting = key === undefined ? 0 : state.starts.get(key) ?? 0;
  if (waiting > 0 && key !== undefined) state.starts.set(key, waiting - 1);
}

function localConsumption(record: HeldRecord): VerifiedConsumption {
  const state: LocalState = { tokens: 0, complete: record.classification === "valid", overflow: false, starts: new Map() };
  for (const event of record.events) {
    if (event["event"] === "unreconciled") state.complete = false;
    else if (event["event"] === "provider_start") noteProviderStart(state, event);
    else if (event["event"] === "turn") noteTurn(state, event);
  }
  if (state.overflow) return { tokens: null, tokensStatus: "partial" };
  if ([...state.starts.values()].some((count) => count > 0)) state.complete = false;
  return { tokens: state.tokens, tokensStatus: state.complete ? "complete" : "partial" };
}

function expectedChild(event: Record<string, unknown>): string | undefined {
  const stage = event["stage"], repeat = event["repeat"] ?? 1, retry = event["retry"], call = event["call"];
  if (typeof stage !== "string" || stage.length === 0 || !positive(repeat) || !positive(retry) || !positive(call)) return undefined;
  return `stages/${stage}/${String(repeat)}/${String(retry)}/subflows/${String(call)}`;
}

function childSuffix(parts: string[]): boolean {
  return parts[0] === "stages" && parts.at(-2) === "subflows"
    && /^[1-9][0-9]*$/u.test(parts.at(-4) ?? "")
    && /^[1-9][0-9]*$/u.test(parts.at(-3) ?? "")
    && /^[1-9][0-9]*$/u.test(parts.at(-1) ?? "");
}

function childReference(reference: string): boolean {
  const parts = reference.split("/");
  if (!normalizedRunPath(reference) || reference.includes("\0") || parts.length < 6) return false;
  return childSuffix(parts);
}

interface Authorization { event: Record<string, unknown>; child: string; expected?: string; valid: boolean }

function authorization(event: Record<string, unknown>, expected: string | undefined): { item?: Authorization; complete: boolean } {
  const started = event["started"], child = event["child"];
  if (started === false && child === undefined) return { complete: true };
  const valid = started === true && typeof child === "string" && childReference(child) && expected !== undefined && child === expected;
  if (typeof child !== "string") return { complete: false };
  return { item: { event, child, ...(expected === undefined ? {} : { expected }), valid }, complete: valid };
}

function authorizations(events: Record<string, unknown>[]): { accepted: Authorization[]; complete: boolean } {
  const calls = events.filter((event) => event["event"] === "subflow_call");
  const held: Authorization[] = [];
  const slotCounts = new Map<string, number>();
  let complete = true;
  for (const event of calls) {
    const expected = expectedChild(event);
    if (expected !== undefined) slotCounts.set(expected, (slotCounts.get(expected) ?? 0) + 1);
    const found = authorization(event, expected);
    if (!found.complete) complete = false;
    if (found.item !== undefined) held.push(found.item);
  }
  const childCounts = new Map<string, number>();
  for (const item of held) {
    childCounts.set(item.child, (childCounts.get(item.child) ?? 0) + 1);
  }
  const accepted = held.filter((item) => item.valid && childCounts.get(item.child) === 1 && slotCounts.get(item.expected ?? "") === 1);
  if (accepted.length !== held.length || [...childCounts.values(), ...slotCounts.values()].some((count) => count > 1)) complete = false;
  return { accepted, complete };
}

async function acceptedChild(
  root: string, directory: string, path: string, authorization: Authorization,
): Promise<{ record: HeldRecord; directory: string; path: string } | undefined> {
  const childPath = path.length === 0 ? authorization.child : `${path}/${authorization.child}`;
  const record = await heldRecord(root, `${childPath}/record.jsonl`);
  if (record === undefined || record.fault !== undefined) return undefined;
  if (!await childRecordAgrees(directory, authorization.child, authorization.event, record)) return undefined;
  return { record, directory: join(directory, ...authorization.child.split("/")), path: childPath };
}

function safeSum(first: number, second: number): number | undefined {
  const total = first + second;
  return Number.isSafeInteger(total) ? total : undefined;
}

async function descendant(
  root: string, directory: string, path: string, authorization: Authorization, tokens: number, visited: Set<string>,
): Promise<VerifiedConsumption> {
  const relative = path.length === 0 ? authorization.child : `${path}/${authorization.child}`;
  if (visited.has(relative)) return { tokens, tokensStatus: "partial" };
  visited.add(relative);
  const child = await acceptedChild(root, directory, path, authorization);
  if (child === undefined) return { tokens, tokensStatus: "partial" };
  const result = await recursive(root, child.directory, child.path, child.record, visited);
  if (result.tokens === null) return result;
  const total = safeSum(tokens, result.tokens);
  return total === undefined ? { tokens: null, tokensStatus: "partial" } : { tokens: total, tokensStatus: result.tokensStatus };
}

async function recursive(
  root: string, directory: string, path: string, record: HeldRecord, visited: Set<string>,
): Promise<VerifiedConsumption> {
  const local = localConsumption(record);
  if (local.tokens === null) return local;
  let tokens = local.tokens;
  const authorized = authorizations(record.events);
  let complete = local.tokensStatus === "complete" && authorized.complete;
  for (const authorization of authorized.accepted) {
    const result = await descendant(root, directory, path, authorization, tokens, visited);
    if (result.tokens === null) return result;
    tokens = result.tokens;
    if (result.tokensStatus === "partial") complete = false;
  }
  return { tokens, tokensStatus: complete ? "complete" : "partial" };
}

export async function verifiedConsumption(directory: string, record: HeldRecord): Promise<VerifiedConsumption> {
  return recursive(directory, directory, "", record, new Set());
}
