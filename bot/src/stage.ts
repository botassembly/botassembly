import { type Dirent } from "node:fs";
import { join } from "node:path";
import {
  HOOK_KINDS,
  entries,
  hookKind,
  readMarkdown,
  readSkills,
  validateData,
  validateJsonSchema,
  validateRunnable,
  validateSlimSchema,
} from "./documents.ts";
import {
  ACCESS_OPERATIONS,
  fault,
  stem,
  type StageAccess,
  type StageNode,
} from "./model.ts";
import type { Refusal } from "./spine.ts";

export const SENTINELS = new Set(["FLOW.md", "STAGE.md", "LOOP.md", "CHOOSE.md", "PARALLEL.md", "FANOUT.md", "DESCEND.md"]);

export function sentinelLike(name: string): boolean {
  // README.md is inert in every folder (graph.md:149): all-caps, but never
  // sentinel-shaped — no probe or strange-sentinel filter may count it.
  if (name === "README.md" || !name.endsWith(".md")) return false;
  const canonical = `${name.slice(0, -3).toUpperCase()}.md`;
  return SENTINELS.has(canonical) || name.slice(0, -3) === name.slice(0, -3).toUpperCase();
}

const BUILT_IN_SLOTS = ["INPUT", "OUTPUT", "TMP", "SKILLS", "PWD", "SUBFLOWS"];
const OPERATIONS = new Set<string>(ACCESS_OPERATIONS);
const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;

function accessNames(operation: string, entries: unknown, path: string, faults: Refusal[], slots: ReadonlySet<string>): string[] {
  if (!Array.isArray(entries)) {
    fault(faults, "value-invalid", path, `Give access.${operation} an array of names.`);
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    const managedSlot = typeof entry === "string" && (slots.has(entry) || /^[A-Z][A-Z0-9_]*$/u.test(entry));
    const valid = typeof entry === "string" && (operation === "bash" ? COMMAND_NAME.test(entry) : managedSlot);
    if (!valid) fault(faults, "value-invalid", path, `Give access.${operation} valid managed names.`);
    else if (names.includes(entry)) fault(faults, "value-invalid", path, `Remove the duplicate ${entry} from access.${operation}.`);
    else names.push(entry);
  }
  return names;
}

function setAccess(access: StageAccess, operation: string, names: string[]): void {
  if (operation === "read") access.read = names;
  else if (operation === "write") access.write = names;
  else if (operation === "edit") access.edit = names;
  else if (operation === "bash") access.bash = names;
}

function stageAccess(data: Record<string, unknown>, path: string, faults: Refusal[], slots: ReadonlySet<string>): StageAccess | undefined {
  if (!("access" in data)) return undefined;
  const value = data["access"];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fault(faults, "value-invalid", path, "Give access a mapping of tool operations to names.");
    return {};
  }
  const access: StageAccess = {};
  for (const [operation, entries] of Object.entries(value)) {
    if (!OPERATIONS.has(operation)) fault(faults, "key-unknown", path, `Remove the unknown access operation ${operation}.`);
    else setAccess(access, operation, accessNames(operation, entries, path, faults, slots));
  }
  return access;
}

function accessField(sound: boolean, data: Record<string, unknown>, path: string, faults: Refusal[], slots: ReadonlySet<string>): { access?: StageAccess } {
  if (!sound) return {};
  const access = stageAccess(data, path, faults, slots);
  return access === undefined ? {} : { access };
}

function validateStageBody(sound: boolean, body: string, path: string, faults: Refusal[]): void {
  if (sound && body.trim().length === 0) fault(faults, "body-missing", path, "Add an instruction to the stage body.");
}

export function parseSingleStage(
  filename: string,
  path: string,
  name: string,
  faults: Refusal[],
  managedSlots: ReadonlySet<string> = new Set(BUILT_IN_SLOTS),
): StageNode {
  const document = readMarkdown(filename, path, faults);
  const options = document.sound ? validateData(document.data, path, faults, ["workdir", "access"]) : {};
  const access = accessField(document.sound, document.data, path, faults, managedSlots);
  validateStageBody(document.sound, document.body, path, faults);
  return {
    kind: "STAGE",
    name,
    path,
    single: true,
    options,
    files: [filename.slice(filename.lastIndexOf("/") + 1)],
    extension: "txt",
    skills: [],
    subflows: new Map(),
    body: document.body,
    ...(typeof document.data["workdir"] === "string" ? { workdir: document.data["workdir"] } : {}),
    ...access,
  };
}

interface StageParts {
  schemas: string[];
  gateFiles: string[];
  gateDirectory: boolean;
  hooks: Map<string, string[]>;
  skills: string[];
  subflows: StageNode["subflows"];
}

function classifyDirectory(
  entry: Dirent, dir: string, relative: string, parts: StageParts, faults: Refusal[], validateSubflows: (dir: string, path: string) => StageNode["subflows"],
): boolean {
  if (!entry.isDirectory()) return false;
  if (entry.name === "gate") parts.gateDirectory = true;
  else if (entry.name === "skills") parts.skills = readSkills(join(dir, entry.name), relative, faults);
  else if (entry.name === "subflows") parts.subflows = validateSubflows(join(dir, entry.name), relative);
  else return false;
  return true;
}

