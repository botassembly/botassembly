import { Type, type Static } from "@earendil-works/pi-ai";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FANOUT_MAX } from "./model.ts";
import {
  FileError, NodeExecutionEnvironment, createBashTool, createEditTool, createReadTool, createWriteTool, err, ok,
  HARNESS_CONTEXT, type ChordContext, type ExecutionEnvironment, type ExecutionToolContext, type HarnessResult, type HarnessTool,
} from "./harness.ts";
import type { Cause } from "./spine.ts";

interface ChecklistItem {
  text: string;
  state: "todo" | "done" | "skipped";
  reason?: string;
}

export interface ControlContext {
  checklist: ChecklistItem[];
  alternatives: readonly string[];
  refusal?: { reason: string };
  fault?: { reason: string };
  continuation?: { answer: "continue" | "stop"; reason: string };
  selection?: { name: string; reason: string };
}

export function createControlContext(
  checklist: readonly string[], alternatives: readonly string[], env: ExecutionEnvironment,
): ControlContext & ExecutionToolContext;
export function createControlContext(
  checklist?: readonly string[], alternatives?: readonly string[], env?: undefined,
): ControlContext;
export function createControlContext(
  checklist: readonly string[] = [],
  alternatives: readonly string[] = [],
  env?: ExecutionEnvironment,
): ControlContext | (ControlContext & ExecutionToolContext) {
  const context: ControlContext = {
    checklist: checklist.map((text) => ({ text, state: "todo" })),
    alternatives: [...alternatives],
  };
  return env === undefined ? context : { ...context, env };
}

const markParameters = Type.Object({
  item: Type.Integer({ minimum: 1, description: "The checklist item's 1-based number." }),
  state: Type.Union([Type.Literal("done"), Type.Literal("skipped")]),
  evidence: Type.String({ minLength: 1, description: "Required evidence for this mark." }),
  reason: Type.Optional(Type.String({ description: "Required when state is skipped." })),
});

const reasonParameters = Type.Object({
  reason: Type.String({ minLength: 1 }),
});

const continueParameters = Type.Object({
  answer: Type.Union([Type.Literal("continue"), Type.Literal("stop")]),
  reason: Type.String({ minLength: 1 }),
});

const selectParameters = Type.Object({
  name: Type.String({ minLength: 1, description: "One name from the supplied alternatives." }),
  reason: Type.String({ minLength: 1 }),
});

const cleanTempParameters = Type.Object({}, { additionalProperties: false });

