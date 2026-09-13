// One attempt at a stage: what it was configured with, where its bytes land,
// and the events that open it. record.md counts attempts (`retry` starts at 1)
// and says "an output and its check captures sit at the attempt level, because
// each attempt produces its own" — that directory is what this file addresses,
// and the repeat level just above it, where the session and the prompt that
// opened it sit.
import { lstatSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { bytewise, type StageAccess } from "./model.ts";
import type { Harness } from "./harness.ts";
import type { DriverClock, Executable, ProcessGroups } from "./process.ts";
import { checkEvent, stageStartEvent, type CheckKind, type HashedPath, type OptionLadder, type PromptSource, type RecordedTool, type RecruitedSkill, type StageIdentity, type StageSlots } from "./record-events.ts";
import { passedOutput, type PassedOutput, type RecordWriter } from "./record.ts";
import type { StageSchema } from "./schema-check.ts";
import type { Cause } from "./spine.ts";
import type { ControlContext } from "./tools.ts";

export interface CommonConfig {
  timeoutMs: number;
  retries: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
  inputPath?: string;
  session: string;
  received: (HashedPath & { name: string })[];
  priorFailureInputs?: string[];
  options: OptionLadder;
  slots?: StageSlots;
  workdir?: { authored: string | null; resolved: string };
  tools?: RecordedTool[];
  skills?: RecruitedSkill[];
  promptSources?: PromptSource[];
  access?: StageAccess;
}

export interface WorkConfig extends CommonConfig {
  outputPath: string;
  outputExtension: "json" | "md" | "txt";
  checklist?: readonly string[];
  schema?: StageSchema;
  gates?: readonly Executable[];
  hooks?: Partial<Record<"before" | "success" | "failure", Executable>>;
}

export type GatingConfig =
  | (WorkConfig & { mode: "stage" })
  | (WorkConfig & { mode: "loop"; question: string })
  | (CommonConfig & { mode: "choose"; alternatives: readonly string[] });

export interface GatingResult {
  exit: number;
  cause: Cause;
  reason?: string;
  output?: HashedPath;
  selection?: { name: string; reason: string };
  continuation?: { answer: "continue" | "stop"; reason: string };
}

export interface GatingInput {
  harness: Harness<ControlContext>;
  controls: ControlContext;
  writer: RecordWriter;
  identity: StageIdentity;
  clock: DriverClock;
  agentClock?: DriverClock;
  config: GatingConfig;
  close(): Promise<void>;
  signal?: { abort: AbortSignal; exit: number | (() => number | undefined); groups?: ProcessGroups; fault?: () => { reason: unknown } | undefined };
}

export type RuntimeInput = GatingInput;

function attemptPath(writer: RecordWriter, identity: StageIdentity): { disk: string; record: string } {
  const parts = ["stages", ...identity.stage.split("/"), String(identity.repeat ?? 1), String(identity.retry)];
  return { disk: join(writer.runDirectory, ...parts), record: parts.join("/") };
}

export async function capture(writer: RecordWriter, identity: StageIdentity, path: string, bytes: Buffer): Promise<string> {
  const attempt = attemptPath(writer, identity);
  const record = `${attempt.record}/${path}`;
  const disk = join(attempt.disk, ...path.split("/"));
  await mkdir(dirname(disk), { recursive: true });
  await writeFile(disk, bytes);
  return record;
}

export function absoluteCapture(input: RuntimeInput, record: string): string {
  return join(input.writer.runDirectory, ...record.split("/"));
}

// What the model was asked, kept beside the session that answers it — the
// repeat level, one above the attempts (record.md). The text handed back is the
// text written, so a caller cannot hand the harness anything but the retained
// bytes: retention is never a second rendering (ADR 0016 step 7, superseding
// ADR 0012's "reconstructible, so not stored").
export async function retainPrompt(sessionFile: string, name: "system.txt" | "first-turn.txt", text: string): Promise<string> {
  const directory = dirname(sessionFile);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), text);
  return text;
}

export async function recordCheck(input: RuntimeInput, check: CheckKind, name: string, bytes: Buffer, exit: number | null, executable?: Executable): Promise<string> {
  const path = await capture(input.writer, input.identity, `checks/${name}`, bytes);
  await input.writer.append(checkEvent({
    ts: input.clock.timestamp(), identity: input.identity, check, exit, capture: path,
    ...(executable === undefined ? {} : { file: executable.file, sha256: executable.sha256 }),
  }));
  return absoluteCapture(input, path);
}

export async function snapshotOutput(input: RuntimeInput, config: WorkConfig): Promise<{ bytes: Buffer; passed: PassedOutput } | undefined> {
  if (!lstatSync(config.outputPath, { throwIfNoEntry: false })?.isFile()) return undefined;
  const bytes = await readFile(config.outputPath);
  const record = await capture(input.writer, input.identity, `output.${config.outputExtension}`, bytes);
  return { bytes, passed: passedOutput(config.outputPath, record, bytes) };
}

export function resolvePromptSources(
  prefix: PromptSource[], received: { name: string; path: string }[], names: readonly string[], session: string,
): PromptSource[] {
  const repeat = dirname(session);
  const inputs = [...names].sort(bytewise).map((name): PromptSource => {
    const retained = received.find((held) => held.name === name);
    if (retained === undefined) return { source: "input", name, path: name };
    return retained.path === name && /^request\.[^/]+$/u.test(name)
      ? { source: "request", path: retained.path }
      : { source: "input", name, path: retained.path };
  });
  return [
    ...prefix,
    ...inputs,
    { source: "harness", system: `${repeat}/system.txt`, firstTurn: `${repeat}/first-turn.txt` },
  ];
}

export async function startAttempt(input: RuntimeInput, received: CommonConfig["received"]): Promise<void> {
  await input.writer.append(stageStartEvent({ ts: input.clock.timestamp(), identity: input.identity, received, options: input.config.options, ...(input.config.slots === undefined ? {} : { slots: input.config.slots }), ...(input.config.workdir === undefined ? {} : { workdir: input.config.workdir }), session: input.config.session, ...(input.config.tools === undefined ? {} : { tools: input.config.tools }), skills: input.config.skills ?? [], ...(input.config.access === undefined ? {} : { access: input.config.access }) }));
}

export async function nextAttempt(input: RuntimeInput): Promise<void> {
  input.identity.retry += 1;
  await startAttempt(input, []);
}

export function signaled(input: RuntimeInput): boolean {
  return input.signal?.abort.aborted === true;
}

export function signalExit(input: RuntimeInput): number {
  const exit = input.signal?.exit;
  if (typeof exit === "function") return exit() ?? 2;
  return exit ?? 2;
}
