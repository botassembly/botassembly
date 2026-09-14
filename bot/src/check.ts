// `bot check` (inspection.md): the renderer that says what would run, and the
// invocation's slot validation. What it reports, the run resolves the same way.
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { lstatExists } from "./documents.ts";
import {
  bytewise,
  fault,
  stagePath,
  type Assembly,
  type AuthoredOptions,
  type Branch,
  type ChooseNode,
  type ContainerNode,
  type Flow,
  type HomeConfig,
  type Invocation,
  type Node,
  type Sequence,
  type StageNode,
} from "./model.ts";
import { childInvocation, resolvedOptions, type OptionContext, type ResolvedOptions } from "./options.ts";
import { visibleSkills } from "./skills.ts";
import type { Refusal } from "./spine.ts";
import { MAX_SUBFLOW_CALLS, scopedSubflows } from "./subflow-scope.ts";
import { stageWorkdir } from "./workdir.ts";

interface RenderContext extends OptionContext {
  request: string[];
  faults: Refusal[];
  lines: Record<string, unknown>[];
  workdir: string;
  callPosition: number;
  selfDepth: number;
}

function renderContext(
  invocation: Invocation, assembly: Assembly, flow: Flow, home: HomeConfig, faults: Refusal[], workdir: string,
  request = [`request.${invocation.requestExtension}`], callPosition = 0, selfDepth = 1,
): RenderContext {
  return { invocation, assembly, flow, home, request, faults, lines: [], workdir, callPosition, selfDepth };
}

function validateStageWorkdir(context: RenderContext, node: StageNode | ChooseNode): void {
  if (node.kind !== "STAGE" || node.workdir === undefined) return;
  const path = stageWorkdir(context.workdir, context.workdir, node);
  if (!lstatExists(path) || !lstatSync(path).isDirectory()) {
    fault(context.faults, "path-missing", node.workdir, "Create the stage working directory.");
  }
}

function extensionOf(sequence: Sequence): string {
  const tail = sequence.nodes[sequence.nodes.length - 1];
  if (tail === undefined) return "txt";
  switch (tail.kind) {
    case "STAGE":
      return tail.extension;
    case "LOOP":
      return extensionOf(tail.sequence);
    case "CHOOSE":
      return tail.alternatives[0] === undefined ? "txt" : extensionOf(tail.alternatives[0].sequence);
    case "PARALLEL":
      return "txt";
    case "FANOUT":
      return "txt";
  }
}

/** What reaches the next node: the files the first variant delivers, and every
 *  file some alternative could deliver in their place. A choice sends one file,
 *  named after the alternative that ran (graph.md). */
interface Arriving { input: string[]; possible: string[] }

function certain(input: string[]): Arriving {
  return { input, possible: [] };
}

function possibleInputs(arriving: Arriving): Record<string, unknown> {
  return arriving.possible.length === 0 ? {} : { possible_inputs: arriving.possible };
}

function namedOutputs(branches: Branch[]): string[] {
  return branches
    .map((branch) => `${branch.name}.${extensionOf(branch.sequence)}`)
    .sort(bytewise);
}

function tailOutput(sequence: Sequence): string {
  const tail = sequence.nodes[sequence.nodes.length - 1];
  return tail === undefined ? "output.txt" : `${tail.name}.${extensionOf(sequence)}`;
}

function checkCollision(input: string[], path: string, faults: Refusal[]): void {
  const seen = new Set<string>();
  for (const name of input) {
    const source = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    if (seen.has(source)) {
      fault(faults, "input-collision", path, `Rename one of the inputs named ${source}.`);
      return;
    }
    seen.add(source);
  }
}

function containerOptions(containers: readonly ContainerNode[]): AuthoredOptions[] {
  return containers.map((container) => container.options);
}

/** One holder's options, with a model choice its rungs could not settle
 *  refused where that holder stands (ADR 0018) — the same code and sentence a
 *  run gives, since a run resolves this holder the same way (machinery.ts).
 *  A model no rung named is that same fault, asked only of the holders that
 *  run an agent: a container holds agents, it is not one (machinery.ts's
 *  visitModels), so no LOOP or PARALLEL has to settle a model of its own. */
function nodeOptions(context: RenderContext, node: Node, from: "stage" | "container", containers: ContainerNode[]): ResolvedOptions {
  const { options, intelligenceTrouble } = resolvedOptions(context, node.options, from, containerOptions(containers));
  const runs = node.kind === "STAGE" || node.kind === "CHOOSE";
  if (runs && intelligenceTrouble !== undefined) {
    fault(context.faults, "intelligence-unresolved", node.path, intelligenceTrouble);
  }
  return options;
}

