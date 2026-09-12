import type { Api, Model, Models, ModelsRefreshResult, Provider } from "@earendil-works/pi-ai";
import { jsonObject } from "./check.ts";
import { MODEL_LIST_CONTRACT } from "./cli-contract.ts";
import { bytewise, mapping } from "./model.ts";
import { inertText, newCommandFailure } from "./new-command-result.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  modelRuntime?: () => Promise<Models>;
  authProvider?: (id: string) => Provider | undefined | Promise<Provider | undefined>;
  beforeCredentialAccess?: () => void;
}

interface Request { provider?: string; live: boolean; json: boolean; offset: number; limit: number }
type ModelStatus = "local-only" | "live-only" | null;
interface ModelRow {
  provider: string;
  model: string;
  contextWindow: number;
  maxOutput: number;
  reasoning: boolean;
  cost: { input: number; output: number };
  status: ModelStatus;
}

function failure(code: CliFailure["code"], cause: string, message: string, exit: CliFailure["exit"], retryable = false): CliFailure {
  return { code, cause, message, retryable, details: {}, exit };
}

function invalid(cause: string, message: string): CliFailure {
  return failure("request-invalid", cause, message, 2);
}

function emitFailure(boundary: Boundary, held: CliFailure, json: boolean): number {
  const result = newCommandFailure("model.list", held, json);
  boundary.stderr(result.stderr);
  return result.exit;
}

function flagCount(args: readonly string[], names: readonly string[]): number {
  return args.filter((word) => names.includes(word)).length;
}

function valued(args: readonly string[], name: string): { value?: string; indexes: Set<number>; failure?: CliFailure } {
  const positions = args.flatMap((word, index) => word === name ? [index] : []);
  if (positions.length > 1) return { indexes: new Set(), failure: invalid("option-repeated", `Model list accepts ${name} once.`) };
  const at = positions[0];
  if (at === undefined) return { indexes: new Set() };
  const value = args[at + 1];
  if (value === undefined || value.startsWith("-")) {
    return { indexes: new Set([at]), failure: invalid("value-missing", `Model list requires a value after ${name}.`) };
  }
  return { value, indexes: new Set([at, at + 1]) };
}

