import type { CredentialInfo, Provider } from "@earendil-works/pi-ai";
import { jsonObject } from "./check.ts";
import { AUTH_LIST_CONTRACT } from "./cli-contract.ts";
import { bytewise, mapping } from "./model.ts";
import { inertText, newCommandFailure } from "./new-command-result.ts";
import type { CliFailure } from "./run-list-query.ts";
import type { AuthListRuntime } from "./model-runtime.ts";

interface Boundary {
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  authListRuntime?: () => Promise<AuthListRuntime>;
  beforeCredentialAccess?: () => void;
}

interface Request { json: boolean; offset: number; limit: number }
type AuthMethod = "login" | "key" | "ambient-only";
type AuthState = "stored" | "unobserved";
type CredentialType = CredentialInfo["type"] | null;
interface AuthRow { provider: string; method: AuthMethod; state: AuthState; credentialType: CredentialType }

function failure(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function integrityFailure(): CliFailure {
  return { code: "integrity-failed", cause: "auth-runtime-invalid",
    message: "The Pi authentication state is unsafe, corrupt, or invalid.", retryable: false, details: {}, exit: 5 };
}

function emitFailure(boundary: Boundary, held: CliFailure, json: boolean): number {
  const result = newCommandFailure("auth.list", held, json);
  boundary.stderr(result.stderr);
  return result.exit;
}

function valued(args: readonly string[], name: string): { value?: string; indexes: Set<number>; failure?: CliFailure } {
  const positions = args.flatMap((word, index) => word === name ? [index] : []);
  if (positions.length > 1) return { indexes: new Set(), failure: failure("option-repeated", `Auth list accepts ${name} once.`) };
  const at = positions[0];
  if (at === undefined) return { indexes: new Set() };
  const value = args[at + 1];
  if (value === undefined || value.startsWith("-")) {
    return { indexes: new Set([at]), failure: failure("value-missing", `Auth list requires a value after ${name}.`) };
  }
  return { value, indexes: new Set([at, at + 1]) };
}

function integer(raw: string | undefined, minimum: number, maximum: number): number | undefined {
  if (raw === undefined || !/^\d+$/u.test(raw)) return undefined;
  const held = Number(raw);
  return Number.isSafeInteger(held) && held >= minimum && held <= maximum ? held : undefined;
}

function parse(args: readonly string[]): Request | CliFailure {
  const jsonCount = args.filter((word) => word === "--json" || word === "-j").length;
  if (jsonCount > 1) return failure("option-repeated", "Auth list accepts one JSON mode flag.");
  const offset = valued(args, "--offset"), limit = valued(args, "--limit");
  if (offset.failure !== undefined) return offset.failure;
  if (limit.failure !== undefined) return limit.failure;
  const offsetNumber = offset.value === undefined ? AUTH_LIST_CONTRACT.page.offsetDefault
    : integer(offset.value, AUTH_LIST_CONTRACT.page.offsetMinimum, AUTH_LIST_CONTRACT.page.offsetMaximum);
  if (offsetNumber === undefined) return failure("offset-invalid", "Auth list offset must be an integer from 0 through 2,147,483,647.");
  const limitNumber = limit.value === undefined ? AUTH_LIST_CONTRACT.page.limitDefault
    : integer(limit.value, AUTH_LIST_CONTRACT.page.limitMinimum, AUTH_LIST_CONTRACT.page.limitMaximum);
  if (limitNumber === undefined) return failure("limit-invalid", "Auth list limit must be an integer from 1 through 200.");
  const consumed = new Set([...offset.indexes, ...limit.indexes]);
  const rest = args.filter((_word, index) => !consumed.has(index) && !["--json", "-j"].includes(args[index] ?? ""));
  const unknown = rest[0];
  if (unknown !== undefined) return failure(unknown.startsWith("-") ? "option-unknown" : "argument-unknown", `Auth list does not accept ${unknown}.`);
  return { json: jsonCount === 1, offset: offsetNumber, limit: limitNumber };
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= AUTH_LIST_CONTRACT.identityBytes;
}

function credentialIndex(credentials: readonly CredentialInfo[]): Map<string, CredentialInfo["type"]> | undefined {
  const result = new Map<string, CredentialInfo["type"]>();
  for (const credential of credentials) {
    const providerId: unknown = credential.providerId, type: unknown = credential.type;
    if (!validIdentity(providerId) || (type !== "api_key" && type !== "oauth") || result.has(providerId)) return undefined;
    result.set(providerId, type);
  }
  return result;
}

function method(provider: Provider): AuthMethod | undefined {
  const auth: unknown = provider.auth;
  if (!mapping(auth)) return undefined;
  if (auth["oauth"] !== undefined) return mapping(auth["oauth"]) ? "login" : undefined;
  const apiKey = auth["apiKey"];
  if (!mapping(apiKey)) return undefined;
  return typeof apiKey["login"] === "function" ? "key" : "ambient-only";
}

function rows(providers: readonly Provider[], credentials: readonly CredentialInfo[]): AuthRow[] | undefined {
  const stored = credentialIndex(credentials);
  if (stored === undefined) return undefined;
  const seen = new Set<string>(), result: AuthRow[] = [];
  for (const provider of providers) {
    const providerId: unknown = provider.id;
    if (!validIdentity(providerId) || seen.has(providerId)) return undefined;
    seen.add(providerId);
    const authMethod = method(provider);
    if (authMethod === undefined) return undefined;
    const row: AuthRow = { provider: providerId, method: authMethod, state: stored.has(providerId) ? "stored" : "unobserved",
      credentialType: stored.get(providerId) ?? null };
    if (Buffer.byteLength(jsonObject(row)) >= AUTH_LIST_CONTRACT.rowBytesExclusive) return undefined;
    result.push(row);
  }
  return result.sort((first, second) => bytewise(first.provider, second.provider));
}

function isAuthListRuntime(value: unknown): value is AuthListRuntime {
  if (!mapping(value) || !Array.isArray(value["credentials"])) return false;
  const runtime = value["runtime"];
  return mapping(runtime) && typeof runtime["getProviders"] === "function";
}

function jsonResult(all: readonly AuthRow[], request: Request): Buffer {
  const data = all.slice(request.offset, request.offset + request.limit), next = request.offset + data.length;
  const complete = next >= all.length;
  return Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.auth.list", data,
    page: { offset: request.offset, limit: request.limit, nextOffset: complete ? null : next, complete },
    summary: { total: all.length, returned: data.length } })}\n`);
}

function humanResult(all: readonly AuthRow[], request: Request): Buffer {
  const data = all.slice(request.offset, request.offset + request.limit);
  const lines = data.map((row) => [row.provider, row.method, row.state]
    .map((cell) => inertText(cell, AUTH_LIST_CONTRACT.humanCellBytes).text).join("  "));
  lines.push(`Showing ${String(data.length)} of ${String(all.length)} providers.`);
  return Buffer.from(`${lines.join("\n")}\n`);
}

type Outcome<T> = { value: T } | { failure: CliFailure };

function attempted<T>(task: () => T | Promise<T>): Promise<Outcome<T>> {
  return Promise.resolve().then(task).then((value) => ({ value }), () => ({ failure: integrityFailure() }));
}

async function run(request: Request, boundary: Boundary): Promise<number> {
  boundary.beforeCredentialAccess?.();
  const create = boundary.authListRuntime;
  if (create === undefined) return emitFailure(boundary, integrityFailure(), request.json);
  const acquired = await attempted(create);
  if ("failure" in acquired || !isAuthListRuntime(acquired.value)) return emitFailure(boundary, integrityFailure(), request.json);
  const { runtime, credentials } = acquired.value;
  const projectedResult = await attempted(() => rows(runtime.getProviders(), credentials));
  if ("failure" in projectedResult || projectedResult.value === undefined) return emitFailure(boundary, integrityFailure(), request.json);
  const output = request.json ? jsonResult(projectedResult.value, request) : humanResult(projectedResult.value, request);
  if (output.length >= AUTH_LIST_CONTRACT.documentBytesExclusive) return emitFailure(boundary, integrityFailure(), request.json);
  boundary.stdout(output);
  return 0;
}

export function authListCommand(args: readonly string[], boundary: Boundary): number | Promise<number> {
  const request = parse(args), json = args.some((word) => word === "--json" || word === "-j");
  return "code" in request ? emitFailure(boundary, request, json) : run(request, boundary);
}