function fanoutOutput(node: Extract<Node, { kind: "FANOUT" }>, context: RenderContext): string | undefined {
  const scope = scopedSubflows(context.assembly.subflows, context.flow, undefined, context.selfDepth, context.callPosition);
  const child = scope.get(node.subflow);
  if (child === undefined) {
    if (context.callPosition < MAX_SUBFLOW_CALLS) {
      fault(context.faults, "flow-unknown", node.path, `Name a subflow in scope, not ${node.subflow}.`);
    }
    return undefined;
  }
  const tail = child.sequence.nodes.at(-1);
  if (tail?.kind !== "STAGE") {
    fault(context.faults, "value-invalid", node.path, "Name a subflow whose final node is an ordinary stage.");
    return undefined;
  }
  return `<item>.${tail.extension}`;
}

function renderFanout(node: Extract<Node, { kind: "FANOUT" }>, arriving: Arriving, context: RenderContext): Arriving {
  const output = fanoutOutput(node, context);
  context.lines.push({
    stage: stagePath(node, context.flow), flow: context.flow.path, type: "FANOUT", items: node.items, subflow: node.subflow,
    width: node.width, max_items: node.maxItems, input: arriving.input, ...(output === undefined ? {} : { output }),
    ...possibleInputs(arriving),
  });
  return certain(output === undefined ? [] : [output]);
}

function renderNode(
  node: Node,
  arriving: Arriving,
  containers: ContainerNode[],
  context: RenderContext,
): Arriving {
  if (node.kind === "STAGE") {
    validateStageWorkdir(context, node);
    checkCollision(arriving.input, node.path, context.faults);
    // One flattening, shared with the run (skills.ts). What `$PWD` lends under
    // `local-context: use` is a fact of the tree a run is pointed at, not of
    // the assembly, so check reports the option and not its harvest.
    const skills = [...visibleSkills(context.assembly, context.flow, containers, node, new Map()).keys()].sort(bytewise);
    context.lines.push({
      stage: stagePath(node, context.flow),
      flow: context.flow.path,
      type: "STAGE",
      input: arriving.input,
      output: `${node.name}.${node.extension}`,
      files: node.files,
      ...(node.workdir === undefined ? {} : { workdir: node.workdir }),
      ...(skills.length === 0 ? {} : { skills }),
      options: nodeOptions(context, node, "stage", containers),
      ...possibleInputs(arriving),
    });
    return certain([`${node.name}.${node.extension}`]);
  }
  if (node.kind === "FANOUT") return renderFanout(node, arriving, context);
  return renderContainer(node, arriving, containers, context);
}

function renderContainer(node: ContainerNode, arriving: Arriving, containers: ContainerNode[], context: RenderContext): Arriving {
  const line: Record<string, unknown> = {
    stage: stagePath(node, context.flow),
    flow: context.flow.path,
    type: node.kind,
    ...(node.kind === "LOOP" ? { repeat: node.repeat } : {}),
    ...(node.kind === "PARALLEL" ? { width: node.width } : {}),
    options: nodeOptions(context, node, "container", containers),
  };
  context.lines.push(line);
  const nested = [node, ...containers];
  if (node.kind === "LOOP") {
    const prior = extensionOf(node.sequence), tail = tailOutput(node.sequence);
    renderSequence(node.sequence, {
      input: [...arriving.input, tail],
      possible: arriving.possible.length === 0 ? [] : [...arriving.possible, tail],
    }, nested, context);
    return certain([`${node.name}.${prior}`]);
  }
  const branches = node.kind === "PARALLEL" ? node.branches : node.alternatives;
  for (const branch of branches) renderSequence(branch.sequence, arriving, nested, context);
  const named = namedOutputs(branches);
  // A parallel delivers every branch file at once; a choice delivers exactly
  // one of them, so the alternatives are possibilities and not companions.
  return node.kind === "PARALLEL" || named.length < 2 ? certain(named) : { input: named.slice(0, 1), possible: named };
}

function renderSequence(
  sequence: Sequence,
  arriving: Arriving,
  containers: ContainerNode[],
  context: RenderContext,
): Arriving {
  let current = arriving;
  for (const node of sequence.nodes) current = renderNode(node, current, containers, context);
  return current;
}

interface FlowState { flow: Flow; callPosition: number; selfDepth: number }

interface ReachableFlows {
  flows: Set<Flow>;
  states: Map<Flow, FlowState[]>;
}

