import { basename } from "node:path";
import type { Refusal } from "./spine.ts";

export const OPTION_NAMES = [
  "timeout",
  "retries",
  "local-context",
  "intelligence",
] as const;

export type OptionName = (typeof OPTION_NAMES)[number];
export type OptionValue = string | number;
export type AuthoredOptions = Partial<Record<OptionName, OptionValue>>;

/** The complete model choices named in the home's flat intelligence table. */
export type IntelligenceTable = Record<string, {
  provider?: string;
  model: string;
  reasoning: ReasoningLevel;
}>;
/** The home rung whole: the defaults every assembly inherits, and the tables
 *  named model choices look up in (home.md). */
export interface HomeConfig {
  options: AuthoredOptions;
  intelligences: IntelligenceTable;
}

export const REASONING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

/** What a run admits of `$PWD`'s own context (invocation.md); `ignore` is the default. */
export const LOCAL_CONTEXTS = ["ignore", "announce", "use"] as const;

// The home and every run directory are born owner-only, like `~/.ssh`
// (home.md). The doors are the whole lock: a directory nobody may traverse
// hides what is inside it, so nothing beneath one is chmod'd. Passed to every
// mkdir that can CREATE the home — `runs/` for a run, `assemblies/` for an
// install — and to run birth; `recursive: true` puts it on each level it makes,
// the home included, so an existing directory is never re-moded.
export const OWNER_ONLY = 0o700;

export interface MarkdownDocument {
  data: Record<string, unknown>;
  body: string;
  sound: boolean;
}

interface NodeFields {
  name: string;
  path: string;
  options: AuthoredOptions;
  skills: string[];
}

export const ACCESS_OPERATIONS = ["read", "write", "edit", "bash"] as const;
export type AccessOperation = (typeof ACCESS_OPERATIONS)[number];
export type StageAccess = Partial<Record<AccessOperation, string[]>>;

export interface StageNode extends NodeFields {
  kind: "STAGE";
  /** Authored as one `.md` file, not a folder — record.md "Identity" takes the extension off only this form. */
  single?: true;
  files: string[];
  extension: "json" | "md" | "txt";
  subflows: Map<string, Flow>;
  body?: string;
  /** An authored subdirectory of the root run workspace (stage.md). */
  workdir?: string;
  /** Model execution tools offered by an explicit stage-local boundary. */
  access?: StageAccess;
}

export interface LoopNode extends NodeFields {
  kind: "LOOP";
  repeat: number;
  question?: string;
  sequence: Sequence;
}

/** Ian's ruling, 2026-08-05: 32 at once, never silently. Both places a run fans
 *  out read it — a `PARALLEL`'s width, which graph.ts refuses past this, and a
 *  `subflow` batch, which tools.ts sends back (CHECKLIST 2: no configuration). */
export const FANOUT_MAX = 32;

export interface ParallelNode extends NodeFields {
  kind: "PARALLEL";
  width: number;
  branches: Branch[];
}

export interface ChooseNode extends NodeFields {
  kind: "CHOOSE";
  question?: string;
  alternatives: Branch[];
}

export interface FanoutNode extends NodeFields {
  kind: "FANOUT";
  items: string;
  subflow: string;
  width: number;
  maxItems: number;
}

export type Node = StageNode | LoopNode | ParallelNode | ChooseNode | FanoutNode;
// The three folders that hold stages (graph.md). They carry options and skills
// for everything beneath them, so the chain of them is threaded down a run.
export type ContainerNode = LoopNode | ParallelNode | ChooseNode;

export interface Sequence {
  path: string;
  nodes: Node[];
}

export interface Branch {
  name: string;
  path: string;
  sequence: Sequence;
}

export interface Flow {
  name: string;
  path: string;
  options: AuthoredOptions;
  sequence: Sequence;
  skills: string[];
  subflows: Map<string, Flow>;
  body?: string;
  maxDepth?: number;
  tmp?: "flow";
}

