import { lstatSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ASSEMBLY_TRAVERSAL_POLICY, grammarAssemblyRoot, includeAssemblyRoot, parseAssemblyTraversalPolicy, policyForRootEntries, type AssemblyTraversalPolicy } from "./assembly-policy.ts";
import { allEntries, entries, lstatExists, readMarkdown, readSkills, validTmpMaxBytes, validateData } from "./documents.ts";
import { parseFlowCollection } from "./graph.ts";
import { DEFAULT_TMP_MAX_BYTES, fault, type Assembly, type Flow, type Node, type Sequence } from "./model.ts";
import type { Refusal } from "./spine.ts";

const RUNTIME_SLOTS = new Set(["INPUT", "OUTPUT", "TMP", "SKILLS", "PWD"]);

function findSymlinks(dir: string, path: string, faults: Refusal[], policy: AssemblyTraversalPolicy): void {
  for (const entry of entries(dir)) {
    if (path.length === 0 && !includeAssemblyRoot(policy, entry)) continue;
    const relative = path.length === 0 ? entry.name : `${path}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      fault(faults, "symlink", relative, "Replace the symbolic link with an assembly entry.");
    } else if (entry.isDirectory()) {
      findSymlinks(join(dir, entry.name), relative, faults, policy);
    }
  }
}

function invalidSlotCharacter(name: string): string | undefined {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return undefined;
  if (/^[A-Za-z_]/.test(name)) return name.match(/[^A-Za-z0-9_]/u)?.[0] ?? "";
  return Array.from(name)[0] ?? "";
}

function declaredSlots(data: Record<string, unknown>, faults: Refusal[], env: NodeJS.ProcessEnv): Record<string, string> {
  const value = data["slots"];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const slots: Record<string, string> = {};
  Object.setPrototypeOf(slots, null);
  const declarations = new Map<string, string>();
  for (const [name, description] of Object.entries(value)) {
    if (typeof description !== "string") continue;
    const character = invalidSlotCharacter(name);
    if (character !== undefined) {
      fault(faults, "slot-reserved", "ASSEMBLY.md", `Rename the unusable slot ${name}; ${character} is not valid in a slot name.`);
      continue;
    }
    slots[name] = description;
    const exported = name.toUpperCase();
    const first = declarations.get(exported);
    if (first !== undefined) {
      fault(faults, "slot-reserved", "ASSEMBLY.md", `Rename ${name}; its export ${exported} collides with ${first}.`);
    } else {
      declarations.set(exported, name);
    }
    if (RUNTIME_SLOTS.has(exported) || env[exported] !== undefined) {
      fault(faults, "slot-reserved", "ASSEMBLY.md", `Rename the reserved slot ${name}.`);
    }
  }
  return slots;
}

function validateStageAccess(held: Extract<Node, { kind: "STAGE" }>, declared: ReadonlySet<string>, subflows: boolean, faults: Refusal[]): void {
  const available = new Set(declared);
  if (subflows || held.subflows.size > 0) available.add("SUBFLOWS");
  for (const operation of ["read", "write", "edit"] as const) {
    for (const slot of held.access?.[operation] ?? []) {
      if (!available.has(slot)) fault(faults, "value-invalid", held.path, `Name an available managed slot in access.${operation}, not ${slot}.`);
    }
  }
  validateAccessSlots(held.subflows, declared, true, faults);
}

function validateAccessNode(held: Node, declared: ReadonlySet<string>, subflows: boolean, faults: Refusal[]): void {
  const sequence = (value: Sequence): void => { value.nodes.forEach((node) => { validateAccessNode(node, declared, subflows, faults); }); };
  if (held.kind === "STAGE") validateStageAccess(held, declared, subflows, faults);
  else if (held.kind === "LOOP") sequence(held.sequence);
  else if (held.kind === "PARALLEL" || held.kind === "CHOOSE") {
    for (const branch of held.kind === "PARALLEL" ? held.branches : held.alternatives) sequence(branch.sequence);
  }
}

function validateAccessSlots(flows: ReadonlyMap<string, Flow>, declared: ReadonlySet<string>, inheritedSubflows: boolean, faults: Refusal[]): void {
  for (const flow of flows.values()) {
    const subflows = inheritedSubflows || flow.subflows.size > 0;
    for (const node of flow.sequence.nodes) validateAccessNode(node, declared, subflows, faults);
    validateAccessSlots(flow.subflows, declared, true, faults);
  }
}

function validateRootEntries(root: string, faults: Refusal[], policy: AssemblyTraversalPolicy): void {
  for (const entry of entries(root)) {
    if (!includeAssemblyRoot(policy, entry) || entry.isSymbolicLink()) continue;
    if ((entry.name === "skills" || entry.name === "subflows") && !entry.isDirectory()) {
      fault(faults, "entry-unknown", entry.name, `Make ${entry.name} a directory.`);
    } else if (!grammarAssemblyRoot(entry.name)) {
      fault(faults, "entry-unknown", entry.name, "Remove the unrecognized assembly entry.");
    }
  }
}

function resolvedTmpMaxBytes(data: Record<string, unknown>): number {
  const ceiling = data["tmp-max-bytes"];
  return validTmpMaxBytes(ceiling) ? ceiling : DEFAULT_TMP_MAX_BYTES;
}

function traversalPolicy(data: Record<string, unknown>, root: string, faults: Refusal[]): AssemblyTraversalPolicy {
  const parsed = parseAssemblyTraversalPolicy(data);
  for (const name of parsed.invalid) fault(faults, "value-invalid", "ASSEMBLY.md", `Give ${name} a valid value.`);
  const rooted = policyForRootEntries(parsed, allEntries(root));
  if (rooted.foldersHaveWrongKind) {
    fault(faults, "value-invalid", "ASSEMBLY.md", "Give folders names of real directories.");
  }
  return rooted.policy;
}

export function readAssembly(root: string, env: NodeJS.ProcessEnv): Assembly {
  const faults: Refusal[] = [];
  let options = {};
  let tmpMaxBytes = DEFAULT_TMP_MAX_BYTES;
  let body = "";
  let slots: Record<string, string> = {};
  let policy = DEFAULT_ASSEMBLY_TRAVERSAL_POLICY;
  const manifest = join(root, "ASSEMBLY.md");
  if (!lstatExists(manifest)) {
    fault(faults, "assembly-incomplete", "ASSEMBLY.md", "Add ASSEMBLY.md.");
  } else if (!lstatSync(manifest).isSymbolicLink()) {
    const document = readMarkdown(manifest, "ASSEMBLY.md", faults);
    body = document.body;
    if (document.sound) {
      options = validateData(document.data, "ASSEMBLY.md", faults, ["slots", "tmp-max-bytes", "strict", "folders"]);
      tmpMaxBytes = resolvedTmpMaxBytes(document.data);
      slots = declaredSlots(document.data, faults, env);
      policy = traversalPolicy(document.data, root, faults);
    }
  }
  findSymlinks(root, "", faults, policy);
  validateRootEntries(root, faults, policy);
  const flowDir = join(root, "flows");
  let flows = new Map<string, Flow>();
  if (!lstatExists(flowDir) || !lstatSync(flowDir).isDirectory()) {
    fault(faults, "assembly-incomplete", "flows", "Add the flows folder.");
  } else {
    flows = parseFlowCollection(flowDir, "flows", faults);
  }
  const skillDir = join(root, "skills");
  const skills = lstatExists(skillDir) && lstatSync(skillDir).isDirectory()
    ? readSkills(skillDir, "skills", faults)
    : [];
  const subflowDir = join(root, "subflows");
  const subflows = lstatExists(subflowDir) && lstatSync(subflowDir).isDirectory()
    ? parseFlowCollection(subflowDir, "subflows", faults)
    : new Map<string, Flow>();
  const managedSlots = new Set([...RUNTIME_SLOTS, ...Object.keys(slots).map((name) => name.toUpperCase())]);
  validateAccessSlots(flows, managedSlots, subflows.size > 0, faults);
  validateAccessSlots(subflows, managedSlots, true, faults);
  return { root, tmpMaxBytes, options, slots, skills, flows, subflows, faults, body };
}
