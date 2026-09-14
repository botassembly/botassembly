// What a stage is handed: its model, its harness, and its machinery — the
// checklist, the schema, the gates and the hooks the record calls "the
// assembly's own machinery" (record.md). run.ts keeps the run's LIFE — birth,
// the capture, the record's first and last lines; this is everything a node
// needs once it is alive, and it is the half that grew (ticket 0117 split it out
// of run.ts at max-lines; the 0099 precedent is split, never raise). Model
// resolution sits on this side because `modelLookup` has callers on both: the
// run-start walk that refuses an unresolvable model, and each gating session.
//
// Every path built here is `context.assembly.root`'s, which since 0117 IS the
// run's capture (ADR 0016 step 8) — schema, gates, hooks and skills alike.
import type { Api, Model, Models } from "@earendil-works/pi-ai";
import { basename, join, relative } from "node:path";
import { retainPrompt } from "./attempt.ts";
import { prepareHarness, type Harness } from "./harness.ts";
import { hookKind } from "./documents.ts";
import { extractChecklist } from "./extract.ts";
import type { GatingConfig } from "./gating.ts";
import type { GatingSession, RunFlowInput, StageRuntimeContext } from "./flow.ts";
import { childInvocation, resolveNodeOptions, type ResolvedOptions } from "./options.ts";
import { OPTION_NAMES, REASONING_LEVELS, fault, stem, type Assembly, type AuthoredOptions, type ChooseNode, type Flow, type ReasoningLevel, type Sequence, type StageNode } from "./model.ts";
import type { Executable } from "./process.ts";
import { type OptionLadder, type StageSlots } from "./record-events.ts";
import { hashBytes, type AssemblyPrehash } from "./record.ts";
import { retryModel } from "./credentials.ts";
import type { Accepted } from "./reader.ts";
import { promptConstruction, stageFile } from "./prompt-assembly.ts";
import type { ModelFacts, Refusal } from "./spine.ts";
import { SlotExecutionEnv, createControlContext, createFileTools } from "./tools.ts";

const RESOLVED_OPTION_NAMES = ["provider", "model", "reasoning", ...OPTION_NAMES] as const;

function optionLadder(options: ResolvedOptions): OptionLadder {
  return RESOLVED_OPTION_NAMES.flatMap((name) => {
    const value = options[name];
    return value === undefined ? [] : [{ name, value: value.value, rung: value.from }];
  });
}

function modelLookup(models: Models, options: ResolvedOptions): { model?: Model<Api>; candidates?: string[] } {
  const name = options.model?.value;
  if (typeof name !== "string") return {};
  const provider = options.provider?.value;
  if (typeof provider === "string") {
    const held = models.getModel(provider, name);
    return held === undefined ? {} : { model: held };
  }
  const matches = models.getModels().filter((model) => model.id === name);
  const only = matches[0];
  if (matches.length === 1 && only !== undefined) return { model: only };
  return matches.length === 0 ? {} : { candidates: matches.map((model) => model.provider) };
}

function visitModels(
  sequence: Sequence,
  containers: readonly AuthoredOptions[],
  inspect: (node: StageNode | ChooseNode, containers: readonly AuthoredOptions[]) => void,
): void {
  for (const node of sequence.nodes) {
    if (node.kind === "STAGE") inspect(node, containers);
    else if (node.kind === "LOOP") visitModels(node.sequence, [node.options, ...containers], inspect);
    else if (node.kind === "PARALLEL" || node.kind === "CHOOSE") {
      if (node.kind === "CHOOSE") inspect(node, containers);
      const branches = node.kind === "CHOOSE" ? node.alternatives : node.branches;
      for (const branch of branches) visitModels(branch.sequence, [node.options, ...containers], inspect);
    }
  }
}

function childFlows(assembly: Assembly, flow: Flow): Flow[] {
  const held = [...assembly.subflows.values(), ...flow.subflows.values()];
  if (flow.maxDepth !== undefined) held.push(flow);
  visitModels(flow.sequence, [], (node) => {
    if (node.kind === "STAGE") held.push(...node.subflows.values());
  });
  return held;
}