function nodeScopes(node: Node, state: FlowState, assembly: Assembly): Flow[] {
  if (node.kind === "STAGE" || node.kind === "CHOOSE") {
    return [...scopedSubflows(assembly.subflows, state.flow, node.kind === "STAGE" ? node : undefined,
      state.selfDepth, state.callPosition).values()];
  }
  if (node.kind !== "FANOUT") return [];
  const target = scopedSubflows(assembly.subflows, state.flow, undefined, state.selfDepth, state.callPosition).get(node.subflow);
  return target === undefined ? [] : [target];
}

function nestedSequences(node: Node): Sequence[] {
  if (node.kind === "LOOP") return [node.sequence];
  if (node.kind === "PARALLEL") return node.branches.map((branch) => branch.sequence);
  if (node.kind === "CHOOSE") return node.alternatives.map((branch) => branch.sequence);
  return [];
}

function agentScopes(sequence: Sequence, state: FlowState, assembly: Assembly): Flow[] {
  const found: Flow[] = [];
  const visit = (held: Sequence): void => {
    for (const node of held.nodes) {
      found.push(...nodeScopes(node, state, assembly));
      for (const nested of nestedSequences(node)) visit(nested);
    }
  };
  visit(sequence);
  return found;
}

function reachableFlows(assembly: Assembly, starts: FlowState[]): ReachableFlows {
  // Scope can change at the same flow as either ceiling advances. Keep those
  // traversal states exact; the separate flow sets deduplicate only output.
  const queue = [...starts], seen = new Map<Flow, Set<string>>(), flows = new Set<Flow>();
  const states = new Map<Flow, FlowState[]>();
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    const key = `${String(state.callPosition)}\0${String(state.selfDepth)}`, held = seen.get(state.flow) ?? new Set<string>();
    if (held.has(key)) continue;
    held.add(key);
    seen.set(state.flow, held);
    flows.add(state.flow);
    states.set(state.flow, [...states.get(state.flow) ?? [], state]);
    for (const flow of agentScopes(state.flow.sequence, state, assembly)) {
      queue.push({ flow, callPosition: state.callPosition + 1, selfDepth: flow.path === state.flow.path ? state.selfDepth + 1 : 1 });
    }
  }
  return { flows, states };
}

function validationFlows(initial: readonly Flow[], assembly: Assembly): Set<Flow> {
  // Validation covers the authored tree even when the reachable report stops
  // at the runtime ceiling. This preserves check's complete fault set.
  const found = new Set<Flow>(), queue = [...assembly.subflows.values(), ...initial];
  for (let flow = queue.shift(); flow !== undefined; flow = queue.shift()) {
    if (found.has(flow)) continue;
    found.add(flow);
    queue.push(...flow.subflows.values());
    const visit = (sequence: Sequence): void => {
      for (const node of sequence.nodes) {
        if (node.kind === "STAGE") queue.push(...node.subflows.values());
        else if (node.kind === "LOOP") visit(node.sequence);
        else if (node.kind === "PARALLEL") for (const branch of node.branches) visit(branch.sequence);
        else if (node.kind === "CHOOSE") for (const branch of node.alternatives) visit(branch.sequence);
      }
    };
    visit(flow.sequence);
  }
  return found;
}

function flowRows(
  invocation: Invocation, assembly: Assembly, flow: Flow, home: HomeConfig, faults: Refusal[], workdir: string,
  state: FlowState, child: boolean,
): Record<string, unknown>[] {
  const selected = child ? childInvocation(invocation) : invocation;
  const request = child ? ["request.<runtime>"] : [`request.${invocation.requestExtension}`];
  const context = renderContext(selected, assembly, flow, home, faults, workdir, request, state.callPosition, state.selfDepth);
  renderSequence(flow.sequence, certain(context.request), [], context);
  return context.lines;
}

function addFaults(target: Refusal[], candidates: readonly Refusal[]): void {
  for (const candidate of candidates) {
    if (!target.some(({ code, path, sentence }) => code === candidate.code && path === candidate.path && sentence === candidate.sentence)) {
      target.push(candidate);
    }
  }
}

function stateRows(
  invocation: Invocation, assembly: Assembly, state: FlowState, home: HomeConfig, faults: Refusal[], workdir: string,
  child: boolean,
): Record<string, unknown>[] {
  const found: Refusal[] = [];
  const rows = flowRows(invocation, assembly, state.flow, home, found, workdir, state, child);
  addFaults(faults, found);
  return rows;
}

