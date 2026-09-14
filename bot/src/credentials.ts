// The retired conforming CredentialStore remains readable for rollback and the
// later migration ticket, but no live provider is wired to it. The lock protocol is identical to pi-coding-agent's
// FileAuthStorageBackend: proper-lockfile lockSync on the credential file's own
// path, realpath false, retry on ELOCKED — so this store and the interactive
// `pi` CLI cannot clobber each other's rotations.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { lockSync } from "proper-lockfile";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { createAssistantMessageEventStream, isRetryableAssistantError, type Api, type AssistantMessage, type AssistantMessageEvent, type AssistantMessageEventStream, type AuthContext, type Context, type Credential, type CredentialStore, type Model, type Models, type ModelsSimpleStreamOptions, type MutableModels } from "@earendil-works/pi-ai";
import { OWNER_ONLY, errorCode, mapping } from "./model.ts";
import { jsonValue } from "./schema-check.ts";
import type { DriverClock } from "./process.ts";
import { providerRetryEvent, type StageIdentity } from "./record-events.ts";
import { prettyJson, type RecordWriter } from "./record.ts";
import { boundedText } from "./new-command-result.ts";
import { CREDENTIAL_ENVIRONMENT_NAMES } from "./credential-environment.ts";

const LOCK_ATTEMPTS = 51; // 50 sleeps x 20ms = a 1s budget, 6.8x the worst hold measured under full-suite load (worst 147ms, median 105ms, 41 samples, 2026-08-06, ticket 0160).
const LOCK_RETRY_MS = 20; // The budget is bought with attempts, not delay: every measured acquire landed within one poll of release, and a coarser sleep would slow the common contended case to buy the same ceiling.

function providerEnv(value: unknown): value is Record<string, string> | undefined {
  return value === undefined || (mapping(value) && Object.values(value).every((held) => typeof held === "string"));
}
function apiKeyShaped(value: Record<string, unknown>): Credential | undefined {
  if (value.type !== "api_key" || (value.key !== undefined && typeof value.key !== "string") || !providerEnv(value.env)) return undefined;
  return { type: value.type, ...(value.key === undefined ? {} : { key: value.key }), ...(value.env === undefined ? {} : { env: value.env }) };
}
function oauthShaped(value: Record<string, unknown>): Credential | undefined {
  if (value.type !== "oauth" || typeof value.refresh !== "string" || typeof value.access !== "string" || typeof value.expires !== "number") return undefined;
  return { ...value, type: value.type, refresh: value.refresh, access: value.access, expires: value.expires };
}
function shaped(path: string, providerId: string, value: unknown): Credential {
  const held = mapping(value) ? apiKeyShaped(value) ?? oauthShaped(value) : undefined;
  if (held === undefined) throw new Error(`Credential for ${providerId} in ${path} is not a pi-ai credential shape.`);
  return held;
}
// Every sentence a torn credential file earns is the store's own, in one
// family, said the same way wherever the store is read — `bot auth import`'s
// refusal and bot's own file failing a run alike. The parse is the runtime's
// one JSON boundary (schema-check.ts) precisely so Node's "Expected property
// name or '}' at position 1" never reaches a person (ticket 0144's audit,
// 0128's defect class).
function readAll(path: string): Record<string, Credential> {
  if (!existsSync(path)) return {};
  const parsed = jsonValue(readFileSync(path));
  if ("error" in parsed) throw new Error(`Credential file ${path} is not JSON.`);
  if (!mapping(parsed.value)) throw new Error(`Credential file ${path} is not a JSON object of providers.`);
  return Object.fromEntries(Object.entries(parsed.value).map(([providerId, value]) => [providerId, shaped(path, providerId, value)]));
}
function acquire(path: string, clock: DriverClock, attempt: number): Promise<() => void> {
  return new Promise<() => void>((grant) => { grant(lockSync(path, { realpath: false })); }).then(
    undefined,
    (reason: unknown) => {
      if (errorCode(reason) !== "ELOCKED" || attempt >= LOCK_ATTEMPTS) throw reason;
      return new Promise<void>((wake) => clock.setTimeout(wake, LOCK_RETRY_MS)).then(() => acquire(path, clock, attempt + 1));
    },
  );
}