// Every model failure names the model string as authored, the rung it resolved
// from, what the runtime observed, and one command (ticket 0283). The observed
// fact is always the catalog Bot read and the credentials Bot can see: nothing
// here claims a model is retired, or unavailable anywhere but here.
//
// Four faults, two codes (invariant 39). `model-unresolved` covers a name no
// catalog row matches, a name several providers match, and no name at any rung,
// which a subflow reaches by inheriting none of the command line's
// (subflow.md). `credential-missing` covers a row that matched and a provider
// Bot holds no credential for, whose fix is `bot auth login` and no other. The
// credentialed set is pi-ai's own answer to which providers have complete auth,
// read at admission with no model call, so it cannot rot.
interface ModelRefusal { code: "model-unresolved" | "credential-missing"; sentence: string; facts: ModelFacts }

function refusal(code: ModelRefusal["code"], facts: ModelFacts, observed: string): ModelRefusal {
  const named = facts.model === null ? "" : `Model ${facts.model} resolves from the ${String(facts.rung)} rung. `;
  return { code, facts, sentence: `${named}${observed} ${facts.action}` };
}

function modelRefusal(
  options: ResolvedOptions, lookup: ReturnType<typeof modelLookup>, credentialed: ReadonlySet<string>,
): ModelRefusal | undefined {
  const named = options.model?.value, rung = options.model?.from ?? null;
  const provider = typeof options.provider?.value === "string" ? options.provider.value : null;
  const held = lookup.model;
  if (held === undefined) return unmatched(named, rung, provider, lookup.candidates);
  if (credentialed.has(held.provider)) return undefined;
  return refusal("credential-missing",
    { model: String(named), provider: held.provider, rung, cause: "provider-unconfigured", action: `Run bot auth login ${held.provider}.` },
    `Provider ${held.provider} offers it, and Bot found no credential for ${held.provider}.`);
}

/** The two shapes of `model-unresolved`: several catalog rows match the name, or
 *  none does. No rung can leave a model unnamed: `model` is retired as an
 *  authored option, and a home intelligence row that omits one is refused as
 *  `key-missing` and never enters the table (home-config.ts). */
function unmatched(named: unknown, rung: string | null, provider: string | null, candidates: string[] | undefined): ModelRefusal {
  if (typeof named !== "string") throw new TypeError("Resolved model is not a string.");
  if (candidates !== undefined) {
    return refusal("model-unresolved",
      { model: named, provider: null, rung, cause: "selection-ambiguous", action: "Set provider on the intelligence row to one of them." },
      `Providers ${candidates.join(", ")} each offer that name.`);
  }
  return refusal("model-unresolved",
    { model: named, provider, rung, cause: "model-invalid", action: `Run bot model list${provider === null ? "" : ` ${provider}`} to see the names it holds.` },
    `The catalog Bot read holds no model of that name ${provider === null ? "under any provider" : `under provider ${provider}`}.`);
}

// A child FLOW.md naming an unresolvable model refuses upfront, same rule as
// the root (0027 finding): every reachable subflow is walked at run start,
// resolved as the child will resolve — without the parent invocation's rungs.
export async function modelFaults(
  read: Accepted, flow: Flow, models: Models,
): Promise<Refusal[]> {
  const faults: Refusal[] = [];
  const credentialed = new Set((await models.getAvailable()).map((model) => model.provider));
  const asChild = { ...read, invocation: childInvocation(read.invocation) };
  const seen = new Map<Flow, Set<typeof read>>();
  const queue: { flow: Flow; read: typeof read }[] = [{ flow, read }];
  for (let held = queue.shift(); held !== undefined; held = queue.shift()) {
    const readings = seen.get(held.flow);
    if (readings?.has(held.read)) continue;
    if (readings === undefined) seen.set(held.flow, new Set([held.read]));
    else readings.add(held.read);
    const scope = held;
    visitModels(scope.flow.sequence, [], (node, containers) => {
      const { options, intelligenceTrouble } = resolveNodeOptions(scope.read.invocation, scope.read.assembly, scope.flow, scope.read.home, node, containers);
      if (intelligenceTrouble !== undefined) {
        fault(faults, "intelligence-unresolved", node.path, intelligenceTrouble);
        return;
      }
      const trouble = modelRefusal(options, modelLookup(models, options), credentialed);
      if (trouble === undefined) return;
      fault(faults, trouble.code, node.path, trouble.sentence, trouble.facts);
    });
    for (const child of childFlows(read.assembly, scope.flow)) queue.push({ flow: child, read: asChild });
  }
  return faults;
}

