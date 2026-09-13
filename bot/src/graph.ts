import { type Dirent } from "node:fs";
import { join } from "node:path";
import {
  entries,
  hookKind,
  readMarkdown,
  readSkills,
  validateData,
} from "./documents.ts";
import {
  bytewise,
  FANOUT_MAX,
  fault,
  nodeName,
  numberOf,
  sequenceName,
  stem,
  type AuthoredOptions,
  type Branch,
  type ChooseNode,
  type Flow,
  type Node,
  type ParallelNode,
  type Sequence,
} from "./model.ts";
import { SENTINELS, parseSingleStage, parseStageFolder, sentinelLike } from "./stage.ts";
import { extractAlternatives } from "./extract.ts";
import { parseFanout, validateFanoutPlacement } from "./fanout-authored.ts";
import type { Refusal, Sentinel } from "./spine.ts";

const SENTINEL_BY_FILE = new Map<string, Sentinel>([
  ["FLOW.md", "FLOW"],
  ["STAGE.md", "STAGE"],
  ["LOOP.md", "LOOP"],
  ["CHOOSE.md", "CHOOSE"],
  ["PARALLEL.md", "PARALLEL"],
  ["FANOUT.md", "FANOUT"],
  ["DESCEND.md", "DESCEND"],
]);
const CONTAINER_FILES = new Set(["schema.json", "schema.md", "gate", "checklist.md"]);

type Entry = Dirent;

function sentinelType(name: string): Sentinel {
  const held = SENTINEL_BY_FILE.get(name);
  if (held === undefined) throw new TypeError(`Unknown sentinel file: ${name}`);
  return held;
}

// The sentinels this position takes, spelled out: "the required sentinel" named
// the rule and left the file to be guessed at (0128). The list is the caller's
// own `allowed` set, so a position that gains one says so with no edit here.
function sentinelList(allowed: ReadonlySet<string>): string {
  const names = [...allowed];
  return names.slice(0, -1).join(", ") + (names.length > 1 ? " or " : "") + (names[names.length - 1] ?? "");
}

function inspectSentinel(
  held: Entry[],
  path: string,
  allowed: ReadonlySet<string>,
  faults: Refusal[],
): string | undefined {
  const exact = held.filter((entry) => SENTINELS.has(entry.name));
  const strange = held.filter((entry) => sentinelLike(entry.name) && !SENTINELS.has(entry.name));
  for (const entry of strange) {
    // An assembly holds no other (assembly.md), so no position takes this one
    // and offering the valid list would send the reader looking for nothing.
    fault(faults, "sentinel-unknown", `${path}/${entry.name}`, entry.name === "ASSEMBLY.md"
      ? "Remove ASSEMBLY.md; an assembly holds no assembly inside it."
      : `Rename ${entry.name}, or make it ${sentinelList(allowed)}.`);
  }
  if (exact.length > 1) {
    fault(faults, "sentinel-duplicate", path, "Keep exactly one sentinel.");
    return undefined;
  }
  const found = exact[0];
  if (found === undefined) {
    if (strange.length === 0) fault(faults, "sentinel-missing", path, `Add ${sentinelList(allowed)} to this folder.`);
    return undefined;
  }
  if (!allowed.has(found.name)) {
    fault(faults, "sentinel-unknown", `${path}/${found.name}`, `Use ${sentinelList(allowed)} here.`);
    return undefined;
  }
  return found.name;
}

function containerArtifact(entry: Entry): boolean {
  const base = stem(entry.name);
  return CONTAINER_FILES.has(entry.name) || base === "gate" || hookKind(entry.name) !== undefined;
}

function validateContainerEntries(dir: string, path: string, sentinel: string, faults: Refusal[]): Set<string> {
  const ignored = new Set([sentinel, "README.md"]);
  for (const entry of entries(dir)) {
    if (containerArtifact(entry)) {
      fault(faults, "container-check", `${path}/${entry.name}`, "Move checks and hooks onto a stage.");
      ignored.add(entry.name);
    }
  }
  return ignored;
}

// A flow or a container may carry `skills/` (skills.md): the folder is a scope
// for the stages beneath it, not a branch and not a sequence entry, so it
// leaves the candidate set. One harvest, so the two cannot drift apart.
function skillsFolder(dir: string, path: string, faults: Refusal[], ignored: Set<string>): string[] {
  if (!entries(dir).some((entry) => entry.name === "skills" && entry.isDirectory())) return [];
  ignored.add("skills");
  return readSkills(join(dir, "skills"), `${path}/skills`, faults);
}

