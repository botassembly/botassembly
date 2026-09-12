import type { AuthEvent, AuthInteraction, AuthPrompt, AuthType, Credential, Provider } from "@earendil-works/pi-ai";
import { ModelsError } from "@earendil-works/pi-ai";
import { credentialSynchronizationSettlement, type ModelRuntime } from "./model-runtime.ts";
import { jsonObject } from "./check.ts";
import { AUTH_LOGIN_CONTRACT } from "./cli-contract.ts";
import { inertText, newCommandFailure } from "./new-command-result.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  stdinIsTTY: boolean;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  readLine?: (hidden: boolean) => Promise<string>;
  authProvider?: (id: string) => Provider | undefined | Promise<Provider | undefined>;
  authRuntime?: () => Promise<ModelRuntime>;
  beforeCredentialAccess?: () => void;
  signal?: AbortSignal;
}

interface Request { provider: string; json: boolean }
interface ResolvedProvider { provider: Provider; type: AuthType }
class LoginCancelledError extends Error {}
class InteractionLimitError extends Error {}

function failure(code: CliFailure["code"], cause: string, message: string, exit: CliFailure["exit"],
  retryable: boolean, provider?: string): CliFailure {
  return { code, cause, message, retryable, details: provider === undefined ? {} : { provider }, exit };
}

function invalid(cause: string, message: string, provider?: string): CliFailure {
  return failure("request-invalid", cause, message, 2, false, provider);
}

function emitFailure(boundary: Boundary, held: CliFailure, json: boolean): number {
  const result = newCommandFailure("auth.login", held, json);
  boundary.stderr(result.stderr);
  return result.exit;
}

function parse(args: readonly string[]): Request | CliFailure {
  const modes = args.filter((word) => word === "--json" || word === "-j");
  const json = modes.length > 0;
  if (modes.length > 1) return invalid("option-repeated", "Auth login accepts one JSON mode flag.");
  const positionals = args.filter((word) => word !== "--json" && word !== "-j");
  const unknown = positionals.find((word) => word.startsWith("-"));
  if (unknown !== undefined) return invalid("option-unknown", `Auth login does not accept ${inertText(unknown, 256).text}.`);
  if (positionals.length !== 1) return invalid("arguments-invalid", "Auth login requires exactly one provider.");
  const provider = positionals[0] ?? "";
  const bytes = Buffer.byteLength(provider);
  if (bytes === 0 || bytes > AUTH_LOGIN_CONTRACT.identityBytes) {
    return invalid("provider-invalid", "Auth login provider identity must be from 1 through 256 UTF-8 bytes.");
  }
  return { provider, json };
}

function authType(provider: Provider): AuthType | undefined {
  if (provider.auth.oauth !== undefined) return "oauth";
  return provider.auth.apiKey?.login === undefined ? undefined : "api_key";
}

function rendered(value: string): string {
  const held = inertText(value, AUTH_LOGIN_CONTRACT.interactionBytes);
  if (held.omitted > 0) throw new InteractionLimitError();
  return held.text;
}

function eventText(event: AuthEvent): string {
  if (event.type === "auth_url") {
    return `Open this URL in a browser to sign in:\n${event.url}${event.instructions === undefined ? "" : `\n${event.instructions}`}`;
  }
  if (event.type === "device_code") {
    return `Open ${event.verificationUri} in a browser and enter this code:\n${event.userCode}`;
  }
  if (event.type === "info" && event.links !== undefined) {
    return [event.message, ...event.links.map((link) => `${link.label ?? "Link"}: ${link.url}`)].join("\n");
  }
  return event.message;
}

function promptText(prompt: AuthPrompt): string {
  if (prompt.type !== "select") return prompt.message;
  return [prompt.message, ...prompt.options.map((option, index) =>
    `  ${String(index + 1)}. ${option.label}${option.description === undefined ? "" : `: ${option.description}`}`),
  `Enter a number from 1 to ${String(prompt.options.length)}.`].join("\n");
}

function abortable<T>(work: Promise<T>, signals: readonly (AbortSignal | undefined)[]): Promise<T> {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      for (const signal of active) signal.removeEventListener("abort", stopped);
      action();
    };
    const stopped = (): void => { finish(() => { reject(new LoginCancelledError()); }); };
    for (const signal of active) signal.addEventListener("abort", stopped, { once: true });
    if (active.some((signal) => signal.aborted)) stopped();
    void work.then((value) => { finish(() => { resolve(value); }); }, (reason: unknown) => {
      finish(() => { reject(reason instanceof Error ? reason : new Error("The provider interaction failed.")); });
    });
  });
}

function interaction(boundary: Boundary): AuthInteraction {
  let count = 0, bytes = 0;
  const write = (raw: string): void => {
    count += 1;
    const line = `${rendered(raw)}\n`, next = bytes + Buffer.byteLength(line);
    if (count > AUTH_LOGIN_CONTRACT.interactionCount || next >= AUTH_LOGIN_CONTRACT.interactionTotalBytesExclusive) {
      throw new InteractionLimitError();
    }
    bytes = next;
    boundary.stderr(line);
  };
  return {
    ...(boundary.signal === undefined ? {} : { signal: boundary.signal }),
    notify: (event) => { write(eventText(event)); },
    prompt: (asked) => {
      if (asked.signal?.aborted === true || boundary.signal?.aborted === true) return Promise.reject(new LoginCancelledError());
      write(promptText(asked));
      const reading = boundary.readLine?.(asked.type === "secret");
      if (reading === undefined) return Promise.reject(new Error("The login terminal is unavailable."));
      return abortable(reading, [boundary.signal, asked.signal]).then((answer) => {
        if (asked.type !== "select") return answer;
        return asked.options[Number.parseInt(answer, 10) - 1]?.id ?? answer;
      });
    },
  };
}