function integer(raw: string | undefined, minimum: number, maximum: number): number | undefined {
  if (raw === undefined || !/^\d+$/u.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function modeFailure(jsonCount: number, liveCount: number): CliFailure | undefined {
  if (jsonCount > 1) return invalid("option-repeated", "Model list accepts one JSON mode flag.");
  if (liveCount > 1) return invalid("option-repeated", "Model list accepts --live once.");
  return undefined;
}

interface ParsedNumbers { offset: ReturnType<typeof valued>; limit: ReturnType<typeof valued>; offsetNumber?: number; limitNumber?: number }

function parsedNumbers(args: readonly string[]): ParsedNumbers | CliFailure {
  const offset = valued(args, "--offset"), limit = valued(args, "--limit");
  if (offset.failure !== undefined) return offset.failure;
  if (limit.failure !== undefined) return limit.failure;
  const offsetNumber = offset.value === undefined ? MODEL_LIST_CONTRACT.page.offsetDefault
    : integer(offset.value, MODEL_LIST_CONTRACT.page.offsetMinimum, MODEL_LIST_CONTRACT.page.offsetMaximum);
  if (offsetNumber === undefined) return invalid("offset-invalid", "Model list offset must be an integer from 0 through 2,147,483,647.");
  const limitNumber = limit.value === undefined ? MODEL_LIST_CONTRACT.page.limitDefault
    : integer(limit.value, MODEL_LIST_CONTRACT.page.limitMinimum, MODEL_LIST_CONTRACT.page.limitMaximum);
  if (limitNumber === undefined) return invalid("limit-invalid", "Model list limit must be an integer from 1 through 200.");
  return { offset, limit, offsetNumber, limitNumber };
}

function providerFrom(args: readonly string[], consumed: ReadonlySet<number>): string | undefined | CliFailure {
  const rest = args.filter((_word, index) => !consumed.has(index) && !["--json", "-j", "--live"].includes(args[index] ?? ""));
  const unknown = rest.find((word) => word.startsWith("-"));
  if (unknown !== undefined) return invalid("option-unknown", `Model list does not accept ${unknown}.`);
  if (rest.length > 1) return invalid("arguments-invalid", "Model list accepts at most one provider.");
  const provider = rest[0];
  if (provider !== undefined && Buffer.byteLength(provider) > MODEL_LIST_CONTRACT.identityBytes) {
    return invalid("provider-invalid", "Model list provider identity must be from 1 through 1,024 bytes.");
  }
  return provider;
}

function parse(args: readonly string[]): Request | CliFailure {
  const jsonCount = flagCount(args, ["--json", "-j"]), liveCount = flagCount(args, ["--live"]);
  const modes = modeFailure(jsonCount, liveCount);
  if (modes !== undefined) return modes;
  const numbers = parsedNumbers(args);
  if ("code" in numbers) return numbers;
  const provider = providerFrom(args, new Set([...numbers.offset.indexes, ...numbers.limit.indexes]));
  if (typeof provider === "object") return provider;
  return { ...(provider === undefined ? {} : { provider }), live: liveCount === 1, json: jsonCount === 1,
    offset: numbers.offsetNumber ?? 0, limit: numbers.limitNumber ?? 50 };
}

function selected(models: Models, provider: string | undefined): Promise<readonly Model<Api>[]> {
  return provider === undefined ? models.getAvailable() : Promise.resolve(models.getModels(provider));
}

function validSize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validIdentity(value: string): boolean {
  return value.length > 0 && Buffer.byteLength(value) <= MODEL_LIST_CONTRACT.identityBytes;
}

function validCost(value: number): boolean { return Number.isFinite(value) && value >= 0; }

function validRow(row: ModelRow): boolean {
  return [validIdentity(row.provider), validIdentity(row.model), validSize(row.contextWindow), validSize(row.maxOutput),
    typeof row.reasoning === "boolean", validCost(row.cost.input), validCost(row.cost.output),
    Buffer.byteLength(jsonObject(row)) < MODEL_LIST_CONTRACT.rowBytesExclusive].every(Boolean);
}

function modelRow(model: Model<Api>, status: ModelStatus): ModelRow | undefined {
  const cost: unknown = model.cost;
  const input = mapping(cost) ? cost["input"] : undefined, output = mapping(cost) ? cost["output"] : undefined;
  const row: ModelRow = {
    provider: model.provider, model: model.id, contextWindow: model.contextWindow, maxOutput: model.maxTokens,
    reasoning: model.reasoning, cost: { input: Number(input), output: Number(output) }, status,
  };
  return validRow(row) ? row : undefined;
}

function keyed(models: readonly Model<Api>[]): Map<string, Map<string, Model<Api>>> | undefined {
  const result = new Map<string, Map<string, Model<Api>>>();
  for (const model of models) {
    if (modelRow(model, null) === undefined) return undefined;
    let provider = result.get(model.provider);
    if (provider === undefined) { provider = new Map(); result.set(model.provider, provider); }
    if (provider.has(model.id)) return undefined;
    provider.set(model.id, model);
  }
  return result;
}

type ModelIndex = Map<string, Map<string, Model<Api>>>;

function identitiesOf(local: ModelIndex, live: ModelIndex): Map<string, Set<string>> {
  const identities = new Map<string, Set<string>>();
  for (const source of [local, live]) for (const [provider, models] of source) {
    let ids = identities.get(provider);
    if (ids === undefined) { ids = new Set(); identities.set(provider, ids); }
    for (const id of models.keys()) ids.add(id);
  }
  return identities;
}

function unionRow(provider: string, id: string, local: ModelIndex, live: ModelIndex, compared: boolean): ModelRow | undefined {
  const first = local.get(provider)?.get(id), second = live.get(provider)?.get(id), model = second ?? first;
  if (model === undefined) return undefined;
  const status = !compared || (first !== undefined && second !== undefined) ? null : first === undefined ? "live-only" : "local-only";
  return modelRow(model, status);
}

function rows(before: readonly Model<Api>[], after?: readonly Model<Api>[]): ModelRow[] | undefined {
  const local = keyed(before), live = keyed(after ?? before);
  if (local === undefined || live === undefined) return undefined;
  const result: ModelRow[] = [];
  for (const [provider, ids] of identitiesOf(local, live)) for (const id of ids) {
    const row = unionRow(provider, id, local, live, after !== undefined);
    if (row === undefined) return undefined;
    result.push(row);
  }
  return result.sort((first, second) => bytewise(first.provider, second.provider) || bytewise(first.model, second.model));
}

function jsonResult(all: readonly ModelRow[], request: Request): Buffer {
  const data = all.slice(request.offset, request.offset + request.limit), next = request.offset + data.length;
  const complete = next >= all.length;
  return Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.model.list", data,
    page: { offset: request.offset, limit: request.limit, nextOffset: complete ? null : next, complete },
    summary: { total: all.length, returned: data.length } })}\n`);
}

function humanResult(all: readonly ModelRow[], request: Request): Buffer {
  const data = all.slice(request.offset, request.offset + request.limit);
  const raw = data.map((row) => [row.provider, row.model, String(row.contextWindow), String(row.maxOutput),
    row.reasoning ? "reasoning" : "-", `$${row.cost.input.toFixed(2)}`, `$${row.cost.output.toFixed(2)}`,
    ...(row.status === null ? [] : [row.status])]);
  const escaped = raw.map((row) => row.map((cell) => inertText(cell, MODEL_LIST_CONTRACT.humanCellBytes).text));
  const widths = escaped.reduce<number[]>((held, row) => row.map((cell, index) => Math.max(held[index] ?? 0, cell.length)), []);
  const lines = escaped.map((row) => row.map((cell, index) => index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)).join("  "));
  lines.push(`Showing ${String(data.length)} of ${String(all.length)} models.`);
  return Buffer.from(`${lines.join("\n")}\n`);
}

function refreshFailure(result: ModelsRefreshResult): CliFailure | undefined {
  if (result.aborted) return failure("state-not-reached", "refresh-aborted", "The live model catalog refresh was aborted.", 1);
  if (result.errors.size === 0) return undefined;
  const providers = [...result.errors.keys()].sort(bytewise).join(", ");
  return failure("dependency-failed", "refresh-failed", `The live model catalog refresh failed for ${providers}.`, 4, true);
}

function runtimeFailure(reason: unknown): CliFailure {
  const raw = reason instanceof Error ? reason.message : "";
  const integrity = raw.startsWith("Unsafe Pi model configuration") || raw.startsWith("Pi model runtime failed");
  return failure(integrity ? "integrity-failed" : "dependency-failed",
    integrity ? "runtime-invalid" : "runtime-unavailable",
    integrity ? "Pi model runtime configuration is invalid." : "Pi model runtime could not be initialized.",
    integrity ? 5 : 4, !integrity);
}

type Outcome<T> = { value: T } | { failure: CliFailure };

function attempted<T>(promise: Promise<T>, rejected: CliFailure): Promise<Outcome<T>> {
  return promise.then((value) => ({ value }), () => ({ failure: rejected }));
}

function acquireRuntime(boundary: Boundary): Promise<Outcome<Models>> {
  const create = boundary.modelRuntime;
  return create === undefined
    ? Promise.resolve({ failure: runtimeFailure(new Error("The Pi model runtime is unavailable.")) })
    : Promise.resolve().then(create).then((value) => ({ value }), (reason: unknown) => ({ failure: runtimeFailure(reason) }));
}

const availabilityFailure = (): CliFailure => failure("dependency-failed", "availability-unavailable", "Model availability could not be read.", 4, true);
const authenticationFailure = (): CliFailure => failure("dependency-failed", "authentication-unavailable", "Provider authentication status could not be read.", 4, true);
const refreshRejected = (): CliFailure => failure("dependency-failed", "refresh-failed", "The live model catalog refresh failed.", 4, true);

function safeSelection(models: Models, provider: string | undefined): Promise<Outcome<readonly Model<Api>[]>> {
  return attempted(Promise.resolve().then(() => selected(models, provider)), availabilityFailure());
}

async function validateProvider(request: Request, boundary: Boundary): Promise<CliFailure | undefined> {
  if (request.provider === undefined) return undefined;
  const provider = boundary.authProvider;
  if (provider === undefined) return failure("dependency-failed", "provider-catalog-unavailable", "Provider identity could not be read.", 4, true);
  const found = await attempted(Promise.resolve().then(() => provider(request.provider ?? "")),
    failure("dependency-failed", "provider-catalog-unavailable", "Provider identity could not be read.", 4, true));
  if ("failure" in found) return found.failure;
  return found.value === undefined ? invalid("provider-unknown", `No provider is called ${request.provider}.`) : undefined;
}

async function liveSelection(request: Request, boundary: Boundary, models: Models): Promise<Outcome<readonly Model<Api>[] | undefined>> {
  if (!request.live) return { value: undefined };
  if (request.provider !== undefined) {
    const auth = await attempted(Promise.resolve().then(() => models.checkAuth(request.provider ?? "")), authenticationFailure());
    if ("failure" in auth) return auth;
    if (auth.value === undefined) return { failure: invalid("provider-unconfigured", `No credential is configured for ${request.provider}, so bot cannot ask it for a live catalog.`) };
  }
  const refreshed = await attempted(Promise.resolve().then(() => models.refresh({ force: true, allowNetwork: boundary.env["PI_OFFLINE"] === undefined,
    ...(request.provider === undefined ? {} : { providers: [request.provider] }) })), refreshRejected());
  if ("failure" in refreshed) return refreshed;
  const failed = refreshFailure(refreshed.value);
  return failed === undefined ? safeSelection(models, request.provider) : { failure: failed };
}

async function run(request: Request, boundary: Boundary): Promise<number> {
  const invalidProvider = await validateProvider(request, boundary);
  if (invalidProvider !== undefined) return emitFailure(boundary, invalidProvider, request.json);
  boundary.beforeCredentialAccess?.();
  const acquired = await acquireRuntime(boundary);
  if ("failure" in acquired) return emitFailure(boundary, acquired.failure, request.json);
  const models = acquired.value;
  const before = await safeSelection(models, request.provider);
  if ("failure" in before) return emitFailure(boundary, before.failure, request.json);
  const after = await liveSelection(request, boundary, models);
  if ("failure" in after) return emitFailure(boundary, after.failure, request.json);
  const projected = await attempted(Promise.resolve().then(() => rows(before.value, after.value)),
    failure("integrity-failed", "model-invalid", "The Pi model runtime returned invalid model metadata.", 5));
  if ("failure" in projected) return emitFailure(boundary, projected.failure, request.json);
  const held = projected.value;
  if (held === undefined) return emitFailure(boundary,
    failure("integrity-failed", "model-invalid", "The Pi model runtime returned invalid model metadata.", 5), request.json);
  const output = request.json ? jsonResult(held, request) : humanResult(held, request);
  if (output.length >= MODEL_LIST_CONTRACT.documentBytesExclusive) return emitFailure(boundary,
    failure("integrity-failed", "result-oversized", "The model list result exceeds its output bound.", 5), request.json);
  boundary.stdout(output);
  return 0;
}

export function modelListCommand(args: readonly string[], boundary: Boundary): number | Promise<number> {
  const request = parse(args), json = args.some((word) => word === "--json" || word === "-j");
  return "code" in request ? emitFailure(boundary, request, json) : run(request, boundary);
}