const subflowCall = Type.Union([
  Type.Object({
    flow: Type.String({ minLength: 1 }),
    input: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    flow: Type.String({ minLength: 1 }),
    "input-file": Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
]);

const subflowParameters = Type.Object({
  calls: Type.Array(subflowCall, { minItems: 1 }),
});

export type SubflowRequest = Static<typeof subflowCall>;

export type SubflowToolDetail = {
  call: number;
  flow: string;
  depth: number;
  started: boolean;
  input?: { path: string; sha256: string; bytes: number };
  exit?: number;
  cause?: Cause;
  child?: string;
  reason?: string;
  output?: string;
  bytes?: number;
  lines?: number;
  content?: string;
};

function text(value: string) {
  return [{ type: "text" as const, text: value }];
}

const markTool: HarnessTool<ControlContext, typeof markParameters, Static<typeof markParameters>> = {
      name: "mark",
      label: "Mark checklist item",
      description: "Move one checklist item to done or skipped. Evidence is required; a skip also requires a reason.",
      parameters: markParameters,
      executionMode: "sequential",
      execute(_id, params, _signal, _update, context) {
        const item = context.checklist[params.item - 1];
        const validReason = params.state === "done" || (params.reason?.trim().length ?? 0) > 0;
        if (item === undefined) {
          return Promise.reject(new Error(`Checklist item ${String(params.item)} does not exist.`));
        }
        if (!validReason) {
          return Promise.reject(new Error("A skipped checklist item requires a reason."));
        }
        item.state = params.state;
        if (params.state === "skipped" && params.reason !== undefined) item.reason = params.reason;
        else delete item.reason;
        return Promise.resolve({ content: text(`Checklist item ${String(params.item)} is ${params.state}.`), details: params });
      },
};

const refuseTool: HarnessTool<ControlContext, typeof reasonParameters, Static<typeof reasonParameters>> = {
      name: "refuse",
      label: "Refuse stage",
      description: "Declare that this stage cannot be completed and give the reason.",
      parameters: reasonParameters,
      executionMode: "sequential",
      execute(_id, params, _signal, _update, context) {
        context.refusal = { reason: params.reason };
        return Promise.resolve({ content: text("The stage was refused."), details: params, terminate: true });
      },
};

const faultTool: HarnessTool<ControlContext, typeof reasonParameters, Static<typeof reasonParameters>> = {
      name: "fault",
      label: "Report stage fault",
      description: "Declare that this stage cannot continue and give the reason.",
      parameters: reasonParameters,
      executionMode: "sequential",
      execute(_id, params, _signal, _update, context) {
        context.fault = { reason: params.reason };
        return Promise.resolve({ content: text("The stage fault was reported."), details: params, terminate: true });
      },
};

const continueTool: HarnessTool<ControlContext, typeof continueParameters, Static<typeof continueParameters>> = {
      name: "continue",
      label: "Answer loop question",
      description: "Say whether the loop needs another repeat and give the reason.",
      parameters: continueParameters,
      executionMode: "sequential",
      execute(_id, params, _signal, _update, context) {
        context.continuation = params;
        return Promise.resolve({ content: text(`The loop answer is ${params.answer}.`), details: params, terminate: true });
      },
};

const selectTool: HarnessTool<ControlContext, typeof selectParameters, Static<typeof selectParameters>> = {
      name: "select",
      label: "Select alternative",
      description: "Name one supplied alternative and give the reason for selecting it.",
      parameters: selectParameters,
      executionMode: "sequential",
      execute(_id, params, _signal, _update, context) {
        if (!context.alternatives.includes(params.name)) {
          return Promise.reject(new Error(`Unknown alternative ${params.name}. Choose one of: ${context.alternatives.join(", ")}.`));
        }
        context.selection = params;
        return Promise.resolve({ content: text(`Selected ${params.name}.`), details: params, terminate: true });
      },
};

const boundCleanTempPaths = new WeakMap<object, string>();

function cleanTempTool(tmpPath: string | undefined): HarnessTool<ControlContext, typeof cleanTempParameters, Static<typeof cleanTempParameters>> {
  const tool: HarnessTool<ControlContext, typeof cleanTempParameters, Static<typeof cleanTempParameters>> = {
    name: "clean-temp",
    label: "Clean temporary files",
    description: "Empty this stage's $TMP directory after confirming its contents are disposable.",
    parameters: cleanTempParameters,
    executionMode: "sequential",
    async execute(_id, params) {
      if (tmpPath === undefined) throw new Error("The temporary directory is not attached to this tool.");
      for (const entry of await readdir(tmpPath)) await rm(join(tmpPath, entry), { recursive: true, force: true });
      return { content: text("Temporary files cleaned."), details: params };
    },
  };
  if (tmpPath !== undefined) boundCleanTempPaths.set(tool, tmpPath);
  return tool;
}

export function boundCleanTempPath(tool: unknown): string | undefined {
  return typeof tool === "object" && tool !== null ? boundCleanTempPaths.get(tool) : undefined;
}

function subflowText(detail: SubflowToolDetail): string {
  if (!detail.started) return `Call ${String(detail.call)} (${detail.flow}) did not start: ${detail.reason ?? "unavailable"}`;
  if (incomplete(detail)) return `Call ${String(detail.call)} (${detail.flow}) child machinery failed; the child record is incomplete: ${detail.reason ?? "unavailable"}`;
  const ending = `${String(detail.exit)} ${String(detail.cause)}`;
  if (detail.output === undefined) return `Call ${String(detail.call)} (${detail.flow}) ended ${ending}: ${detail.reason ?? "no output"}`;
  const size = `${String(detail.bytes ?? 0)} bytes, ${String(detail.lines ?? 0)} lines`;
  return `Call ${String(detail.call)} (${detail.flow}) ended ${ending}; output ${detail.output} (${size})\n${detail.content ?? ""}`;
}

function incomplete(detail: SubflowToolDetail): boolean {
  return detail.exit === undefined || detail.cause === undefined;
}

export function createSubflowTool(
  run: (calls: readonly SubflowRequest[], signal: AbortSignal) => Promise<SubflowToolDetail[]>,
): HarnessTool<ControlContext, typeof subflowParameters, SubflowToolDetail[]> {
  return {
    name: "subflow",
    label: "Call subflow",
    description: "Run one or more scoped flows as child runs and return their recorded outcomes.",
    parameters: subflowParameters,
    executionMode: "sequential",
    execute(_id, params, signal) {
      // Batch size is the agent's own decision (subflow.md), so too large a one
      // is its call to make again — the send-back `select` gives a bad name.
      if (params.calls.length > FANOUT_MAX) {
        return Promise.reject(new Error(`A subflow batch takes at most ${String(FANOUT_MAX)} calls; this one has ${String(params.calls.length)}. Split it.`));
      }
      return run(params.calls, signal ?? new AbortController().signal).then((details) => ({
        content: text(details.map(subflowText).join("\n\n")),
        details,
      }));
    },
  };
}

export function createControlTools(tmpPath?: string): HarnessTool<ControlContext>[] {
  return [markTool, refuseTool, continueTool, selectTool, cleanTempTool(tmpPath), faultTool];
}

export function expandSlotPath(path: string, slots: Readonly<Record<string, string>>): string {
  for (const [name, value] of Object.entries(slots)) {
    const variable = `$${name}`;
    if (path === variable) return value;
    if (path.startsWith(`${variable}/`)) return join(value, path.slice(variable.length + 1));
  }
  return path;
}

export type FileToolContext = ControlContext & ExecutionToolContext;

/** What an agent reads when it addresses a file by shorthand for the home. */
const TILDE_REFUSAL = "A path that starts with ~ is not allowed here; write the path out in full.";

// A tool payload is JSON and no shell expands it, so path resolution does
// (slots.md): every file tool addresses the disk through `env.absolutePath`, so
// expanding here is the one place that serves all of them — and the tool keeps
// the `$OUTPUT` it was handed, which is what it echoes back to the agent
// (invariants 2, 5, 6). `bash` needs none of this: the slots are real variables
// in the stage environment and the shell expands them itself.
export class SlotExecutionEnv extends NodeExecutionEnvironment {
  readonly #slots: Readonly<Record<string, string>>;

  constructor(options: ConstructorParameters<typeof NodeExecutionEnvironment>[0], slots: Readonly<Record<string, string>>) {
    super(options);
    this.#slots = slots;
  }

  override absolutePath(path: string, context: ChordContext = HARNESS_CONTEXT) {
    const held = expandSlotPath(path, this.#slots);
    // Pi resolves a leading `~` to the real home before any file tool touches
    // the disk (pi-agent-core dist/harness/env/nodejs.js:25-32), which made the
    // caller's own credential file addressable by shorthand from inside a
    // stage. Refused here, where path resolution already lives, so no file tool
    // needs to know (ticket 0139 leg 5). Absolute paths still reach anywhere:
    // this is a guardrail, not a sandbox.
    if (held === "~" || held.startsWith("~/")) return Promise.resolve(err<string, FileError>(new FileError("invalid", TILDE_REFUSAL, held)));
    return super.absolutePath(held, context);
  }

  // Pi's bash tool spills truncated output to a file it mints through
  // `createTempFile` (dist/harness/utils/shell-output.js:66), which lands in
  // the ambient `os.tmpdir()` — outside the run, and pruned by nobody. Every
  // temporary this env mints goes under the stage's own `$TMP` instead, which
  // stays available while its scope is live and is then destroyed (slots.md).
  override async createTempDir(prefix: string | undefined, context: ChordContext) {
    const tmp = this.#slots["TMP"];
    if (tmp === undefined) return super.createTempDir(prefix, context);
    return mkdtemp(join(tmp, prefix ?? "tmp-")).then(
      (made) => ok<string, FileError>(made),
      (reason: unknown) => err<string, FileError>(new FileError("unknown", reason instanceof Error ? reason.message : "A temporary directory could not be made.", tmp)),
    );
  }

  // A FAILED tool is the other channel, and Node composed its message from the
  // resolved path (ticket 0068). Pi's `edit` never leaked because it rebuilds
  // its error from the path it was GIVEN; this is that — the inverse expansion,
  // applied to the value before a message exists, never to a finished one. The
  // four overridden below are the ones a file tool surfaces a message from:
  // `read` throws the first two (its missing-file probe is `exists`), `write`
  // the last two (`canonicalPath` runs inside Pi's mutation queue).
  #composed<Value>(result: HarnessResult<Value, FileError>, path: string): HarnessResult<Value, FileError> {
    if (result.ok) return result;
    const slot = Object.entries(this.#slots).find(([, value]) => path === value || path.startsWith(`${value}/`));
    const shown = slot === undefined ? path : `$${slot[0]}${path.slice(slot[1].length)}`;
    return err(new FileError(result.error.code, `Could not access file: ${shown}. Error code: ${result.error.code}.`, shown));
  }

  override async readBinaryFile(path: string, context: ChordContext) { return this.#composed(await super.readBinaryFile(path, context), path); }
  override async exists(path: string, context: ChordContext) { return this.#composed(await super.exists(path, context), path); }
  override async writeFile(path: string, content: string | Uint8Array, context: ChordContext) { return this.#composed(await super.writeFile(path, content, context), path); }
  override async canonicalPath(path: string, context: ChordContext) { return this.#composed(await super.canonicalPath(path, context), path); }
}

// The shell a stage gets holds EXACTLY the environment bot composed. Pi's bash
// tool hard-codes `inheritEnv: true` (dist/harness/tools/bash.js:33-34) and its
// env builder spreads raw `process.env` UNDERNEATH the supplied env when
// inheritance is on (dist/harness/env/nodejs.js:190-198), so every name bot
// scrubbed came back — BOT_HOME included — in every shell the agent ran, beside
// whatever else the caller's process was carrying. `prepare` is the option Pi
// exposes for exactly this, and it is the whole fix: inheritance off, the
// environment supplied outright. COMPLETE is literal — with inheritance off
// that same builder returns the supplied env ALONE, dropping the tool's own
// shellEnv with everything else, so PATH and every other name a shell needs is
// in here or it is nowhere (ticket 0139 leg 2).
export function createFileTools(shellEnv: NodeJS.ProcessEnv): HarnessTool<FileToolContext>[] {
  const supplied = Object.fromEntries(Object.entries(shellEnv).flatMap(([name, value]) => value === undefined ? [] : [[name, value]]));
  // The temporaries the STAGE makes itself, by the same rule as the ones Pi
  // makes for it above: `mktemp` and every language's temp-directory call read
  // TMPDIR, and without it they landed in the machine's /tmp — outside the run
  // and outside `$TMP`'s lifecycle. It is spelled from the slot, so the two
  // cannot drift (ticket 0144, ruled 2026-08-06).
  if (supplied["TMP"] !== undefined) supplied["TMPDIR"] = supplied["TMP"];
  return [
    createReadTool<FileToolContext>(),
    createWriteTool<FileToolContext>(),
    createEditTool<FileToolContext>(),
    createBashTool<FileToolContext>({
      prepare: (execution) => { execution.inheritEnv = false; execution.env = { ...supplied }; },
    }),
  ];
}