function procedureStructure(stage: StageNode, containers: readonly ContainerNode[]): string | undefined {
  const enclosing = [...containers].reverse().map((container) => {
    if (container.kind === "LOOP") return `Loop ${container.name}`;
    const branches = container.kind === "PARALLEL" ? container.branches : container.alternatives;
    const branch = branches.find(({ path }) => stage.path === path || stage.path.startsWith(`${path}/`));
    const label = container.kind === "PARALLEL" ? "Parallel" : "Choice";
    const member = container.kind === "PARALLEL" ? "branch" : "alternative";
    return branch === undefined ? `${label} ${container.name}` : `${label} ${container.name}, ${member} ${branch.name}`;
  });
  return enclosing.length === 0 ? undefined : enclosing.join("; ");
}

export function procedurePosition(flow: Flow, stage: StageNode, containers: readonly ContainerNode[]): { step: number; total: number; structure?: string } | undefined {
  // A container occupies one root position; its descendants never fabricate
  // positions among their concurrent, selected, or repeated peers (0110).
  const node = containers.at(-1) ?? stage;
  const step = flow.sequence.nodes.indexOf(node);
  const structure = procedureStructure(stage, containers);
  return step < 0 ? undefined : {
    step: step + 1, total: flow.sequence.nodes.length,
    ...(structure === undefined ? {} : { structure }),
  };
}

export const DEFAULT_TMP_MAX_BYTES = 1024 ** 3;

export interface Assembly {
  root: string;
  /** Parsed assemblies resolve this; in-memory test fixtures use the default. */
  tmpMaxBytes?: number;
  options: AuthoredOptions;
  slots: Record<string, string>;
  skills: string[];
  flows: Map<string, Flow>;
  subflows: Map<string, Flow>;
  faults: Refusal[];
  body?: string;
}

interface SuppliedRequest {
  body: string;
  via: "argument" | "task";
}

export interface Invocation {
  target: string;
  requestExtension: string;
  taskOptions: AuthoredOptions;
  commandOptions: AuthoredOptions;
  supplied: Map<string, string>;
  /** Keys given no value. Which fault that is depends on whether the key
   *  exists, which only the assembly's slots settle (refusals.md, check.ts). */
  valueless: Set<string>;
  home: string;
  workdir?: string;
  faults: Refusal[];
  request?: SuppliedRequest;
}

export interface Target {
  assemblyRoot?: string;
  flow?: string;
  faults: Refusal[];
}