function optionNumber(options: ResolvedOptions, name: "timeout" | "retries"): number {
  const value = options[name]?.value;
  if (typeof value !== "number") throw new TypeError(`Resolved ${name} is not a number.`);
  return value;
}

function thinking(options: ResolvedOptions): ReasoningLevel {
  const value = options.reasoning?.value;
  const level = REASONING_LEVELS.find((held) => held === value);
  if (level === undefined) throw new TypeError(value === undefined ? "Reasoning did not resolve." : "Resolved reasoning is not a thinking level.");
  return level;
}

function executable(root: string, prehash: AssemblyPrehash, file: string): Executable {
  const sha256 = prehash.files.get(file);
  if (sha256 === undefined) throw new TypeError(`Assembly hash has no entry for ${file}.`);
  return { path: join(root, ...file.split("/")), file, sha256 };
}

function stageSchema(context: StageRuntimeContext, files: { name: string; file: string }[]) {
  const schema = files.find(({ name }) => name === "schema.json" || name === "schema.md");
  if (schema === undefined) return undefined;
  return {
    kind: schema.name === "schema.json" ? "json" as const : "markdown" as const,
    path: join(context.assembly.root, ...schema.file.split("/")),
  };
}

function stageHooks(context: StageRuntimeContext, prehash: AssemblyPrehash, files: { name: string; file: string }[]) {
  const hooks: Partial<Record<"before" | "success" | "failure", Executable>> = {};
  for (const held of files) {
    const kind = hookKind(basename(held.name));
    if (kind !== undefined) hooks[kind] = executable(context.assembly.root, prehash, held.file);
  }
  return hooks;
}

// Hash the complete identity because provider cache keys truncate structured values; the writer separates concurrent child runs while stage/repeat preserve retry affinity.
function providerSessionId(context: StageRuntimeContext): string { const runId = context.env["BOT_RUN_ID"]; if (runId === undefined || runId.length === 0) throw new TypeError("BOT_RUN_ID is required for provider session identity."); return hashBytes(`${runId}:${context.writer.runDirectory}:${context.flow.name}:${context.identity.stage}:${String(context.identity.repeat ?? 1)}`); }
function workdir(context: StageRuntimeContext) { return { authored: context.node.kind === "STAGE" ? context.node.workdir ?? null : null, resolved: relative(context.workdirRoot, context.env["PWD"] ?? "/") || "." }; }
function stageSlots(context: StageRuntimeContext): StageSlots {
  const { PWD: pwd, INPUT: input, OUTPUT: output, TMP: tmp, SKILLS: skills, SUBFLOWS: subflows } = context.env;
  if (pwd === undefined || input === undefined || output === undefined || tmp === undefined || skills === undefined) throw new TypeError(`A work-mode node minted incomplete slots: ${context.node.path}`);
  return { pwd, input, output, tmp, skills, ...(subflows === undefined ? {} : { subflows }) };
}

function machinery(context: StageRuntimeContext, prehash: AssemblyPrehash, assemblyRun: boolean): Pick<GatingConfig & { mode: "stage" }, "checklist" | "schema" | "gates" | "hooks"> {
  if (context.node.kind !== "STAGE") return {};
  const root = context.assembly.root;
  const files = context.node.files.map((name) => ({ name, file: stageFile(context, name) }));
  const schema = stageSchema(context, files);
  const gates = files.filter(({ name }) => stem(basename(name)) === "gate" || name.startsWith("gate/"))
    .map(({ file }) => executable(root, prehash, file));
  const hooks = stageHooks(context, prehash, files);
  return {
    // The assembly agent has no checklist (invocation.md): a `## Checklist`
    // heading in the synthetic stage's ASSEMBLY.md prose is prose.
    checklist: assemblyRun && context.origin === "root" ? [] : extractChecklist(context.node.body ?? ""),
    ...(schema === undefined ? {} : { schema }),
    ...(gates.length === 0 ? {} : { gates }),
    ...(Object.keys(hooks).length === 0 ? {} : { hooks }),
  };
}