function parseNodeDirectory(
  dir: string,
  path: string,
  name: string,
  faults: Refusal[],
  inLoop: boolean,
): Node | undefined {
  const held = entries(dir);
  const allowed = new Set(["STAGE.md", "LOOP.md", "CHOOSE.md", "PARALLEL.md", "FANOUT.md"]);
  const sentinel = inspectSentinel(held, path, allowed, faults);
  if (sentinel === undefined) return undefined;
  const validateSubflows = (childDir: string, childPath: string): Map<string, Flow> =>
    parseFlowCollection(childDir, childPath, faults);
  switch (sentinelType(sentinel)) {
    case "STAGE":
      return parseStageFolder(dir, path, name, sentinel, faults, validateSubflows);
    case "LOOP":
      return parseLoop(dir, path, name, sentinel, faults, inLoop);
    case "PARALLEL":
      return parseParallel(dir, path, name, sentinel, faults, inLoop);
    case "FANOUT":
      return parseFanout(dir, path, name, sentinel, validateContainerEntries(dir, path, sentinel, faults), faults);
    case "CHOOSE":
      return parseChoose(dir, path, name, sentinel, faults, inLoop);
    case "FLOW":
    case "DESCEND":
      return undefined;
  }
}

interface Candidate {
  entry: Entry;
  number?: number;
}

function sequenceEntry(entry: Entry): boolean {
  if (entry.isDirectory()) return true;
  return entry.isFile() ? entry.name.endsWith(".md") : false;
}

function numberedCandidate(entry: Entry, path: string, numbers: Map<number, string>, faults: Refusal[]): Candidate {
  // At most nine digits (flow.md): checked on the digits themselves, before
  // Number() could collapse distinct over-long numerals into one value.
  if (/^\d{10,}-/.test(entry.name)) {
    fault(faults, "number-invalid", `${path}/${entry.name}`, "Use a sequence number of at most nine digits.");
    return { entry };
  }
  const authoredName = entry.isFile() && entry.name.endsWith(".md") ? entry.name.slice(0, -3) : entry.name;
  const number = sequenceName(authoredName) ? numberOf(authoredName) : undefined;
  if (number === undefined) {
    fault(faults, "number-missing", `${path}/${entry.name}`, "Add a leading sequence number.");
    return { entry };
  }
  // The partner is named, not left to be hunted: the entries arrive bytewise,
  // so the one already holding the number is the earlier of the two (0128).
  const partner = numbers.get(number);
  if (partner === undefined) numbers.set(number, entry.name);
  else fault(faults, "number-duplicate", `${path}/${entry.name}`, `Renumber ${entry.name} or ${partner} — both are numbered ${String(number)}.`);
  return { entry, number };
}

function sequenceCandidates(
  dir: string, path: string, faults: Refusal[], ignored: ReadonlySet<string>,
): Candidate[] {
  const candidates: Candidate[] = [];
  const numbers = new Map<number, string>();
  for (const entry of entries(dir)) {
    if (entry.isSymbolicLink() || ignored.has(entry.name)) continue;
    if (!sequenceEntry(entry)) {
      fault(faults, "entry-unknown", `${path}/${entry.name}`, "Remove the unrecognized sequence entry.");
      continue;
    }
    candidates.push(numberedCandidate(entry, path, numbers, faults));
  }
  return candidates;
}

function candidateOrder(a: Candidate, b: Candidate): number {
  const difference = (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER);
  return difference === 0 ? bytewise(a.entry.name, b.entry.name) : difference;
}

function sequenceNodes(
  candidates: Candidate[], dir: string, path: string, faults: Refusal[], inLoop: boolean,
): Node[] {
  const nodes: Node[] = [];
  for (const candidate of candidates.sort(candidateOrder)) {
    const entry = candidate.entry;
    const relative = `${path}/${entry.name}`;
    const node = entry.isDirectory()
      ? parseNodeDirectory(join(dir, entry.name), relative, nodeName(entry.name), faults, inLoop)
      : parseSingleStage(join(dir, entry.name), relative, nodeName(entry.name), faults);
    if (node !== undefined) nodes.push(node);
  }
  return nodes;
}

function validateTail(nodes: Node[], faults: Refusal[]): void {
  const tail = nodes[nodes.length - 1];
  if (tail?.kind !== undefined && tail.kind !== "STAGE") {
    fault(faults, "tail-container", tail.path, "End the sequence with a stage.");
  }
}

function parseSequence(
  dir: string,
  path: string,
  faults: Refusal[],
  ignored: ReadonlySet<string>,
  inLoop = false,
): Sequence {
  const candidates = sequenceCandidates(dir, path, faults, ignored);
  if (candidates.length === 0) fault(faults, "folder-empty", path, "Add a stage to the sequence.");
  const nodes = sequenceNodes(candidates, dir, path, faults, inLoop);
  validateTail(nodes, faults);
  return { path, nodes };
}

