// A run's life: birth, the capture it will run, the record's first and last
// lines. What each node is then handed is machinery.ts, its other half.
import { createModels, fauxProvider, type AssistantMessage, type Models } from "@earendil-works/pi-ai";
import { isUtf8 } from "node:buffer";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { providerModels } from "./credentials.ts";
import { runFlow, type RunFlowInput } from "./flow.ts";
import { scratchOfRun, scratchRoot } from "./invocation.ts";
import { defaultGating, modelFaults } from "./machinery.ts";
import { OWNER_ONLY, errorCode, faultReason, machineryFault, type Flow, type StageNode } from "./model.ts";
import type { DriverClock } from "./process.ts";
import { runEndEvent, runStartEvent, type RunStartEvent, type RuntimeProvenance, type StageIdentity } from "./record-events.ts";
import { resolveRuntimeProvenance, type RuntimeProvenanceResolution } from "./runtime-provenance.ts";
import { CAPTURE, captureAssembly, claimRunDirectory, hashBytes, prehashAssembly, type AssemblyPrehash, type RecordWriter } from "./record.ts";
import { readAssemblyTree, type Accepted, type InvocationResolve } from "./reader.ts";
import { lockActiveRun } from "./run-lock.ts";
import { continuationFor, type Continuation, type ResumeDonor } from "./continuation.ts";
import { materializeContinuation } from "./continuation-materialize.ts";
import type { FlowSource } from "./execution.ts";
import { createRunSignal } from "./signal.ts";
import type { Refusal } from "./spine.ts";
import { flowOutcome, startedResult, type RunCommandResult, type RunOutcome, type StartedRunResult } from "./run-result.ts";
import { HomeInstallationError, initializeInstallation } from "./home-installation.ts";
export type { RunCommandResult, RunOutcome, StartedRunResult } from "./run-result.ts";

export interface RunRequest {
  bytes: Buffer;
  extension: string;
  via: "argument" | "task" | "stdin";
}

export interface RunDependencies {
  clock: DriverClock;
  cwd: string;
  env: NodeJS.ProcessEnv;
  progress: RunFlowInput["progress"];
  idFile?: string;
  models?: Models; script?: AssistantMessage[];
  modelRuntime?: () => Promise<Models>;
  createGating?: RunFlowInput["createGating"];
  executeFlow?: typeof runFlow;
  captured?: (file: string) => Promise<void>;
  copyingCarried?: (identity: StageIdentity) => Promise<void>;
  runtimeProvenance?: () => Promise<RuntimeProvenanceResolution>;
  /** Narrow fault seams for run-birth tests. Production uses the defaults. */
  removeUnborn?: (directory: string) => Promise<void>;
  startRecord?: (writer: RecordWriter, event: RunStartEvent) => Promise<void>;
}

type Resolved = Extract<InvocationResolve, { status: "resolved" }>;
const PRE_START_FAULT_MAX = 2_048;

class PreStartFailure extends Error {
  readonly operation: string;
  readonly reason: unknown;
  constructor(operation: string, reason: unknown) {
    super("Run preparation failed.", { cause: reason });
    this.operation = operation;
    this.reason = reason;
  }
}

function preStart<Answer>(operation: string, work: () => Answer | Promise<Answer>): Promise<Answer> {
  return Promise.resolve().then(work).then(
    (answer) => answer,
    (reason: unknown) => Promise.reject(new PreStartFailure(operation, reason)),
  );
}