function definition(flow: Flow): Record<string, unknown> {
  const descend = flow.maxDepth !== undefined;
  return {
    stage: `${flow.path}/${descend ? "DESCEND.md" : "FLOW.md"}`,
    flow: flow.path,
    type: descend ? "DESCEND" : "FLOW",
    max_subflow_calls: MAX_SUBFLOW_CALLS,
    ...(descend ? { max_depth: flow.maxDepth } : {}),
  };
}

function values(rows: readonly Record<string, unknown>[], field: string): unknown[] {
  const found: unknown[] = [];
  for (const row of rows) {
    const value = row[field];
    if (value !== undefined && !found.some((held) => JSON.stringify(held) === JSON.stringify(value))) found.push(value);
  }
  return found;
}

/** Every file that could arrive at one node across traversal states: each
 *  variant contributes its own possibilities where it carries them. */
function inputs(rows: readonly Record<string, unknown>[]): unknown[] {
  const found: unknown[] = [];
  for (const row of rows) {
    const held = row["possible_inputs"] ?? row["input"];
    if (!Array.isArray(held)) continue;
    for (const value of held) if (!found.includes(value)) found.push(value);
  }
  return found;
}

function consolidateRows(variants: Record<string, unknown>[][]): Record<string, unknown>[] {
  const first = variants[0] ?? [];
  return first.map((row, index) => {
    const alternatives = variants.flatMap((held) => held[index] === undefined ? [] : [held[index]]);
    const input = inputs(alternatives), outputs = values(alternatives, "output");
    const settled = input.length === 0 || JSON.stringify(input) === JSON.stringify(row["input"]);
    return {
      ...row,
      ...(settled ? {} : { possible_inputs: input }),
      ...(outputs.length > 1 ? { possible_outputs: outputs } : {}),
    };
  });
}

/** What arrives at a child context and the root cannot see, kept the way
 *  `child_outputs` keeps its artifacts. */
function childInputDifference(row: Record<string, unknown>, other: Record<string, unknown>): Record<string, unknown> {
  const held = other["possible_inputs"];
  return {
    ...(JSON.stringify(row["input"]) === JSON.stringify(other["input"]) ? {} : { child_input: other["input"] }),
    ...(held === undefined || JSON.stringify(held) === JSON.stringify(row["possible_inputs"])
      ? {} : { child_possible_inputs: held }),
  };
}

function childOutputDifference(row: Record<string, unknown>, other: Record<string, unknown>): Record<string, unknown> {
  const held = Array.isArray(other["possible_outputs"]) ? other["possible_outputs"] : other["output"] === undefined ? [] : [other["output"]];
  return held.length === 0 || held.length === 1 && held[0] === row["output"] ? {} : { child_outputs: held };
}

function mergeChildRows(root: Record<string, unknown>[], child: Record<string, unknown>[]): Record<string, unknown>[] {
  return root.map((row, index) => {
    const other = child[index];
    if (other === undefined) return row;
    return {
      ...row,
      ...(other["options"] === undefined || JSON.stringify(row["options"]) === JSON.stringify(other["options"])
        ? {} : { child_options: other["options"] }),
      ...childInputDifference(row, other),
      ...childOutputDifference(row, other),
    };
  });
}

function procedureRows(
  invocation: Invocation, assembly: Assembly, reachable: ReturnType<typeof reachableFlows>, root: Flow | undefined,
  home: HomeConfig, faults: Refusal[], workdir: string,
): Record<string, unknown>[] {
  const ordered = [...reachable.flows].filter((flow) => flow !== root).sort((a, b) => bytewise(a.path, b.path));
  if (root !== undefined) ordered.unshift(root);
  return ordered.flatMap((flow) => {
    const states = reachable.states.get(flow) ?? [];
    const rootState = root === flow ? states.find(({ callPosition }) => callPosition === 0) : undefined;
    const childStates = states.filter(({ callPosition }) => callPosition > 0);
    const childRows = consolidateRows(childStates.map((state) => stateRows(invocation, assembly, state, home, faults, workdir, true)));
    const held = rootState === undefined
      ? childRows
      : childStates.length === 0
        ? stateRows(invocation, assembly, rootState, home, faults, workdir, false)
        : mergeChildRows(stateRows(invocation, assembly, rootState, home, faults, workdir, false), childRows);
    return [definition(flow), ...held];
  });
}

function validateAllContexts(
  invocation: Invocation, assembly: Assembly, initial: readonly Flow[], root: Flow | undefined,
  home: HomeConfig, faults: Refusal[], workdir: string,
): void {
  for (const flow of validationFlows(initial, assembly)) {
    if (flow !== root) flowRows(invocation, assembly, flow, home, faults, workdir,
      { flow, callPosition: 1, selfDepth: 1 }, true);
  }
}

