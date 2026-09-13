import {
  AgentHarness as PiAgentHarness,
  JSONL_STORAGE_VERSION,
  JsonlSessionRepo,
  MemorySessionRepo,
  TODO_CONTEXT,
  FileError,
  HarnessFault,
  createBashTool as createPiBashTool,
  createEditTool as createPiEditTool,
  createReadTool as createPiReadTool,
  createWriteTool as createPiWriteTool,
  withAbortSignal,
  type AgentHarnessTool as PiHarnessTool,
  type AgentHarnessToolInvocation,
  type Context as PiContext,
  type ExecutionEnv as PiExecutionEnvironment,
  type JsonlSessionMetadata,
  type Session,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv as PiNodeExecutionEnvironment } from "@earendil-works/pi-agent-core/node";
import { mkdir, open as openFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Api, AssistantMessage, ImageContent, Model, Models, Static, TextContent, ThinkingLevel, TSchema, Usage } from "@earendil-works/pi-ai";
import { streamSelectedModel } from "./credentials.ts";
import { compactJson } from "./record.ts";

export type HarnessResult<Value, Failure> = { ok: true; value: Value } | { ok: false; error: Failure };
export { FileError };
export const HARNESS_CONTEXT = TODO_CONTEXT;
export type ChordContext = PiContext;
export const ok = <Value, Failure>(value: Value): HarnessResult<Value, Failure> => ({ ok: true, value });
export const err = <Value, Failure>(error: Failure): HarnessResult<Value, Failure> => ({ ok: false, error });

export type ExecutionEnvironment = PiExecutionEnvironment;
export interface ExecutionToolContext { env: ExecutionEnvironment }
export class NodeExecutionEnvironment extends PiNodeExecutionEnvironment implements ExecutionEnvironment {}

interface HarnessToolResult<Details> {
  content: (TextContent | ImageContent)[];
  details: Details;
  usage?: Usage;
  addedToolNames?: string[];
  terminate?: boolean;
}

type HarnessToolUpdate<Details> = (partial: HarnessToolResult<Details>) => void;

export interface HarnessTool<Context extends object, Parameters extends TSchema = TSchema, Details = unknown> {
  name: string;
  label: string;
  description: string;
  parameters: Parameters;
  executionMode?: "sequential" | "parallel";
  prepareArguments?: (args: unknown) => Static<Parameters>;
  execute(id: string, params: Static<Parameters>, signal: AbortSignal | undefined, update: HarnessToolUpdate<Details> | undefined, context: Context): Promise<HarnessToolResult<Details>>;
}

interface BashExecution {
  command: string;
  cwd: string;
  env: Record<string, string>;
  inheritEnv: boolean;
}

export interface BashToolOptions<Context extends ExecutionToolContext> {
  commandPrefix?: string;
  prepare?: (execution: BashExecution, context: Context, signal?: AbortSignal) => void | Promise<void>;
}

const piTools = new WeakMap<object, PiHarnessTool<object>>();
function directInvocation(id: string): AgentHarnessToolInvocation {
  return { invocationId: id, operationId: id, turnId: id, getMemo: () => Promise.resolve(undefined), setMemo: () => Promise.resolve() };
}
function adaptedPiTool<Context extends object, Parameters extends TSchema, Details>(tool: PiHarnessTool<Context, Parameters, Details>): HarnessTool<Context, Parameters, Details> {
  const adapted: HarnessTool<Context, Parameters, Details> = {
    name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters,
    ...(tool.executionMode === undefined ? {} : { executionMode: tool.executionMode }),
    ...(tool.prepareArguments === undefined ? {} : { prepareArguments: tool.prepareArguments }),
    execute: (id, params, signal, update, context) => tool.execute(id, params, update ?? (() => undefined), context, directInvocation(id), signal === undefined ? TODO_CONTEXT : withAbortSignal(signal, TODO_CONTEXT)),
  };
  piTools.set(adapted, tool);
  return adapted;
}

export function createReadTool<Context extends ExecutionToolContext>(): HarnessTool<Context> {
  return adaptedPiTool(createPiReadTool<Context>());
}

