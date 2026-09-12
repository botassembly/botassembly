// The vocabulary a run is executed in: what a node receives, what it returns,
// and the state carried down the graph. It holds no logic, so both the stage
// executor (flow.ts) and the container executors (containers.ts) can import it
// without either importing the other — the gate forbids cycles, and madge
// counts type-only imports.
import type { GatingInput, GatingResult } from "./gating.ts";
import type { HarnessTool } from "./harness.ts";
import type {
  Assembly, ChooseNode, ContainerNode, Flow, HomeConfig, Invocation, Sequence, StageNode,
} from "./model.ts";
import type { ResolvedOptions } from "./options.ts";
import type { DriverClock } from "./process.ts";
import type { HashedPath, RunEndEvent, RuntimeProvenance, StageIdentity } from "./record-events.ts";
import type { RecordWriter } from "./record.ts";
import type { RunSignal } from "./signal.ts";
import type { ResolvedSkill } from "./skills.ts";
import type { Cause } from "./spine.ts";
import type { ControlContext } from "./tools.ts";
import type { HeldRunSource } from "./run-files.ts";

export interface FlowSource {
  name: string;
  extension: string;
  diskPath: string;
  record: HashedPath;
  role?: "prior-failure";
  held?: HeldRunSource;
}

interface FlowOutput extends FlowSource {
  extension: "json" | "md" | "txt";
}

export interface FlowResult {
  exit: number;
  cause: Cause;
  reason?: string;
  recordComplete?: false;
  output?: FlowOutput;
  outputBytes?: Buffer;
  ending?: RunEndEvent;
}

export interface LocalStop {
  abort: AbortSignal;
  fail(reason: unknown): void;
  failure(): { reason: unknown } | undefined;
  close(): { reason: unknown } | undefined;
}

export type GatingMode =
  | { kind: "stage" }
  | { kind: "loop"; question: string }
  | { kind: "choose"; alternatives: readonly string[]; question?: string };

export interface StageRuntimeContext {
  assembly: Assembly;
  flow: Flow;
  origin: "root" | "subflow";
  node: StageNode | ChooseNode;
  identity: StageIdentity;
  mode: GatingMode;
  options: ResolvedOptions;
  containers: readonly ContainerNode[];
  inputPath: string;
  outputPath?: string; // absent for a CHOOSE node: a choice is not an output (choose.md)
  tmpPath: string;
  subflowsPath: string;
  sessionPath: string;
  sessionFile: string;
  slots: Record<string, string>;
  workdirRoot: string;
  env: NodeJS.ProcessEnv;
  received: (HashedPath & { name: string })[];
  priorFailureInputs: string[];
  skills: ReadonlyMap<string, ResolvedSkill>;
  tools: HarnessTool<ControlContext>[];
  helpers: readonly Flow[];
  writer: RecordWriter;
  clock: DriverClock;
}

export type GatingSession = Pick<GatingInput, "harness" | "controls" | "config" | "close">;

export interface RunFlowInput {
  assembly: Assembly;
  flow: Flow;
  invocation: Invocation; // with assembly and flow, the four rungs a stage resolves through (options.ts)
  home: HomeConfig;
  writer: RecordWriter;
  request: FlowSource;
  /** Verified outputs carried from a prior run, replacing the request at the first fresh node. */
  initialSources?: FlowSource[];
  /** Complete root nodes carried from a prior run. */
  skip?: number;
  /** The root workspace selected by `--in`; authored stage workdirs resolve here. */
  workdirRoot?: string;
  /** This flow's inherited default; a subflow receives its calling stage's effective `$PWD`. */
  workdir: string;
  scratchDirectory: string;
  baseEnv: NodeJS.ProcessEnv;
  slots: Readonly<Record<string, string>>;
  metadata: { assembly: string; assemblyHash: string; installationId: string; provenance?: RuntimeProvenance };
  clock: DriverClock;
  signal: RunSignal;
  /** A subflow child's machinery stop. Root signals remain on signal. */
  localStop?: LocalStop;
  observeTmpSample?: (sample: Promise<number>) => void;
  /** A compromised run lock ends the flow while its process tree is cancelled. */
  compromised?: Promise<never>;
  /** The root run-lock fault. Its admission closes atomically with signals before run_end. */
  machineryStop?: Pick<LocalStop, "failure" | "close">;
  /** The root command reads its output before the terminal event is published. */
  readOutput?: (output: FlowSource) => Promise<Buffer>;
  /** Where the run has got to, one line per stage start (runtime.md): displayed, never recorded. */
  progress(line: string): void;
  createGating(context: StageRuntimeContext): GatingSession | Promise<GatingSession>;
  depth?: number;
  callChainDepth?: number;
  origin?: "root" | "subflow";
}

export interface NodeResult {
  exit: number;
  cause: Cause;
  outputs: FlowSource[];
  reason?: string;
  terminalStage?: StageIdentity;
  continuation?: GatingResult["continuation"];
  selection?: GatingResult["selection"];
}

// Containers recurse — a CHOOSE runs a sequence that may hold another CHOOSE —
// and a container that imported the sequence runner would close a cycle. The
// two runners it needs ride the execution instead, bound once where a run
// starts, the way capability is threaded everywhere else in this codebase.
export interface Execution {
  input: RunFlowInput;
  depth: number;
  callChainDepth: number;
  repeat?: number;
  containers: ContainerNode[];
  sequence: (execution: Execution, sequence: Sequence, sources: FlowSource[], tailMode?: GatingMode) => Promise<NodeResult>;
  gatingNode: (execution: Execution, node: ChooseNode, mode: GatingMode, sources: FlowSource[]) => Promise<NodeResult>;
}