/** What the assembly agent arrives at: the agent runs ASSEMBLY.md itself, with
 *  no higher rung to relieve it, so its model is required here (ADR 0018). */
function wholeModel(context: RenderContext, faults: Refusal[]): ResolvedOptions {
  const { options, intelligenceTrouble } = resolvedOptions(context, {}, "stage", []);
  if (intelligenceTrouble !== undefined) {
    fault(faults, "intelligence-unresolved", "ASSEMBLY.md", intelligenceTrouble);
  }
  return options;
}

export function renderFlow(
  invocation: Invocation,
  assembly: Assembly,
  flow: Flow,
  home: HomeConfig,
  faults: Refusal[], workdir: string,
): string[] {
  const reachable = reachableFlows(assembly, [{ flow, callPosition: 0, selfDepth: 1 }]);
  validateAllContexts(invocation, assembly, [flow], flow, home, faults, workdir);
  return procedureRows(invocation, assembly, reachable, flow, home, faults, workdir).map((line) => JSON.stringify(line));
}

export function renderAssemblyAgent(
  invocation: Invocation,
  assembly: Assembly,
  home: HomeConfig,
  faults: Refusal[], workdir: string,
): string[] {
  const placeholder: Flow = {
    name: "assembly", path: "", options: {}, sequence: { path: "", nodes: [] }, skills: [], subflows: new Map(),
  };
  const context = renderContext(invocation, assembly, placeholder, home, faults, workdir);
  const options = wholeModel(context, faults);
  // A flowless invocation can name every top-level flow and subflow from its synthetic scope.
  const starts = [...assembly.flows.values(), ...assembly.subflows.values()]
    .map((flow): FlowState => ({ flow, callPosition: 1, selfDepth: 1 }));
  const reachable = reachableFlows(assembly, starts);
  validateAllContexts(invocation, assembly, [...assembly.flows.values()], undefined, home, faults, workdir);
  const collisions = [...assembly.flows.keys()].filter((name) => assembly.subflows.has(name));
  for (const name of collisions) fault(faults, "input-collision", `subflows/${name}`, `Rename the colliding flow ${name}.`);
  const assemblyRow = JSON.stringify({
    stage: "assembly",
    type: "ASSEMBLY",
    input: context.request,
    output: "assembly.txt",
    files: ["ASSEMBLY.md"],
    scope: {
      flows: [...assembly.flows.keys()].sort(bytewise),
      subflows: [...assembly.subflows.keys()].sort(bytewise),
    },
    options,
  });
  return [assemblyRow, ...procedureRows(invocation, assembly, reachable, undefined, home, faults, workdir).map((line) => JSON.stringify(line))];
}

/** What ADR 0019's two readings print as JSON — `bot config`'s ONE object and
 *  `bot models`' one object per model. Neither is the record, no more than
 *  check's own lines are, so both serialize at this same point rather than
 *  opening a second one. */
export function jsonObject(view: object): string {
  return JSON.stringify(view);
}

/** Serialize refusal faults as check-output JSON lines (not the record). */
export function refusalLines(faults: Refusal[]): string[] {
  return faults.map(({ code, path, sentence }) => JSON.stringify({ code, path, message: sentence }));
}

export function validateSuppliedSlots(invocation: Invocation, assembly: Assembly, dir: string): void {
  // Nothing is silently ignored: a --flag that is neither an option nor a
  // declared slot is a key the invocation does not accept (refusals.md).
  for (const name of [...invocation.supplied.keys()].sort(bytewise)) {
    if (!(name in assembly.slots)) {
      const retired = new Set(["model", "provider", "reasoning", "profile", "tier"]);
      const sentence = retired.has(name)
        ? `Remove the retired option --${name}; define the choice in the home intelligences table and name it with --intelligence.`
        : `Remove the unknown option --${name}.`;
      fault(invocation.faults, "key-unknown", `--${name}`, sentence);
    }
  }
  for (const name of Object.keys(assembly.slots).sort(bytewise)) {
    const value = invocation.supplied.get(name);
    // A slot IS a key bot accepts, so a value is what it is short of (0128).
    if (invocation.valueless.has(name)) {
      fault(invocation.faults, "request-invalid", `--${name}`, `Supply a value for --${name}.`);
    } else if (value === undefined) {
      fault(invocation.faults, "slot-missing", `--${name}`, `Supply the ${name} slot.`);
    } else if (!lstatExists(resolve(dir, value))) {
      fault(invocation.faults, "path-missing", value, `Name an existing path for ${name}.`);
    }
  }
}