function classifyFile(entry: Dirent, parts: StageParts): boolean {
  if (!entry.isFile()) return false;
  if (entry.name === "schema.json" || entry.name === "schema.md") parts.schemas.push(entry.name);
  else if (stem(entry.name) === "gate") parts.gateFiles.push(entry.name);
  else {
    const kind = hookKind(entry.name);
    if (kind === undefined) return false;
    const held = parts.hooks.get(kind) ?? [];
    held.push(entry.name);
    parts.hooks.set(kind, held);
  }
  return true;
}

function classifyStage(
  dir: string, path: string, sentinel: string, faults: Refusal[], validateSubflows: (dir: string, path: string) => StageNode["subflows"],
): StageParts {
  const parts: StageParts = {
    schemas: [], gateFiles: [], gateDirectory: false, hooks: new Map(), skills: [], subflows: new Map(),
  };
  for (const entry of entries(dir)) {
    const relative = `${path}/${entry.name}`;
    const ignored = entry.isSymbolicLink() || entry.name === sentinel || entry.name === "README.md" || sentinelLike(entry.name);
    if (ignored || classifyDirectory(entry, dir, relative, parts, faults, validateSubflows) || classifyFile(entry, parts)) continue;
    fault(faults, "entry-unknown", relative, "Remove the unrecognized stage entry.");
  }
  return parts;
}

function validateGate(dir: string, path: string, parts: StageParts, faults: Refusal[]): string[] {
  const files: string[] = [];
  // One gate per stage (stage.md, "one file of each kind"): a second gate file
  // is the same conflict — which is the gate? — as a file beside a `gate/`.
  const gates = parts.gateFiles.length + (parts.gateDirectory ? 1 : 0);
  if (gates > 1) fault(faults, "gate-conflict", path, "Keep one gate file, or one gate folder.");
  for (const name of parts.gateFiles) {
    validateRunnable(join(dir, name), `${path}/${name}`, faults);
    files.push(name);
  }
  if (!parts.gateDirectory) return files;
  const gateDir = join(dir, "gate");
  const held = entries(gateDir);
  if (held.length === 0) {
    fault(faults, "folder-empty", `${path}/gate`, "Add a gate or remove the folder.");
  }
  for (const entry of held) {
    const relative = `${path}/gate/${entry.name}`;
    // Hooks belong to the stage folder, not its gate folder.
    if (hookKind(entry.name) !== undefined) {
      fault(faults, "entry-unknown", relative, "Place hooks directly in the stage folder.");
      continue;
    }
    // An assembly holds no other (assembly.md): even a runnable ASSEMBLY.md.
    if (entry.name === "ASSEMBLY.md") fault(faults, "entry-unknown", relative, "Remove the nested assembly manifest.");
    else if (!entry.isFile()) fault(faults, "entry-unknown", relative, "Keep runnable files in gate.");
    else validateRunnable(join(gateDir, entry.name), relative, faults);
    files.push(`gate/${entry.name}`);
  }
  return files;
}

function validateHooks(dir: string, path: string, parts: StageParts, faults: Refusal[]): string[] {
  const files: string[] = [];
  for (const kind of HOOK_KINDS) {
    const names = parts.hooks.get(kind) ?? [];
    if (names.length > 1) {
      fault(faults, "hook-duplicate", `${path}/${names[1] ?? names[0] ?? kind}`, `Keep one ${kind} hook.`);
    }
    for (const name of names) {
      validateRunnable(join(dir, name), `${path}/${name}`, faults);
      files.push(name);
    }
  }
  return files;
}

export function parseStageFolder(
  dir: string,
  path: string,
  name: string,
  sentinel: string,
  faults: Refusal[],
  validateSubflows: (dir: string, path: string) => StageNode["subflows"],
  managedSlots: ReadonlySet<string> = new Set(BUILT_IN_SLOTS),
): StageNode {
  const documentPath = `${path}/${sentinel}`;
  const document = readMarkdown(join(dir, sentinel), documentPath, faults);
  const options = document.sound ? validateData(document.data, documentPath, faults, ["workdir", "access"]) : {};
  const access = accessField(document.sound, document.data, documentPath, faults, managedSlots);
  validateStageBody(document.sound, document.body, path, faults);
  const parts = classifyStage(dir, path, sentinel, faults, validateSubflows);
  if (parts.schemas.length > 1) {
    fault(faults, "schema-duplicate", path, "Keep exactly one schema.");
  } else if (parts.schemas[0] === "schema.json") {
    validateJsonSchema(join(dir, "schema.json"), `${path}/schema.json`, faults);
  } else if (parts.schemas[0] === "schema.md") {
    validateSlimSchema(join(dir, "schema.md"), `${path}/schema.md`, faults);
  }
  const schema = parts.schemas[0];
  const files = [sentinel, ...parts.schemas];
  files.push(...validateGate(dir, path, parts, faults));
  files.push(...validateHooks(dir, path, parts, faults));
  return {
    kind: "STAGE",
    name,
    path,
    options,
    files,
    extension: schema === "schema.json" ? "json" : schema === "schema.md" ? "md" : "txt",
    skills: parts.skills,
    subflows: parts.subflows,
    body: document.body,
    ...(typeof document.data["workdir"] === "string" ? { workdir: document.data["workdir"] } : {}),
    ...access,
  };
}