export function createWriteTool<Context extends ExecutionToolContext>(): HarnessTool<Context> {
  const tool = createPiWriteTool<Context>();
  return adaptedPiTool({
    ...tool,
    async execute(id, params, update, context, invocation, chord) {
      const result = await tool.execute(id, params, update, context, invocation, chord);
      const written = result.content.length === 1 && result.content[0]?.type === "text" && result.content[0].text === `Successfully wrote to ${params.path}`;
      if (!written) return result;
      return { ...result, content: [{ type: "text", text: `Successfully wrote ${String(Buffer.byteLength(params.content))} bytes to ${params.path}` }] };
    },
  });
}

export function createEditTool<Context extends ExecutionToolContext>(): HarnessTool<Context> {
  return adaptedPiTool(createPiEditTool<Context>());
}

export function createBashTool<Context extends ExecutionToolContext>(options?: BashToolOptions<Context>): HarnessTool<Context> {
  const piOptions = options === undefined ? undefined : {
    ...(options.commandPrefix === undefined ? {} : { commandPrefix: options.commandPrefix }),
    ...(options.prepare === undefined ? {} : { prepare: (execution: BashExecution, context: Context, chord: PiContext) => options.prepare?.(execution, context, chord.abortSignal) }),
  };
  return adaptedPiTool(createPiBashTool<Context>(piOptions));
}

export type HarnessMessage = AssistantMessage | { role: string };
export type HarnessEvent =
  | { type: "turn_start" }
  | { type: "turn_end"; message: HarnessMessage }
  | { type: "message_update" }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

interface ProviderRequestEvent { model: { provider: string; id: string } }
interface ToolResultEvent { details: unknown }

export interface Harness<Context extends object> {
  prompt(text: string): Promise<AssistantMessage>;
  abort(): Promise<void>;
  getTools(): HarnessTool<Context>[];
  getActiveTools(): HarnessTool<Context>[];
  setActiveTools(names: string[]): Promise<void>;
  subscribe(listener: (event: HarnessEvent) => Promise<void> | void): () => void;
  beforeProviderRequest(listener: (event: ProviderRequestEvent) => Promise<void> | void): () => void;
  beforeAgentStart(listener: () => Promise<void> | void): () => void;
  changeToolResult(listener: (event: ToolResultEvent) => { isError?: boolean }): () => void;
  waitForIdle(): Promise<void>;
  close(): Promise<void>;
}

export class HarnessCloseError extends Error {
  constructor(reason: unknown) {
    super(reason instanceof Error ? reason.message : "The harness could not close.", { cause: reason });
    this.name = "HarnessCloseError";
  }
}

function faultMessages(reason: Error): string[] {
  const messages: string[] = [];
  let current: unknown = reason;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages;
}

function error(reason: unknown): Error {
  if (reason instanceof HarnessFault) return new Error(`HarnessFault: ${faultMessages(reason).join(": ")}`, { cause: reason });
  return reason instanceof Error ? reason : new Error("The harness failed with a non-Error value.", { cause: reason });
}

function normalized<Value>(operation: Promise<Value>): Promise<Value> {
  return operation.catch((reason: unknown) => Promise.reject(error(reason)));
}

async function latestAssistant(session: Session, tipId: string | null, boundary: string | null): Promise<AssistantMessage | undefined> {
  let entryId = tipId;
  while (entryId !== null && entryId !== boundary) {
    const entry = (await session.getEntries([entryId], TODO_CONTEXT)).get(entryId);
    if (entry === undefined) return undefined;
    if (entry.type === "message" && "stopReason" in entry.message) return entry.message;
    entryId = entry.parentId;
  }
  return undefined;
}

function normalizedEvent(event: import("@earendil-works/pi-agent-core").HarnessEvent): HarnessEvent | undefined {
  if (event.type === "turn_start") return { type: event.type };
  if (event.type === "turn_end") return { type: event.type, message: event.message };
  if (event.type === "message_update") return { type: event.type };
  if (event.type === "tool_start") return { type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args };
  if (event.type === "tool_end") return { type: "tool_execution_end", toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError };
  return undefined;
}