function document(provider: string, credentialType: Credential["type"]): Buffer {
  return Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.auth.login", data: {
    provider, authenticated: true, credentialType,
  } })}\n`);
}

function success(boundary: Boundary, request: Request, provider: string, credentialType: Credential["type"]): void {
  const output = request.json ? document(provider, credentialType)
    : Buffer.from(`Signed in to ${inertText(provider, AUTH_LOGIN_CONTRACT.identityBytes).text}.\n`);
  if (output.length >= AUTH_LOGIN_CONTRACT.resultBytes) throw new Error("The auth login result exceeds its bound.");
  boundary.stdout(output);
}

function cancelled(): CliFailure {
  return failure("state-not-reached", "cancelled", "The authentication login was cancelled.", 1, false);
}

function rejected(reason: unknown, provider: string): CliFailure {
  if (reason instanceof LoginCancelledError || (reason instanceof DOMException && reason.name === "AbortError")) return cancelled();
  if (reason instanceof InteractionLimitError) {
    return failure("dependency-failed", "interaction-limit", "The provider interaction exceeded a safe output bound.", 4, false, provider);
  }
  if (reason instanceof ModelsError && reason.code === "auth") {
    return failure("integrity-failed", "login-failed", "The credential could not be stored safely.", 5, false, provider);
  }
  return failure("dependency-failed", "provider-failed", "The provider login failed.", 4, true, provider);
}

async function resolveProvider(request: Request, boundary: Boundary): Promise<ResolvedProvider | CliFailure> {
  const lookup = boundary.authProvider;
  if (lookup === undefined) return failure("dependency-failed", "provider-catalog-unavailable",
    "The Pi provider catalog is unavailable.", 4, true);
  const found = await Promise.resolve().then(() => lookup(request.provider)).then(
    (value) => ({ value }),
    () => ({ unavailable: true as const }),
  );
  if ("unavailable" in found) return failure("dependency-failed", "provider-catalog-unavailable",
    "The Pi provider catalog is unavailable.", 4, true);
  const provider = found.value;
  if (provider === undefined) return invalid("provider-unknown",
    `No provider is called ${inertText(request.provider, 256).text}.`, request.provider);
  if (Buffer.byteLength(provider.id) === 0 || Buffer.byteLength(provider.id) > AUTH_LOGIN_CONTRACT.identityBytes) {
    return invalid("provider-invalid", "The configured provider identity is outside the supported bound.");
  }
  const type = authType(provider);
  if (type === undefined) return invalid("provider-ambient-only",
    `Provider ${inertText(provider.id, 256).text} has no interactive login.`, provider.id);
  return { provider, type };
}

async function run(request: Request, boundary: Boundary): Promise<number> {
  if (boundary.signal?.aborted === true) return emitFailure(boundary, cancelled(), request.json);
  const resolved = await resolveProvider(request, boundary);
  if ("code" in resolved) return emitFailure(boundary, resolved, request.json);
  const { provider, type } = resolved;
  boundary.beforeCredentialAccess?.();
  const create = boundary.authRuntime;
  if (create === undefined) return emitFailure(boundary,
    failure("integrity-failed", "login-failed", "The credential could not be stored safely.", 5, false, provider.id), request.json);
  const runtime = await Promise.resolve().then(create).then((value) => ({ value }), () => ({ failure: true as const }));
  if ("failure" in runtime) return emitFailure(boundary,
    failure("integrity-failed", "login-failed", "The credential could not be stored safely.", 5, false, provider.id), request.json);
  return Promise.resolve().then(() => runtime.value.login(provider.id, type, interaction(boundary))).then(
    (credential) => { success(boundary, request, provider.id, credential.type); return 0; },
    (reason: unknown) => {
      const settlement = credentialSynchronizationSettlement(reason);
      const credentialType = settlement?.operation === "login" && settlement.providerId === provider.id ? settlement.credentialType : undefined;
      if (credentialType !== undefined) {
        success(boundary, request, provider.id, credentialType);
        return emitFailure(boundary, failure("integrity-failed", "synchronization-failed",
          "The credential was stored, but local authentication state could not be synchronized.", 5, false, provider.id), request.json);
      }
      if (boundary.signal?.aborted === true) return emitFailure(boundary, cancelled(), request.json);
      return emitFailure(boundary, rejected(reason, provider.id), request.json);
    },
  );
}

export function authLoginCommand(args: readonly string[], boundary: Boundary): number | Promise<number> {
  const request = parse(args), json = args.some((word) => word === "--json" || word === "-j");
  if ("code" in request) return emitFailure(boundary, request, json);
  if (!boundary.stdinIsTTY) return emitFailure(boundary,
    invalid("terminal-required", "Auth login requires an interactive terminal.", request.provider), request.json);
  return run(request, boundary);
}