export function bytewise(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

export function mapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorCode(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : undefined;
}

// The layer beneath the run reporting itself (record.md, cause `fault`: "the
// machinery failed — ... (provider, disk, the agent library)"). Two shapes, and
// each is a PAIR, never one field: an OS error names its failing syscall and
// errno; the library's six published classes set `name` in their constructors
// with a `code` from a closed enum. `name` alone is a net, and so is "has a
// string code" — `ERR_ASSERTION` has one, `ERR_INVALID_ARG_TYPE` one and no
// syscall. `AgentHarnessError` wraps EVERYTHING leaving the harness, so its
// code says where as often as what: these three alone are set from a typed
// cause, while `unknown` and `hook` are what a throw from this runtime's OWN
// callbacks earns and `busy`/`invalid_*` say the runtime called the library
// wrong; `unknown` is every other enum's "could not classify" too (Branch-
// SummaryError has none). Neither pair holds a programmer error, so one is
// never dressed as an ending and still escapes, unswallowed (CHECKLIST 6).
const LIBRARY_ERRORS = new Set(["FileError", "ExecutionError", "CompactionError", "BranchSummaryError", "SessionError"]);
const HARNESS_FAULTS = new Set(["session", "compaction", "branch_summary"]);
function libraryFault(reason: object): string | undefined {
  const code = errorCode(reason);
  const name = "name" in reason && typeof reason.name === "string" ? reason.name : "";
  if (code === undefined || code === "unknown" || !(LIBRARY_ERRORS.has(name) || (name === "AgentHarnessError" && HARNESS_FAULTS.has(code)))) return undefined;
  return `${name} ${code}: ${"message" in reason && typeof reason.message === "string" ? reason.message : ""}`;
}
function systemFault(reason: object): string | undefined {
  if (!("syscall" in reason) || typeof reason.syscall !== "string") return undefined;
  if (!("errno" in reason) || typeof reason.errno !== "number") return undefined;
  const path = "path" in reason && typeof reason.path === "string" ? ` ${reason.path}` : "";
  return `${errorCode(reason) ?? "EUNKNOWN"} ${reason.syscall}${path}`;
}
class RunLockCompromise extends Error {
  constructor(directory: string, stalledMilliseconds: number, cause: Error) {
    const run = basename(directory);
    const elapsed = Math.max(0, Math.floor(stalledMilliseconds));
    super(`Run ${run}: run lock ${run}.lock was compromised; heartbeat stalled ${String(elapsed)} ms.`, { cause });
  }
}
export function runLockCompromised(directory: string, stalledMilliseconds: number, cause: Error): Error {
  return new RunLockCompromise(directory, stalledMilliseconds, cause);
}
export function machineryFault(reason: unknown): string | undefined {
  if (reason instanceof RunLockCompromise) return reason.message;
  if (typeof reason !== "object" || reason === null) return undefined;
  return libraryFault(reason) ?? systemFault(reason);
}
export function faultReason(reason: unknown): string {
  return machineryFault(reason) ?? (reason instanceof Error ? reason.message : "The run failed with a non-Error value.");
}

export function fault(
  faults: Refusal[],
  code: Refusal["code"],
  path: string,
  sentence: string,
): void {
  faults.push({ code, path, sentence });
}

// A reason is text the RUN produced — an agent's own words, or the output a
// gate wrote and the machinery kept — and a terminal obeys what it is handed:
// `ESC[2J` clears the reader's screen, a carriage return repaints the line they
// were just shown, a direction override reverses one without touching a
// character of it. Both places bot prints a reason print it through here
// (readings.ts `said`, cli.ts's failed-run line), so the two cannot drift, and
// nothing is DROPPED — a reading that differs from the record in a way the
// reader cannot see is the failure this prevents (ticket 0165). Tab and newline
// stay themselves; they move the cursor forward, where the reader sees it. A
// backslash is not doubled: the harm is a line that paints, not one that could
// be re-parsed, and doubling would reword every reason that names a path.
const PAINTS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

export function plainly(text: string): string {
  return text.replace(PAINTS, (held) => {
    const code = held.codePointAt(0) ?? 0;
    if (code === 0x0D) return "\\r";
    return `\\${code < 0x100 ? `x${code.toString(16).padStart(2, "0")}` : `u${code.toString(16).padStart(4, "0")}`}`;
  });
}

export function visible(name: string): boolean {
  return !name.startsWith(".");
}

export function stem(name: string): string {
  const dot = name.indexOf(".");
  return dot < 0 ? name : name.slice(0, dot);
}

// What the graph calls a node: the disk entry with its number prefix and any
// `.md` taken off. Not the stage's identity — `stagePath` below is that, and it
// keeps the numbers, which is why these are two words and not one.
export function nodeName(name: string): string {
  const withoutExtension = name.endsWith(".md") ? name.slice(0, -3) : name;
  return withoutExtension.replace(/^\d+-/, "");
}

// One displayed identity for a stage, in both worlds: the record's `stage`
// field and the stage `bot check` predicts. record.md "Identity" — the path
// from the flow root, numbers kept, what a reader finds on disk. So `.md`
// comes off a single-file stage and nothing else: a container is always a
// folder, and a folder named `01-wrap.md/` is found under that name.
export function stagePath(node: Node, flow: Flow): string {
  const prefix = `${flow.path}/`;
  const relative = node.path.startsWith(prefix) ? node.path.slice(prefix.length) : node.path;
  return node.kind === "STAGE" && node.single === true ? relative.replace(/\.md$/u, "") : relative;
}

export function numberOf(name: string): number | undefined {
  const match = /^(\d+)-/.exec(name);
  return match === null ? undefined : Number(match[1]);
}

export function sequenceName(name: string): boolean {
  return /^\d{1,9}-.+/u.test(name);
}