function write(path: string, data: Record<string, Credential>): void {
  // Atomic for lockless readers (0029 B5): temp file in the SAME directory,
  // permissions settled before the rename makes it the credential file.
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, prettyJson(data), { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

export function fileCredentialStore(path: string, clock: DriverClock): CredentialStore {
  let tail: Promise<unknown> = Promise.resolve();
  // One in-process write queue (stricter than the interface's per-provider
  // minimum) around the cross-process file lock.
  const locked = <T,>(task: (data: Record<string, Credential>) => Promise<T>): Promise<T> => {
    const turn = tail.then(async () => {
      // A write settles its own directory, and settles it before the lock file,
      // which is the first thing that wants it. Owner-only like the home
      // (home.md): bot's credential directory is nobody else's to traverse, and
      // a store that only ever reads makes nothing at all.
      mkdirSync(dirname(path), { recursive: true, mode: OWNER_ONLY });
      const release = await acquire(path, clock, 1);
      try {
        return await task(readAll(path));
      } finally {
        release();
      }
    });
    tail = turn.then(() => undefined, () => undefined);
    return turn;
  };
  return {
    read: (providerId) => Promise.resolve().then(() => readAll(path)[providerId]),
    list: () => Promise.resolve().then(() => Object.entries(readAll(path)).map(([providerId, held]) => ({ providerId, type: held.type }))),
    modify: (providerId, fn) => locked(async (data) => {
      const next = await fn(data[providerId]);
      if (next !== undefined) write(path, { ...data, [providerId]: next });
      return next ?? data[providerId];
    }),
    delete: (providerId) => locked((data) => {
      if (providerId in data) write(path, Object.fromEntries(Object.entries(data).filter(([held]) => held !== providerId)));
      return Promise.resolve();
    }),
  };
}

// Pi's default auth context reads ambient `process.env` for provider key names
// and probes for credential FILES on its own — the Vertex
// path checks `~/.config/gcloud/application_default_credentials.json` — so
// `getAvailable()`, which since ticket 0128 is what the refusals name the
// configured providers from, was answering about the machine rather than about
// this run. Env-var auth is kept and scrubbed: a documented provider key works
// exactly as documented, because the injected environment is where it is
// looked up, and Pi's own emptiness rule is kept with it (a blank value is not
// a configured one). File existence answers false, always: bot's credentials
// come from bot's own file at its one fixed path and from this snapshot (ADR
// 0017), and from nowhere else on the machine — so an ambient credential file
// is not this run's to find, whoever put it there.
export function snapshotAuthContext(env: NodeJS.ProcessEnv): AuthContext {
  return {
    env: (name) => {
      const value = CREDENTIAL_ENVIRONMENT_NAMES.has(name) ? env[name] : undefined;
      return Promise.resolve(typeof value === "string" && value.trim().length > 0 ? value : undefined);
    },
    fileExists: () => Promise.resolve(false),
  };
}
export function scrubCredentialEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed = { ...env };
  for (const name of CREDENTIAL_ENVIRONMENT_NAMES) Reflect.deleteProperty(scrubbed, name);
  return scrubbed;
}
// Directly injected compatibility runtimes preserve supported environment
// authentication. Production commands use Pi's shared ModelRuntime instead.
const PROVIDER_RETRIES = 2;
const PROVIDER_RETRY_DELAY_MS = 1_000;
const PROVIDER_RETRY: unique symbol = Symbol("provider retry context");
export interface ProviderRetryContext { writer: RecordWriter; identity: StageIdentity; clock: DriverClock; now: () => string; rung: string }
type RetryingModel = Model<Api> & { [PROVIDER_RETRY]: ProviderRetryContext };

export function retryModel<T extends Model<Api>>(model: T, context: ProviderRetryContext): T & RetryingModel {
  return { ...model, [PROVIDER_RETRY]: { ...context } };
}
function retried(model: Model<Api>): model is RetryingModel {
  return PROVIDER_RETRY in model;
}
function retryContext(model: Model<Api>): ProviderRetryContext | undefined {
  return retried(model) ? model[PROVIDER_RETRY] : undefined;
}
function pause(clock: DriverClock, milliseconds: number, signal: AbortSignal | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    let finish = (_retry: boolean): void => undefined;
    const abort = (): void => { finish(false); };
    const timer = clock.setTimeout(() => { finish(true); }, milliseconds);
    finish = (retry: boolean): void => {
      clock.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(retry);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted === true) abort();
  });
}
function zeroUsage(message: AssistantMessage): boolean {
  const { input, output, cacheRead, cacheWrite } = message.usage;
  return input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0;
}
function retryable(message: AssistantMessage, attempt: number, signal: AbortSignal | undefined): boolean {
  return attempt < PROVIDER_RETRIES && signal?.aborted !== true && message.stopReason === "error" && isRetryableAssistantError(message) && zeroUsage(message);
}
function finishStream(output: AssistantMessageEventStream, events: AssistantMessageEvent[], message: AssistantMessage): void {
  for (const event of events) output.push(event);
  output.end(message);
}
// Bot authors this reason rather than passing the provider's string on alone
// (ticket 0283): the model, the rung it resolved from, and the provider are
// Bot's own facts, and a reader who sees only "OpenAI API error (401)" learns
// none of them. The provider's own status and text are quoted whole inside it,
// because repeating what the provider said is the only honest account of why
// it refused. A throw that is not an Error carries no account at all, so that
// one says the call failed before an answer and asks for a retry.
function providerReport(reason: Error): string {
  let message = reason.message;
  const cause = reason.cause;
  if (mapping(cause)) {
    if (typeof cause.message === "string" && cause.message.length > 0) {
      message += `: ${cause.message}`;
      if (typeof cause.code === "string" && cause.code.length > 0) message += ` [${cause.code}]`;
    }
  }
  return message;
}
function providerFailureReason(model: Model<Api>, rung: string, reason: unknown): string {
  const origin = `Model ${model.id} resolves from the ${rung} rung.`;
  return boundedText(reason instanceof Error
    ? `${origin} Provider ${model.provider} refused the call and reported: ${providerReport(reason)}. Act on that report, then run the flow again.`
    : `${origin} The call to provider ${model.provider} failed before an answer arrived. Run the flow again.`);
}
function failedMessage(model: Model<Api>, errorMessage: string): AssistantMessage {
  return {
    role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "error", errorMessage, timestamp: 0,
  };
}
async function collect(call: () => AssistantMessageEventStream): Promise<{ events: AssistantMessageEvent[]; message: AssistantMessage }> {
  const input = call();
  const events: AssistantMessageEvent[] = [];
  for await (const event of input) events.push(event);
  return { events, message: await input.result() };
}
// The two throws this stream can see are told apart, because only one of them
// is the provider's (ticket 0283). A throw out of the CALL is the provider
// failing and earns the authored sentence above; a throw out of the retry
// bookkeeping is bot's own record append failing, and dressing that as a
// provider refusal would name the wrong thing to fix.
function retryStream(call: () => AssistantMessageEventStream, model: Model<Api>, reporting: ProviderRetryContext, signal: AbortSignal | undefined): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  const provider = (reason: unknown): void => {
    output.push({ type: "error", reason: "error", error: failedMessage(model, providerFailureReason(model, reporting.rung, reason)) });
  };
  const run = async (): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      const attempted = await collect(call).then((held) => ({ held }), (reason: unknown) => ({ reason }));
      if ("reason" in attempted) { provider(attempted.reason); return; }
      const { events, message } = attempted.held;
      if (!retryable(message, attempt, signal)) { finishStream(output, events, message); return; }
      const delayMs = PROVIDER_RETRY_DELAY_MS * 2 ** attempt;
      await reporting.writer.append(providerRetryEvent({ ts: reporting.now(), identity: reporting.identity, attempt: attempt + 1, delayMs }));
      if (!await pause(reporting.clock, delayMs, signal)) { finishStream(output, events, message); return; }
    }
  };
  void run().then(undefined, (reason: unknown) => {
    output.push({ type: "error", reason: "error", error: failedMessage(model, boundedText(reason instanceof Error ? reason.message : "The provider retry bookkeeping failed with a non-Error value.")) });
  });
  return output;
}
export function streamSelectedModel(models: Models, model: Model<Api>, context: Context, options?: ModelsSimpleStreamOptions): AssistantMessageEventStream {
  const requestOptions = model.provider === "openai-codex"
    ? { ...options, transport: "websocket" as const }
    : options;
  const reporting = retryContext(model);
  if (reporting === undefined) return models.streamSimple(model, context, requestOptions);
  return retryStream(() => models.streamSimple(model, context, requestOptions), model, reporting, requestOptions?.signal);
}
export function providerModels(env: NodeJS.ProcessEnv, _clock: DriverClock): MutableModels {
  return builtinModels({ authContext: snapshotAuthContext(env) });
}