function boundedFault(prefix: string, reason: unknown): string {
  const immediate = faultReason(reason).replace(/\s+/gu, " ").trim() || "unknown failure";
  const bytes = Buffer.from(prefix + immediate);
  if (bytes.length <= PRE_START_FAULT_MAX) return bytes.toString("utf8");
  let end = PRE_START_FAULT_MAX;
  while (end > 0 && !isUtf8(bytes.subarray(0, end))) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

function preparationFault(operation: string, reason: unknown): string {
  return boundedFault(`${operation} failed: `, reason);
}

function cleanupFault(context: string, reason: unknown): string {
  return boundedFault(`Unborn run cleanup failed after ${context}: `, reason);
}

function syntheticAssemblyFlow(read: Accepted): Flow {
  const subflows = new Map(read.assembly.flows);
  for (const [name, flow] of read.assembly.subflows) subflows.set(name, flow);
  const stage: StageNode = {
    kind: "STAGE", name: "assembly", path: "assembly", options: {}, files: ["ASSEMBLY.md"],
    extension: "txt", skills: [], subflows: new Map(), body: read.assembly.body ?? "",
  };
  return {
    name: "assembly", path: "", options: {}, sequence: { path: "", nodes: [stage] },
    skills: [], subflows,
  };
}

function runName(timestamp: string): string {
  return `${timestamp.slice(0, 19).replace(/:/gu, "-")}-${randomBytes(2).toString("hex")}`;
}

// Claiming the NAME, before there is a run to claim it for. The lock is
// proper-lockfile's sibling `<run>.lock` and inspection.ts already takes it
// with `realpath: false`, which resolves the name rather than weighing it — so
// it can be taken while the run directory does not exist yet, once `runs/`
// does. ELOCKED is another process holding this same second and these same two
// random bytes: a name to mint again, exactly as a taken directory already was,
// and not a failure. Every other throw is one, and is rethrown.
interface RunReservation { release(): void; compromised: Promise<never> }
function reserve(runDirectory: string, monotonic: () => number): Promise<RunReservation | undefined> {
  // The handler is attached before proper-lockfile can refresh. `birth` gives
  // the same promise to the flow once its signal and process groups exist.
  return Promise.resolve().then(() => lockActiveRun(runDirectory, monotonic)).then(undefined, (reason: unknown) => {
    if (errorCode(reason) === "ELOCKED") return undefined;
    throw reason;
  });
}

// Run birth, in the order that leaves no window (ticket 0112). The record used
// to be published first and the lock taken two writes later, and in between the
// run was a valid record with no ending and no lock — which is what `crashed`
// looks like, and crashed is prunable: a concurrent `bot prune --count 0
// --delete` could take a run that was starting, session bytes and all.
//
// Reserved first, the states a crash can leave are: `runs/<run>.lock` with no
// run directory, which `runNames` skips and no verb reads as a run at all; and
// a run directory holding no record yet, which the listing omits while its
// lock is live and which prune already refuses without `--refused`. Prune
// enumerates `runs/`, so it cannot
// see a run before `runs/<run>/` exists — and by then the lock that says a
// process is still here is already on disk. The window is closed, not moved.
//
// The reservation is dropped on every path out of this loop that is not the
// return: a name an older run directory already holds, and a directory that
// would not make. The return hands it to runCommand's `finally`, which is where
// the lock this process holds for the life of the run is released.
//
// Since ADR 0016 the record does not begin here: birth ends at the directory,
// and `run_start` is written after the capture in it has validated (step 6).
async function birth(home: string, ts: string, monotonic: () => number): Promise<{ writer: RecordWriter; release: () => void; compromised: Promise<never> }> {
  const runs = join(home, "runs");
  await mkdir(runs, { recursive: true, mode: OWNER_ONLY });
  for (;;) {
    const run = runName(ts);
    const release = await reserve(join(runs, run), monotonic);
    if (release === undefined) continue;
    const claimed = await claimRunDirectory(runs, run)
      .then(undefined, (reason: unknown) => { release.release(); throw reason; });
    if (claimed.status === "created") return { writer: claimed.writer, release: () => { release.release(); }, compromised: release.compromised };
    release.release();
  }
}

// The name `run_start` carries, and it is the ORIGINAL assembly's — the
// invoked root, never `runs/<id>/assembly`, which the run's own record would
// have no use for and `bot assembly update` could not match a live run against
// (inspection.ts `liveAssemblies`). Since ticket 0117 the parsed assembly's own
// root IS the capture, so this is handed the source path rather than reading it
// off the assembly.
function assemblyName(source: string, home: string): string {
  const registered = relative(join(home, "assemblies"), source);
  return registered.startsWith("..") ? source : registered;
}

// The one seam a test drives a run through a faux provider by, over the one
// construction credentials.ts holds — `bot auth` builds its Models the same
// way, so the file a login writes is the file the next run reads.
export function runtimeModels(dependencies: RunDependencies): Models {
  return dependencies.models ?? providerModels(dependencies.env, dependencies.clock);
}

function scriptedModels(script: AssistantMessage[]): Models {
  const faux = fauxProvider({
    provider: "faux",
    models: [{ id: "faux-1" }],
    tokensPerSecond: 10_000,
  });
  faux.setResponses(script);
  const models = createModels();
  models.setProvider(faux.provider);
  return models;
}

function machineryStop(): { fail(reason: unknown): void; failure(): { reason: unknown } | undefined; close(): { reason: unknown } | undefined } {
  let open = true;
  let held: { reason: unknown } | undefined;
  return {
    fail(reason) { if (open) held ??= { reason }; },
    failure: () => held,
    close() { open = false; return held; },
  };
}

type Prepared = { read: Accepted; flow: Flow; models: Models; prehash: AssemblyPrehash };

async function prepareRun(resolved: Resolved, created: RecordWriter, dependencies: RunDependencies): Promise<Prepared | RunCommandResult> {
  const captureRoot = join(created.runDirectory, CAPTURE);
  const attempted = await preStart("Assembly capture", () =>
    captureAssembly(resolved.assemblyRoot, captureRoot, dependencies.captured).then(
      (result) => result,
      (reason: unknown) => { const where = machineryFault(reason); if (where === undefined) throw reason; return { status: "failed" as const, where }; },
    ));
  if (attempted.status === "failed") return { exitCode: 2, cause: "fault", reason: `The assembly could not be copied into the run: ${attempted.where}` };
  if (attempted.status === "mismatched") return { exitCode: 2, cause: "fault", reason: `The assembly entry changed while it was being captured: ${attempted.path}` };
  const read = await preStart("Assembly reading", () => readAssemblyTree(resolved, captureRoot, dependencies.cwd, dependencies.env));
  if (read.status === "refused") return { exitCode: 2, faults: read.result.faults ?? [] };
  const flow = read.flow ?? syntheticAssemblyFlow(read);
  const models = await preStart("Model construction", () => dependencies.script === undefined
    ? dependencies.modelRuntime?.() ?? runtimeModels(dependencies)
    : scriptedModels(dependencies.script ?? []));
  const faults = await preStart("Model validation", () => modelFaults(read, flow, models));
  if (faults.length > 0) return { exitCode: 2, faults };
  return { read, flow, models, prehash: await preStart("Assembly hashing", () => prehashAssembly(captureRoot)) };
}

async function prepareContinuation(donor: ResumeDonor | undefined, flow: Flow): Promise<Continuation | Refusal | undefined> {
  return donor === undefined ? undefined : continuationFor(donor, flow);
}

async function runtimeForStart(modelSource?: "scripted",
  resolveRuntime: () => Promise<RuntimeProvenanceResolution> = resolveRuntimeProvenance): Promise<RuntimeProvenance | RunCommandResult> {
  const runtime = await resolveRuntime();
  return runtime.status === "resolved"
    ? { ...runtime.provenance, ...(modelSource === undefined ? {} : { modelSource }) }
    : { exitCode: 2, cause: "fault", reason: runtime.reason };
}

interface StartPreparedInput {
  resolved: Resolved;
  request: RunRequest;
  requestHash: string;
  donor?: ResumeDonor;
  read: Accepted;
  flow: Flow;
  models: Models;
  prehash: AssemblyPrehash;
  installationId: string;
  created: RecordWriter;
  ts: string;
  clock: DriverClock;
  workdir: string;
  idFile?: string; scripted: boolean; correlation?: string;
  durableCarried: StageIdentity[];
  copyingCarried?: (identity: StageIdentity) => Promise<void>;
  runtimeProvenance?: () => Promise<RuntimeProvenanceResolution>;
  startRecord(writer: RecordWriter, event: RunStartEvent): Promise<void>;
  unborn(result: RunCommandResult, context: string): Promise<RunCommandResult>;
  run(runtime: RuntimeProvenance, continuation: Continuation | undefined, requestPath: string): Promise<RunOutcome>;
}

async function prepareStarted(input: StartPreparedInput, continuation: Continuation | undefined): Promise<{ continuation: Continuation | undefined; requestPath: string }> {
  if (input.idFile !== undefined) await writeFile(input.idFile, `${basename(input.created.runDirectory)}\n`);
  let carried = continuation;
  if (carried !== undefined) {
    carried = await materializeContinuation(
      input.created, carried, input.clock, input.durableCarried, input.copyingCarried,
    );
  }
  const requestPath = join(input.created.runDirectory, `request.${input.request.extension}`); await writeFile(requestPath, input.request.bytes);
  return { continuation: carried, requestPath };
}

interface BegunRun { runtime: RuntimeProvenance; continuation: Continuation | undefined; start: RunStartEvent }

function resumeFacts(input: StartPreparedInput): Pick<StartedRunResult, "donor" | "carried"> {
  return input.donor === undefined ? {} : { donor: input.donor.name, carried: [...input.durableCarried] };
}

function settleStartedFault(input: StartPreparedInput, start: RunStartEvent, reason: unknown): Promise<RunCommandResult> {
  const where = faultReason(reason);
  const ending = runEndEvent({ ts: input.clock.timestamp(), exit: 2, cause: "fault", reason: where });
  return input.created.append(ending).then(
    () => startedResult(start, { exitCode: 2, cause: "fault", reason: where, ending, ...resumeFacts(input) }),
    (failure: unknown) => startedResult(start, { exitCode: 2, cause: "fault", reason: faultReason(failure), ...resumeFacts(input) }),
  );
}

async function beginPrepared(input: StartPreparedInput): Promise<BegunRun | RunCommandResult> {
  const heldContinuation = await preStart("Continuation preparation", () => prepareContinuation(input.donor, input.flow));
  if (heldContinuation !== undefined && "code" in heldContinuation) {
    return input.unborn({ exitCode: 2, faults: [heldContinuation] }, "continuation refusal");
  }
  const runtime = await preStart("Runtime provenance", () => runtimeForStart(
    input.scripted ? "scripted" : undefined, input.runtimeProvenance ?? resolveRuntimeProvenance,
  ));
  if (!("runtimeSource" in runtime)) return input.unborn(runtime, "runtime provenance fault");
  const continuation = heldContinuation;
  const first = runStartEvent({
    ts: input.ts, run: basename(input.created.runDirectory),
    assembly: assemblyName(input.resolved.assemblyRoot, input.resolved.invocation.home), assemblyHash: input.prehash.sha256,
    ...(input.read.flow === undefined ? {} : { flow: input.read.flow.name }),
    ...(continuation?.from === undefined ? {} : { continuedFrom: continuation.from }),
    ...(input.correlation === undefined ? {} : { correlation: input.correlation }),
    installationId: input.installationId,
    request: { path: `request.${input.request.extension}`, sha256: input.requestHash, bytes: input.request.bytes.length, via: input.request.via },
    workdir: input.workdir,
    provenance: runtime,
  });
  await preStart("Run record start", () => input.startRecord(input.created, first));
  return { runtime, continuation, start: first };
}

export async function runCommand(
  resolved: Resolved, request: RunRequest, dependencies: RunDependencies, donor?: ResumeDonor, correlation?: string,
): Promise<RunCommandResult> {
  const home = resolved.invocation.home;
  const ts = dependencies.clock.timestamp();
  const installation = await initializeInstallation(home).catch((reason: unknown) => {
    const message = reason instanceof HomeInstallationError ? reason.message : faultReason(reason);
    return { failure: `Installation identity validation failed: ${message}` } as const;
  });
  if ("failure" in installation) return { exitCode: 5, cause: "fault", reason: installation.failure };
  // The lock is this process saying it is still here (runtime.md): taken before
  // the run directory it guards, held for the life of the run — the capture
  // window included — and released below on every path out, a handled signal's
  // included. SIGKILL releases nothing; the lock simply stops refreshing and the
  // run reads crashed within seconds.
  const born = await birth(home, ts, () => dependencies.clock.milliseconds());
  const created = born.writer;
  // Nothing between the reservation and the `finally` below may throw without
  // releasing it, so everything that can is inside `started` or the try.
  let uninstall = (): void => undefined;
  const removeUnborn = dependencies.removeUnborn ?? ((directory: string) => rm(directory, { recursive: true, force: true }));
  // A refusal after the run directory exists takes the directory with it, so a
  // refused run still leaves nothing — record.md's rule, now that the capture
  // has to exist before there is anything to validate (ADR 0016 step 5).
  const unborn = (result: RunCommandResult, context: string): Promise<RunCommandResult> =>
    removeUnborn(created.runDirectory).then(
      () => result,
      (cleanup: unknown) => ({ exitCode: 2, cause: "fault", reason: cleanupFault(context, cleanup) }),
    );
  const requestName = `request.${request.extension}`;
  const requestHash = hashBytes(request.bytes);
  const workdir = resolve(dependencies.cwd, resolved.invocation.workdir ?? ".");
  const started = async (read: Accepted, flow: Flow, models: Models, prehash: AssemblyPrehash,
    runtime: RuntimeProvenance, continuation: Continuation | undefined, requestPath: string): Promise<RunOutcome> => {
    // Scratch retains non-temporary stage material best-effort, in a cache the
    // OS may empty; each `$TMP` is destroyed when its scope settles. It lives
    // outside the home so no slot value discloses the run's location (slots.md).
    // Keyed by the home as well as the run, so no second home's
    // run of this name shares it (ticket 0140); spelled once, in invocation.ts.
    const scratchDirectory = scratchOfRun(scratchRoot(dependencies.env), home, basename(created.runDirectory));
    const signal = createRunSignal(dependencies.clock, created.runDirectory);
    const lockStop = machineryStop();
    const compromised = born.compromised.then(undefined, (reason: unknown): Promise<never> => {
      const failure = reason instanceof Error ? reason : new Error("The run lock was compromised with a non-Error value.", { cause: reason });
      lockStop.fail(failure);
      signal.cancel(); return Promise.reject(failure);
    });
    uninstall = signal.install();
    const requestSource: FlowSource = {
      name: "request", extension: request.extension, diskPath: requestPath,
      record: { path: requestName, sha256: requestHash },
    };
    const initialSources = continuation === undefined ? undefined
      : continuation.skip === 0 ? [requestSource, ...continuation.sources] : continuation.sources;
    const result = await (dependencies.executeFlow ?? runFlow)({
      assembly: read.assembly, flow, invocation: read.invocation, home: read.home, writer: created,
      request: requestSource,
      ...(continuation === undefined ? {} : { skip: continuation.skip }),
      ...(initialSources === undefined ? {} : { initialSources }),
      workdir, workdirRoot: workdir,
      scratchDirectory, baseEnv: dependencies.env,
      // A supplied slot has one base and it is the caller's cwd — what `--home`,
      // `--in` and an `@task` file resolve against, and what check.ts validates
      // the path against. Absolutised here, before `--in` offers a second base:
      // the raw string resolved against `$PWD` named another file of that name.
      slots: Object.fromEntries([...read.invocation.supplied].map(([name, value]) => [name, resolve(dependencies.cwd, value)])),
      metadata: { assembly: assemblyName(resolved.assemblyRoot, home), assemblyHash: prehash.sha256,
        installationId: installation.installationId, provenance: runtime },
      clock: dependencies.clock, signal, compromised, machineryStop: lockStop, progress: dependencies.progress,
      readOutput: (output) => readFile(output.diskPath),
      createGating: dependencies.createGating ?? defaultGating(read, models, prehash),
    });
    return flowOutcome(result);
  };
  interface ReadyToRun { continue(): Promise<RunCommandResult> }
  const execute = async (): Promise<RunCommandResult | ReadyToRun> => {
    // The capture is made, validated, parsed, and hashed before the record
    // starts; a failed preparation removes this record-less run.
    const prepared = await prepareRun(resolved, created, dependencies);
    if (!("read" in prepared)) {
      return await unborn(prepared, "faults" in prepared ? "assembly preparation refusal" : "assembly preparation fault");
    }
    const { read, flow, models, prehash } = prepared;
    // The same boundary flow.ts draws, over run.ts's disk seams: optional id
    // publication after record birth, the request write, and sealed output read.
    // The record may never be more silent than the process was.
    const input: StartPreparedInput = {
      resolved, request, requestHash, ...(donor === undefined ? {} : { donor }),
      read, flow, models, prehash, installationId: installation.installationId, created, ts, clock: dependencies.clock, workdir,
      ...(dependencies.idFile === undefined ? {} : { idFile: dependencies.idFile }),
      scripted: dependencies.script !== undefined, durableCarried: [],
      ...(correlation === undefined ? {} : { correlation }),
      ...(dependencies.copyingCarried === undefined ? {} : { copyingCarried: dependencies.copyingCarried }),
      ...(dependencies.runtimeProvenance === undefined ? {} : { runtimeProvenance: dependencies.runtimeProvenance }),
      startRecord: dependencies.startRecord ?? ((writer, event) => writer.start(event)),
      unborn,
      run: (runtime, continuation, requestPath) => started(read, flow, models, prehash, runtime, continuation, requestPath),
    };
    const begun = await beginPrepared(input);
    if (!("runtime" in begun)) return begun;
    return { continue: () => prepareStarted(input, begun.continuation).then(
      (prepared) => input.run(begun.runtime, prepared.continuation, prepared.requestPath).then(
        (result) => startedResult(begun.start, { ...result, ...resumeFacts(input) }),
        (reason: unknown) => settleStartedFault(input, begun.start, reason),
      ),
      (reason: unknown) => settleStartedFault(input, begun.start, reason),
    ) };
  };
  const settlePreStart = (failure: unknown): Promise<RunCommandResult> => {
    if (!(failure instanceof PreStartFailure)) return Promise.reject(
      failure instanceof Error ? failure : new Error("Run execution failed with a non-Error value.", { cause: failure }),
    );
    const preparation: RunCommandResult = {
      exitCode: 2, cause: "fault", reason: preparationFault(failure.operation, failure.reason),
    };
    return unborn(preparation, `${failure.operation.toLowerCase()} failed`);
  };
  try {
    const ready = await execute().then((answer) => answer, settlePreStart);
    return "continue" in ready ? await ready.continue() : ready;
  } finally {
    born.release();
    uninstall();
  }
}
