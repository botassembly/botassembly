import type { Provider } from "@earendil-works/pi-ai";
import { credentialSynchronizationSettlement, type AuthLogoutRuntime } from "./model-runtime.ts";
import { jsonObject } from "./check.ts";
import { AUTH_LOGOUT_CONTRACT } from "./cli-contract.ts";
import { inertText, newCommandFailure } from "./new-command-result.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  authProvider?: (id: string) => Provider | undefined | Promise<Provider | undefined>;
  authLogoutRuntime?: () => Promise<AuthLogoutRuntime>;
  beforeCredentialAccess?: () => void;
  signal?: AbortSignal;
}

interface Request { provider: string; json: boolean }

function failure(code: CliFailure["code"], cause: string, message: string, exit: CliFailure["exit"],
  retryable: boolean, provider?: string): CliFailure {
  return { code, cause, message, retryable, details: provider === undefined ? {} : { provider }, exit };
}

function invalid(cause: string, message: string, provider?: string): CliFailure {
  return failure("request-invalid", cause, message, 2, false, provider);
}

function emitFailure(boundary: Boundary, held: CliFailure, json: boolean): number {
  const result = newCommandFailure("auth.logout", held, json);
  boundary.stderr(result.stderr);
  return result.exit;
}

function parse(args: readonly string[]): Request | CliFailure {
  const modes = args.filter((word) => word === "--json" || word === "-j");
  const json = modes.length > 0;
  if (modes.length > 1) return invalid("option-repeated", "Auth logout accepts one JSON mode flag.");
  const positionals = args.filter((word) => word !== "--json" && word !== "-j");
  const unknown = positionals.find((word) => word.startsWith("-"));
  if (unknown !== undefined) return invalid("option-unknown", `Auth logout does not accept ${inertText(unknown, 256).text}.`);
  if (positionals.length !== 1) return invalid("arguments-invalid", "Auth logout requires exactly one provider.");
  const provider = positionals[0] ?? "";
  const bytes = Buffer.byteLength(provider);
  if (bytes === 0 || bytes > AUTH_LOGOUT_CONTRACT.identityBytes) {
    return invalid("provider-invalid", "Auth logout provider identity must be from 1 through 256 UTF-8 bytes.");
  }
  return { provider, json };
}

function success(boundary: Boundary, request: Request, provider: string): void {
  const output = request.json
    ? Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.auth.logout", data: { provider, result: "completed" } })}\n`)
    : Buffer.from(`Logout completed for ${inertText(provider, AUTH_LOGOUT_CONTRACT.identityBytes).text}.\n`);
  if (output.length >= AUTH_LOGOUT_CONTRACT.resultBytes) throw new Error("The auth logout result exceeds its bound.");
  boundary.stdout(output);
}

function cancelled(): CliFailure {
  return failure("state-not-reached", "cancelled", "The authentication logout was cancelled.", 1, false);
}

function aborted(boundary: Boundary): boolean {
  return boundary.signal?.aborted === true;
}

function logoutFailed(provider: string): CliFailure {
  return failure("integrity-failed", "logout-failed", "The credential could not be removed safely.", 5, false, provider);
}

async function resolveProvider(request: Request, boundary: Boundary): Promise<Provider | CliFailure> {
  const lookup = boundary.authProvider;
  if (lookup === undefined) return failure("dependency-failed", "provider-catalog-unavailable",
    "The Pi provider catalog is unavailable.", 4, true);
  const found = await Promise.resolve().then(() => lookup(request.provider)).then(
    (value) => ({ value }), () => ({ unavailable: true as const }),
  );
  if ("unavailable" in found) return failure("dependency-failed", "provider-catalog-unavailable",
    "The Pi provider catalog is unavailable.", 4, true);
  const provider = found.value;
  if (provider === undefined) return invalid("provider-unknown",
    `No provider is called ${inertText(request.provider, AUTH_LOGOUT_CONTRACT.identityBytes).text}.`, request.provider);
  if (Buffer.byteLength(provider.id) === 0 || Buffer.byteLength(provider.id) > AUTH_LOGOUT_CONTRACT.identityBytes) {
    return invalid("provider-invalid", "The configured provider identity is outside the supported bound.");
  }
  return provider;
}

async function run(request: Request, boundary: Boundary): Promise<number> {
  if (aborted(boundary)) return emitFailure(boundary, cancelled(), request.json);
  const resolved = await resolveProvider(request, boundary);
  if (aborted(boundary)) return emitFailure(boundary, cancelled(), request.json);
  if ("code" in resolved) return emitFailure(boundary, resolved, request.json);
  boundary.beforeCredentialAccess?.();
  const create = boundary.authLogoutRuntime;
  if (create === undefined) return emitFailure(boundary, logoutFailed(resolved.id), request.json);
  const runtime = await Promise.resolve().then(create).then((value) => ({ value }), () => ({ failure: true as const }));
  if (aborted(boundary)) return emitFailure(boundary, cancelled(), request.json);
  if ("failure" in runtime) return emitFailure(boundary, logoutFailed(resolved.id), request.json);
  return Promise.resolve().then(() => runtime.value.logout(resolved.id,
    boundary.signal === undefined ? {} : { signal: boundary.signal })).then(
    () => { success(boundary, request, resolved.id); return 0; },
    (reason: unknown) => {
      const settlement = credentialSynchronizationSettlement(reason);
      if (settlement?.operation === "logout" && settlement.providerId === resolved.id) {
        success(boundary, request, resolved.id);
        return emitFailure(boundary, failure("integrity-failed", "synchronization-failed",
          "The credential was removed, but local authentication state could not be synchronized.",
          5, false, resolved.id), request.json);
      }
      if (aborted(boundary) || (reason instanceof DOMException && reason.name === "AbortError")) {
        return emitFailure(boundary, cancelled(), request.json);
      }
      return emitFailure(boundary, logoutFailed(resolved.id), request.json);
    },
  );
}

export function authLogoutCommand(args: readonly string[], boundary: Boundary): number | Promise<number> {
  const request = parse(args), json = args.some((word) => word === "--json" || word === "-j");
  return "code" in request ? emitFailure(boundary, request, json) : run(request, boundary);
}