class PiHarness<Context extends object> implements Harness<Context> {
  readonly #inner: Promise<{ harness: import("@earendil-works/pi-agent-core").AgentHarness<Context>; session: Session }>;
  readonly #tools: HarnessTool<Context>[];
  readonly #cleanup: () => Promise<void>;
  readonly #removers = new Set<() => void>();
  readonly #inflight = new Set<Promise<void>>();
  #activeTools: string[];
  #promptActive = false;
  #promptPending: Promise<void> | undefined;
  #abortPending: Promise<void> | undefined;
  #closing: Promise<void> | undefined;

  constructor(inner: Promise<{ harness: import("@earendil-works/pi-agent-core").AgentHarness<Context>; session: Session }>, tools: HarnessTool<Context>[], cleanup: () => Promise<void>) {
    this.#inner = inner;
    this.#tools = tools;
    this.#cleanup = cleanup;
    this.#activeTools = tools.map((tool) => tool.name);
  }

  prompt(text: string): Promise<AssistantMessage> {
    if (this.#closing !== undefined) return Promise.reject(new Error("The harness is closed."));
    this.#promptActive = true;
    const operation = this.#inner.then(async ({ harness, session }) => {
      const delivered = new Set<string>();
      let wanted: string | undefined;
      let publish = (): void => undefined;
      const delivery = new Promise<void>((resolve) => { publish = resolve; });
      const remove = harness.events.on("turn_end", (event) => {
        const key = `${event.runId}:${String(event.message.timestamp)}`;
        delivered.add(key);
        if (key === wanted) publish();
      });
      try {
        const lane = await harness.lane("main", TODO_CONTEXT);
        const result = await lane.prompt(text, undefined, TODO_CONTEXT);
        if (!result.ok) throw result.error;
        if (result.value.status === "suspended") throw new Error("The harness suspended before producing an assistant message.");
        const message = await latestAssistant(session, result.value.tipId, result.value.fromTipId);
        if (message === undefined) throw new Error(result.value.error?.message ?? "The harness completed without an assistant message.");
        wanted = `${result.value.operationId}:${String(message.timestamp)}`;
        if (!delivered.has(wanted)) await delivery;
        return message;
      } finally {
        remove();
      }
    });
    this.#promptPending = operation.then(() => undefined, () => undefined);
    return operation.then(
      (message) => { this.#promptActive = false; return message; },
      (reason: unknown) => { this.#promptActive = false; return Promise.reject(error(reason)); },
    );
  }

  abort(): Promise<void> {
    const operation = normalized(this.#inner.then(async ({ harness }) => { await (await harness.lane("main", TODO_CONTEXT)).abort(TODO_CONTEXT); }));
    this.#abortPending = operation;
    void operation.then(
      () => { if (this.#abortPending === operation) this.#abortPending = undefined; },
      () => { if (this.#abortPending === operation) this.#abortPending = undefined; },
    );
    return operation;
  }
  getTools(): HarnessTool<Context>[] { return [...this.#tools]; }
  getActiveTools(): HarnessTool<Context>[] { const names = new Set(this.#activeTools); return this.#tools.filter((tool) => names.has(tool.name)); }
  setActiveTools(names: string[]): Promise<void> {
    return normalized(this.#inner.then(async ({ harness }) => { await (await harness.lane("main", TODO_CONTEXT)).setActiveTools(names, TODO_CONTEXT); this.#activeTools = [...names]; }));
  }

  #ownedRemover(remove: () => void): () => void {
    let live = true;
    const held = (): void => { if (!live) return; live = false; this.#removers.delete(held); remove(); };
    this.#removers.add(held);
    return held;
  }

  #track(operation: Promise<void>): Promise<void> {
    const settled = operation.then(() => undefined, () => undefined);
    this.#inflight.add(settled);
    void settled.then(() => this.#inflight.delete(settled));
    return operation;
  }

  #deferredRemover(register: (inner: import("@earendil-works/pi-agent-core").AgentHarness<Context>) => () => void): () => void {
    let remove: (() => void) | undefined;
    let live = true;
    const held = this.#ownedRemover(() => { live = false; remove?.(); });
    void this.#inner.then(({ harness }) => { const made = register(harness); if (live) remove = made; else made(); }, () => undefined);
    return held;
  }

  subscribe(listener: (event: HarnessEvent) => Promise<void> | void): () => void {
    return this.#deferredRemover((inner) => {
      const names = ["turn_start", "turn_end", "message_update", "tool_start", "tool_end"] as const;
      const removers = names.map((name) => inner.events.on(name, (event) => { const normalized = normalizedEvent(event); return normalized === undefined ? undefined : this.#track(Promise.resolve(listener(normalized))); }));
      return () => { for (const remove of removers) remove(); };
    });
  }

  beforeProviderRequest(listener: (event: ProviderRequestEvent) => Promise<void> | void): () => void {
    return this.#deferredRemover((inner) => inner.hooks.on("before_request", (event) => Promise.resolve(listener({ model: event.model })).then(() => undefined)));
  }

  beforeAgentStart(listener: () => Promise<void> | void): () => void {
    return this.#deferredRemover((inner) => inner.hooks.on("before_run", () => Promise.resolve(listener()).then(() => undefined)));
  }

  changeToolResult(listener: (event: ToolResultEvent) => { isError?: boolean }): () => void {
    return this.#deferredRemover((inner) => inner.hooks.on("after_tool", (event) => listener({ details: event.details })));
  }

  waitForIdle(): Promise<void> {
    if (this.#closing !== undefined) return Promise.all([this.#promptPending ?? Promise.resolve(), ...this.#inflight]).then(() => undefined);
    return normalized(this.#inner.then(async ({ harness }) => (await harness.lane("main", TODO_CONTEXT)).waitForIdle(TODO_CONTEXT)));
  }

  async #close(): Promise<void> {
    for (const remove of [...this.#removers]) remove();
    if (this.#promptActive && this.#abortPending === undefined) {
      await this.abort().then(() => undefined, () => undefined);
      await this.#promptPending;
    }
    await Promise.all(this.#inflight);
    if (this.#promptActive) {
      void this.#inner.then(({ harness }) => harness.close(TODO_CONTEXT)).then(() => undefined, () => undefined);
      const [cleanupResult] = await Promise.allSettled([this.#cleanup()]);
      if (cleanupResult.status === "rejected") throw new HarnessCloseError(cleanupResult.reason);
      return;
    }
    const [sessionResult, cleanupResult] = await Promise.allSettled([
      this.#inner.then(({ session }) => session.close(TODO_CONTEXT)), this.#cleanup(),
    ]);
    if (cleanupResult.status === "rejected") throw new HarnessCloseError(cleanupResult.reason);
    if (sessionResult.status === "rejected") throw new HarnessCloseError(sessionResult.reason);
  }

  close(): Promise<void> {
    this.#closing ??= this.#close();
    return this.#closing;
  }
}

export interface CreateHarnessInput<Context extends object> {
  execution: ExecutionEnvironment;
  sessionFile: string;
  session: { cwd: string; id: string; createdAt: number };
  models: Models;
  model: Model<Api>;
  thinkingLevel?: ThinkingLevel;
  systemPrompt: string;
  tools: HarnessTool<Context>[];
  context: Context;
}

export type CreateMemoryHarnessInput<Context extends object> = Omit<CreateHarnessInput<Context>, "execution" | "sessionFile" | "session">;
export interface PreparedHarness {
  create<Context extends object>(input: CreateMemoryHarnessInput<Context>): Harness<Context>;
  close(): Promise<void>;
}

function bindTool<Context extends object, Parameters extends TSchema>(tool: HarnessTool<Context, Parameters>, context: Context): PiHarnessTool<Context, Parameters> {
  const native = piTools.get(tool);
  return {
    name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters,
    ...(tool.executionMode === undefined ? {} : { executionMode: tool.executionMode }),
    ...(tool.prepareArguments === undefined ? {} : { prepareArguments: tool.prepareArguments }),
    execute: (id, params, update, _toolContext, invocation, chord) => native === undefined ? tool.execute(id, params, chord.abortSignal, update, context) : native.execute(id, params, update, context, invocation, chord),
  };
}

function selectedModels(models: Models, model: Model<Api>, requestModel: Model<Api> = model): Models {
  return new Proxy(models, { get(target, property) {
    if (property === "getModel") return (provider: string, id: string) => provider === model.provider && id === model.id ? model : target.getModel(provider, id);
    if (property === "getModels") return () => target.getModels().map((held) => held.provider === model.provider && held.id === model.id ? model : held);
    if (property === "streamSimple") return (...args: Parameters<Models["streamSimple"]>) => streamSelectedModel(target, requestModel, args[1], args[2]);
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === "function" ? (...args: unknown[]): unknown => { const result: unknown = Reflect.apply(value, target, args); return result; } : value;
  } });
}

function assembledHarness<Context extends object>(input: CreateMemoryHarnessInput<Context>, session: Promise<Session> | Session, cleanup: () => Promise<void>): Harness<Context> {
  const tools = input.tools.map((tool) => bindTool(tool, input.context));
  // Pi treats every short length stop as context overflow. Bot owns length continuation, so Pi sees no overflow ceiling while the provider still receives the real model.
  const harnessModel = new Proxy(input.model, { get: (target, property, receiver): unknown => {
    if (property === "maxTokens") return 0;
    const value: unknown = Reflect.get(target, property, receiver);
    return value;
  } });
  const inner = Promise.resolve(session).then(async (held) => { const created = await PiAgentHarness.create({ session: held, models: selectedModels(input.models, harnessModel, input.model), model: harnessModel, systemPrompt: input.systemPrompt, tools, toolContext: input.context, retry: { enabled: false, maxRetries: 0, baseDelayMs: 0 }, streamOptions: { maxRetries: 0 }, ...(input.thinkingLevel === undefined ? {} : { thinkingLevel: input.thinkingLevel }) }, TODO_CONTEXT); return { harness: created.harness, session: held }; });
  return new PiHarness(inner, input.tools, cleanup);
}

function once(operation: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => { pending ??= operation(); return pending; };
}

export function createMemoryHarness<Context extends object>(input: CreateMemoryHarnessInput<Context>, cleanup: () => Promise<void> = () => Promise.resolve()): Harness<Context> {
  const repo = new MemorySessionRepo();
  return assembledHarness(input, repo.create({ id: "bot-memory" }, TODO_CONTEXT), cleanup);
}

export function createSessionHarness<Context extends object>(input: CreateMemoryHarnessInput<Context>, session: Session): Harness<Context> {
  return assembledHarness(input, session, () => Promise.resolve());
}

export async function prepareHarness(execution: ExecutionEnvironment, sessionFile: string, session: { cwd: string; id: string; createdAt: number }): Promise<PreparedHarness> {
  const cleanup = once(() => execution.cleanup(TODO_CONTEXT));
  const createdAt = session.createdAt;
  const header = `${compactJson({ v: 4, kind: "header", id: session.id, storageVersion: JSONL_STORAGE_VERSION, createdAt, cwd: session.cwd })}\n`;
  const prepared = mkdir(dirname(sessionFile), { recursive: true }).then(() => openFile(sessionFile, "wx")).then(async (file): Promise<PreparedHarness> => {
    await file.writeFile(header, "utf8").then(() => file.close(), (reason: unknown) => file.close().then(() => Promise.reject(error(reason))));
    const repo = new JsonlSessionRepo({ fileSystem: execution, sessionsRoot: dirname(sessionFile) });
    const metadata: JsonlSessionMetadata = { id: session.id, storageVersion: JSONL_STORAGE_VERSION, createdAt, modifiedAt: createdAt, cwd: session.cwd, path: sessionFile };
    const held = await repo.open(metadata, TODO_CONTEXT);
    const close = once(async () => { await held.close(TODO_CONTEXT); await cleanup(); });
    return { create: (input) => assembledHarness(input, held, cleanup), close };
  });
  return prepared.then(
    (value) => value,
    (reason: unknown) => cleanup().then(() => Promise.reject(error(reason)), (cleanupReason: unknown) => Promise.reject(new HarnessCloseError(cleanupReason))),
  );
}

export async function createHarness<Context extends object>(input: CreateHarnessInput<Context>): Promise<Harness<Context>> {
  const prepared = await prepareHarness(input.execution, input.sessionFile, input.session);
  const construction = Promise.resolve().then(() => prepared.create(input));
  return construction.then((harness) => harness, (reason: unknown) => prepared.close().then(() => Promise.reject(error(reason)), (cleanupReason: unknown) => Promise.reject(new HarnessCloseError(cleanupReason))));
}