export function defaultGating(
  read: Accepted, models: Models, prehash: AssemblyPrehash,
): RunFlowInput["createGating"] {
  return async (context): Promise<GatingSession> => {
    const options = context.options;
    const model = modelLookup(models, options).model;
    if (model === undefined) throw new TypeError(`No unique model for ${context.node.path}.`);
    // Hooks and gates keep the backing paths in context.env; only the agent's
    // file tools and shell receive the short stage-slot handles.
    const agentEnv = { ...context.env, TMP: context.slots["TMP"], TMPDIR: context.slots["TMPDIR"] };
    const execution = new SlotExecutionEnv({ cwd: context.env["PWD"] ?? "/", shellEnv: agentEnv }, context.slots);
    const prepared = await prepareHarness(execution, context.sessionFile, { cwd: context.env["PWD"] ?? "/", id: providerSessionId(context), createdAt: Date.parse(context.clock.timestamp()) });
    let harness: Harness<ReturnType<typeof createControlContext>> | undefined;
    const constructing = Promise.resolve().then(async (): Promise<GatingSession> => {
      const controls = createControlContext([], [], execution);
      const tools = [...context.tools, ...createFileTools(agentEnv)];
      const configuredMachinery = machinery(context, prehash, read.flow === undefined);
      const construction = await promptConstruction(context);
      harness = prepared.create({
        models,
        model: retryModel(model, { writer: context.writer, identity: context.identity, clock: context.clock, now: () => context.clock.timestamp(), rung: options.model?.from ?? "resolved" }), thinkingLevel: thinking(options),
        // Rendered once, per stage-repeat (ADR 0012), and retained as it is handed
        // over: the harness gets the string the file holds, not one built twice.
        systemPrompt: await retainPrompt(context.sessionFile, "system.txt", construction.system),
        tools, context: controls,
      });
      const common = {
        timeoutMs: optionNumber(options, "timeout") * 1_000, retries: optionNumber(options, "retries"),
        cwd: context.env["PWD"] ?? "/", env: context.env, inputPath: context.inputPath,
        session: context.sessionPath, received: context.received, options: optionLadder(options),
        priorFailureInputs: context.priorFailureInputs,
        ...(context.mode.kind === "choose" ? {} : { slots: stageSlots(context) }), workdir: workdir(context),
        tools: tools.map(({ name, description }) => ({ name, description })),
        skills: [...context.skills].map(([name, skill]) => ({ name, source: skill.source })),
        promptSources: construction.sources,
      };
      let config: GatingConfig;
      if (context.mode.kind === "choose") config = { ...common, mode: "choose", alternatives: context.mode.alternatives };
      else {
        if (context.outputPath === undefined) throw new TypeError(`A work-mode node minted no output path: ${context.node.path}`);
        const work = { ...common, outputPath: context.outputPath, outputExtension: context.node.kind === "STAGE" ? context.node.extension : "txt" as const, ...configuredMachinery };
        config = context.mode.kind === "loop" ? { ...work, mode: "loop", question: context.mode.question } : { ...work, mode: "stage" };
      }
      return { harness, controls, config, close: () => harness?.close() ?? Promise.resolve() };
    });
    return constructing.then(
      (session) => session,
      (reason: unknown) => (harness?.close() ?? prepared.close()).then(
        () => Promise.reject(reason instanceof Error ? reason : new Error("Harness construction failed.", { cause: reason })),
        (cleanupReason: unknown) => Promise.reject(cleanupReason instanceof Error ? cleanupReason : new Error("Harness cleanup failed.", { cause: cleanupReason })),
      ),
    );
  };
}