function parseLoop(
  dir: string,
  path: string,
  name: string,
  sentinel: string,
  faults: Refusal[],
  inLoop: boolean,
): Node {
  const document = readMarkdown(join(dir, sentinel), `${path}/${sentinel}`, faults);
  const options = document.sound ? validateData(document.data, `${path}/${sentinel}`, faults, ["repeat"], ["repeat"]) : {};
  if (inLoop) fault(faults, "loop-nested", path, "Move the inner loop into a subflow.");
  const ignored = validateContainerEntries(dir, path, sentinel, faults);
  const skills = skillsFolder(dir, path, faults, ignored);
  const repeat = typeof document.data["repeat"] === "number" ? document.data["repeat"] : 1;
  const question = document.body.trim();
  return {
    kind: "LOOP", name, path, options, skills, repeat,
    ...(question.length === 0 ? {} : { question: document.body }),
    sequence: parseSequence(dir, path, faults, ignored, true),
  };
}

function parseBranch(
  dir: string,
  path: string,
  entry: Entry,
  faults: Refusal[],
  inLoop: boolean,
): Branch {
  const branchPath = `${path}/${entry.name}`;
  const name = nodeName(entry.name);
  if (numberOf(entry.name) !== undefined) {
    fault(faults, "branch-numbered", branchPath, "Remove the branch's leading number.");
  }
  if (entry.isFile()) {
    return { name, path: branchPath, sequence: { path: branchPath, nodes: [parseSingleStage(join(dir, entry.name), branchPath, name, faults)] } };
  }
  const childDir = join(dir, entry.name);
  const hasSentinel = entries(childDir).some((child) => SENTINELS.has(child.name) || sentinelLike(child.name));
  if (!hasSentinel) {
    return { name, path: branchPath, sequence: parseSequence(childDir, branchPath, faults, new Set(["README.md"]), inLoop) };
  }
  const node = parseNodeDirectory(childDir, branchPath, name, faults, inLoop);
  if (node?.kind === "PARALLEL") {
    fault(faults, "tail-container", branchPath, "A branch cannot directly be a parallel container.");
  }
  return { name, path: branchPath, sequence: { path: branchPath, nodes: node === undefined ? [] : [node] } };
}

function ignoredBranch(entry: Entry, sentinel: string): boolean {
  return entry.isSymbolicLink() || entry.name === sentinel || entry.name === "README.md" || entry.name === "skills";
}

function validBranch(entry: Entry): boolean {
  if (entry.isDirectory()) return true;
  return entry.isFile() ? entry.name.endsWith(".md") : false;
}

function branchEntries(dir: string, sentinel: string, faults: Refusal[], path: string): Entry[] {
  const out: Entry[] = [];
  for (const entry of entries(dir)) {
    if (ignoredBranch(entry, sentinel) || containerArtifact(entry)) continue;
    if (entry.name.includes("\\") || nodeName(entry.name).length === 0) {
      fault(faults, "entry-unknown", `${path}/${entry.name}`, "Use a branch name without a backslash.");
      continue;
    }
    if (validBranch(entry)) out.push(entry);
    else fault(faults, "entry-unknown", `${path}/${entry.name}`, "Use a stage file or branch folder.");
  }
  return out;
}

function parseParallel(
  dir: string,
  path: string,
  name: string,
  sentinel: string,
  faults: Refusal[],
  inLoop: boolean,
): ParallelNode {
  const document = readMarkdown(join(dir, sentinel), `${path}/${sentinel}`, faults);
  const options = document.sound ? validateData(document.data, `${path}/${sentinel}`, faults, ["width"]) : {};
  if (document.sound && document.body.trim().length > 0) {
    fault(faults, "body-unexpected", `${path}/${sentinel}`, "Remove the parallel body.");
  }
  const skills = skillsFolder(dir, path, faults, validateContainerEntries(dir, path, sentinel, faults));
  const candidates = branchEntries(dir, sentinel, faults, path);
  if (candidates.length === 0) fault(faults, "folder-empty", path, "Add a parallel branch.");
  // The ceiling is on the number that reaches the pool, authored or defaulted:
  // 33 branches with no `width` key would otherwise start 33 at once.
  const width = typeof document.data["width"] === "number" ? document.data["width"] : candidates.length;
  if (width > FANOUT_MAX) fault(faults, "value-invalid", `${path}/${sentinel}`, `Give width a value of at most ${String(FANOUT_MAX)}.`);
  return { kind: "PARALLEL", name, path, options, skills, width, branches: candidates.map((entry) => parseBranch(dir, path, entry, faults, inLoop)) };
}

