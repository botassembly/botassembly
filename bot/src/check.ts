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
import { stageWorkdir } from "./workdir.ts";

interface RenderContext extends OptionContext {
  request: string[];
  faults: Refusal[];
  lines: Record<string, unknown>[];
  children: Flow[];
  workdir: string;
}

function renderContext(
  invocation: Invocation, assembly: Assembly, flow: Flow, home: HomeConfig, faults: Refusal[], workdir: string,
): RenderContext {
  return { invocation, assembly, flow, home, request: [`request.${invocation.requestExtension}`], faults, lines: [], children: [], workdir };
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
  if (runs && intelligenceTrouble !== undefined && !context.invocation.valueless.has("intelligence")) {
    fault(context.faults, "intelligence-unresolved", node.path, intelligenceTrouble);
  }
  return options;
}

function renderFanout(node: Extract<Node, { kind: "FANOUT" }>, input: string[], context: RenderContext): string[] {
  const scope = new Map([...context.assembly.subflows, ...context.flow.subflows]);
  if (scope.get(context.flow.name) === context.flow) scope.delete(context.flow.name);
  const child = scope.get(node.subflow);
  const tail = child?.sequence.nodes.at(-1);
  if (child === undefined) {
    fault(context.faults, "flow-unknown", node.path, `Name a subflow in scope, not ${node.subflow}.`);
  } else if (tail?.kind !== "STAGE") {
    fault(context.faults, "value-invalid", node.path, "Name a subflow whose final node is an ordinary stage.");
  } else {
    context.children.push(child);
  }
  const extension = tail?.kind === "STAGE" ? tail.extension : "txt";
  context.lines.push({
    stage: stagePath(node, context.flow), type: "FANOUT", items: node.items, subflow: node.subflow,
    width: node.width, max_items: node.maxItems, input, output: `<item>.${extension}`,
  });
  return [`<item>.${extension}`];
}

function renderNode(
  node: Node,
  input: string[],
  containers: ContainerNode[],
  context: RenderContext,
): string[] {
  if (node.kind === "STAGE") {
    validateStageWorkdir(context, node);
    checkCollision(input, node.path, context.faults);
    context.children.push(...node.subflows.values());
    // One flattening, shared with the run (skills.ts). What `$PWD` lends under
    // `local-context: use` is a fact of the tree a run is pointed at, not of
    // the assembly, so check reports the option and not its harvest.
    const skills = [...visibleSkills(context.assembly, context.flow, containers, node, new Map()).keys()].sort(bytewise);
    context.lines.push({
      stage: stagePath(node, context.flow),
      type: "STAGE",
      input,
      output: `${node.name}.${node.extension}`,
      files: node.files,
      ...(node.workdir === undefined ? {} : { workdir: node.workdir }),
      ...(skills.length === 0 ? {} : { skills }),
      options: nodeOptions(context, node, "stage", containers),
    });
    return [`${node.name}.${node.extension}`];
  }
  if (node.kind === "FANOUT") return renderFanout(node, input, context);
  const line: Record<string, unknown> = {
    stage: stagePath(node, context.flow),
    type: node.kind,
    ...(node.kind === "LOOP" ? { repeat: node.repeat } : {}),
    ...(node.kind === "PARALLEL" ? { width: node.width } : {}),
    options: nodeOptions(context, node, "container", containers),
  };
  context.lines.push(line);
  const nested = [node, ...containers];
  if (node.kind === "LOOP") {
    const prior = extensionOf(node.sequence);
    renderSequence(node.sequence, [...input, tailOutput(node.sequence)], nested, context);
    return [`${node.name}.${prior}`];
  }
  const branches = node.kind === "PARALLEL" ? node.branches : node.alternatives;
  for (const branch of branches) renderSequence(branch.sequence, input, nested, context);
  return namedOutputs(branches);
}

function renderSequence(
  sequence: Sequence,
  input: string[],
  containers: ContainerNode[],
  context: RenderContext,
): string[] {
  let current = input;
  for (const node of sequence.nodes) current = renderNode(node, current, containers, context);
  return current;
}

/** Every reachable subflow, rendered as its own child: a run walks them all
 *  before it starts (machinery.ts's modelFaults), so check refuses the same
 *  tree, same code at the same path (inspection.md). A child inherits none of
 *  the invocation (subflow.md); the identity guard terminates the walk, one
 *  flow re-entering under every scope that holds it; faults are kept and lines
 *  dropped, so `--json` stays the invoked flow's own. Ruled divergences: D1,
 *  check holds no Models catalogue by spec (inspection.md) — presence and
 *  intelligence resolution only, as at the root; D2, check's container-trouble
 *  superset (a bad container choice faults at the container's path AND the
 *  stage's) reaches children as it reaches the root, and stands. */
function walkChildren(context: RenderContext): void {
  const { assembly, home, faults } = context;
  const queue = [...assembly.subflows.values(), ...context.flow.subflows.values(), ...context.children];
  const seen = new Set<Flow>();
  for (let flow = queue.shift(); flow !== undefined; flow = queue.shift()) {
    if (seen.has(flow)) continue;
    seen.add(flow);
    const child = renderContext(childInvocation(context.invocation), assembly, flow, home, faults, context.workdir);
    renderSequence(flow.sequence, child.request, [], child);
    queue.push(...flow.subflows.values(), ...child.children);
  }
}

/** What the assembly agent arrives at: the agent runs ASSEMBLY.md itself, with
 *  no higher rung to relieve it, so its model is required here (ADR 0018). */
function wholeModel(context: RenderContext, faults: Refusal[]): ResolvedOptions {
  const { options, intelligenceTrouble } = resolvedOptions(context, {}, "stage", []);
  if (intelligenceTrouble !== undefined && !context.invocation.valueless.has("intelligence")) {
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
  const context = renderContext(invocation, assembly, flow, home, faults, workdir);
  renderSequence(flow.sequence, context.request, [], context);
  walkChildren(context);
  return context.lines.map((line) => JSON.stringify(line));
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
  // A flowless invocation runs a synthetic scope of every flow and every subflow (run.ts), all of it validated first.
  context.children.push(...assembly.flows.values());
  walkChildren(context);
  const collisions = [...assembly.flows.keys()].filter((name) => assembly.subflows.has(name));
  for (const name of collisions) fault(faults, "input-collision", `subflows/${name}`, `Rename the colliding flow ${name}.`);
  return [JSON.stringify({
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
  })];
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