function validateChoiceCount(count: number, path: string, faults: Refusal[]): void {
  if (count === 0) fault(faults, "folder-empty", path, "Add alternatives to the choice.");
  else if (count === 1) fault(faults, "chooser-invalid", path, "Give the choice at least two alternatives.");
}

function validateAlternativeNames(
  body: string, candidates: Entry[], path: string, sentinel: string, faults: Refusal[],
): void {
  const listed = new Set(extractAlternatives(body));
  const actual = new Map(candidates.map((entry) => [nodeName(entry.name), entry.name]));
  for (const alternative of listed) {
    if (!actual.has(alternative)) fault(faults, "alternative-mismatch", `${path}/${sentinel}`, `Add the listed alternative ${alternative}.`);
  }
  for (const [alternative, filename] of actual) {
    if (!listed.has(alternative)) fault(faults, "alternative-mismatch", `${path}/${filename}`, `List the held alternative ${alternative}.`);
  }
}

function parseChoose(
  dir: string,
  path: string,
  name: string,
  sentinel: string,
  faults: Refusal[],
  inLoop: boolean,
): ChooseNode {
  const document = readMarkdown(join(dir, sentinel), `${path}/${sentinel}`, faults);
  const options = document.sound ? validateData(document.data, `${path}/${sentinel}`, faults) : {};
  const skills = skillsFolder(dir, path, faults, validateContainerEntries(dir, path, sentinel, faults));
  const candidates = branchEntries(dir, sentinel, faults, path);
  validateChoiceCount(candidates.length, path, faults);
  const hasBody = document.body.trim().length > 0;
  if (document.sound && !hasBody) fault(faults, "body-missing", `${path}/${sentinel}`, "Write the choice's instruction.");
  if (hasBody) validateAlternativeNames(document.body, candidates, path, sentinel, faults);
  return {
    kind: "CHOOSE", name, path, options, skills,
    ...(hasBody ? { question: document.body } : {}),
    alternatives: candidates.map((entry) => parseBranch(dir, path, entry, faults, inLoop)),
  };
}

function flowBody(sentinel: string, body: string): Pick<Flow, "body"> {
  if (sentinel !== "FLOW.md" || body.trim().length === 0) return {};
  return { body };
}

function parseFlow(dir: string, path: string, name: string, faults: Refusal[]): Flow | undefined {
  const sentinel = inspectSentinel(entries(dir), path, new Set(["FLOW.md", "DESCEND.md"]), faults);
  if (sentinel === undefined) return undefined;
  const document = readMarkdown(join(dir, sentinel), `${path}/${sentinel}`, faults);
  const descend = sentinel === "DESCEND.md";
  const extras = descend ? ["description", "tmp", "max-depth"] : ["description", "tmp"];
  const required = descend ? ["description", "max-depth"] : ["description"];
  const options: AuthoredOptions = document.sound ? validateData(document.data, `${path}/${sentinel}`, faults, extras, required) : {};
  const ignored = new Set([sentinel, "README.md"]);
  const skills = skillsFolder(dir, path, faults, ignored);
  let subflows = new Map<string, Flow>();
  if (entries(dir).some((entry) => entry.name === "subflows" && entry.isDirectory())) {
    subflows = parseFlowCollection(join(dir, "subflows"), `${path}/subflows`, faults);
    ignored.add("subflows");
  }
  const maxDepth = document.data["max-depth"];
  const sequence = parseSequence(dir, path, faults, ignored);
  validateFanoutPlacement(sequence, path, faults);
  return {
    name, path, options, sequence, skills, subflows,
    ...flowBody(sentinel, document.body),
    ...(descend && typeof maxDepth === "number" ? { maxDepth } : {}),
    ...(document.data["tmp"] === "flow" ? { tmp: "flow" as const } : {}),
  };
}

export function parseFlowCollection(dir: string, path: string, faults: Refusal[]): Map<string, Flow> {
  const flows = new Map<string, Flow>();
  const held = entries(dir);
  if (held.length === 0) fault(faults, "folder-empty", path, "Add a flow or remove the folder.");
  for (const entry of held) {
    const relative = `${path}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (!entry.isDirectory()) {
      fault(faults, "entry-unknown", relative, "Put each flow in its own folder.");
      continue;
    }
    const flow = parseFlow(join(dir, entry.name), relative, entry.name, faults);
    if (flow !== undefined) flows.set(entry.name, flow);
  }
  return flows;
}
