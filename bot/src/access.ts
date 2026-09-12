import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mapping } from "./model.ts";
import type { AccessOperation, StageAccess } from "./model.ts";
import type { HarnessTool } from "./harness.ts";
import { createFileTools, type FileToolContext, type SlotExecutionEnv } from "./tools.ts";

export interface AccessDenial {
  tool: AccessOperation;
  boundary: string;
}

function contained(root: string, target: string): boolean {
  const held = relative(root, target);
  return held === "" || (!held.startsWith("..") && !isAbsolute(held));
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

const rejection = (error: unknown): Error => error instanceof Error ? error : new Error("Canonical path resolution failed.");

function canonicalFrom(path: string, suffix: string[]): Promise<string> {
  return realpath(path).then(
    (canonical) => resolve(canonical, ...suffix),
    (error: unknown) => {
      if (!new Set(["ENOENT", "ENOTDIR"]).has(errorCode(error))) return Promise.reject(rejection(error));
      const parent = dirname(path);
      if (parent === path) return Promise.reject(rejection(error));
      return canonicalFrom(parent, [path.slice(parent.length + (parent.endsWith("/") ? 0 : 1)), ...suffix]);
    },
  );
}

const projectedCanonical = (path: string): Promise<string> => canonicalFrom(resolve(path), []);

type Quote = "plain" | "single" | "double";
interface ShellScan { quote: Quote; escaped: boolean; word: string; executable?: string; valid: boolean }

function scanQuoted(state: ShellScan, character: string): boolean {
  if (state.quote === "single") {
    if (character === "'") state.quote = "plain";
    else if (state.executable === undefined) state.word += character;
    return true;
  }
  return false;
}

function quoteTransition(state: ShellScan, character: string): boolean {
  if (character === "\\") state.escaped = true;
  else if (character === state.quote) state.quote = "plain";
  else if (state.quote === "plain" && character === "'") state.quote = "single";
  else if (state.quote === "plain" && character === '"') state.quote = "double";
  else return false;
  return true;
}

function unsafeSyntax(state: ShellScan, character: string, next: string | undefined): boolean {
  const substitution = character === "`" || (character === "$" && next === "(");
  return (state.quote !== "single" && substitution) || (state.quote === "plain" && ";&|<>()%".includes(character));
}

function scanPlain(state: ShellScan, character: string, next: string | undefined): void {
  if (quoteTransition(state, character)) return;
  if (unsafeSyntax(state, character, next)) state.valid = false;
  else if (state.quote === "plain" && /\s/u.test(character) && state.executable === undefined && state.word.length > 0) state.executable = state.word;
  else if (state.executable === undefined) state.word += character;
}

function scanCharacter(state: ShellScan, character: string, next: string | undefined): void {
  if (state.escaped) {
    if (state.executable === undefined) state.word += character;
    state.escaped = false;
  } else if (!scanQuoted(state, character)) scanPlain(state, character, next);
}

function finishedExecutable(state: ShellScan): string | undefined {
  if (!state.valid || state.quote !== "plain" || state.escaped) return undefined;
  return state.executable ?? (state.word.length > 0 ? state.word : undefined);
}

function simpleExecutable(command: string): string | undefined {
  if (command.length === 0 || /[\r\n]/u.test(command)) return undefined;
  const state: ShellScan = { quote: "plain", escaped: false, word: "", valid: true };
  for (let at = 0; at < command.length; at += 1) scanCharacter(state, command[at] ?? "", command[at + 1]);
  return finishedExecutable(state);
}

function operation(name: string): AccessOperation | undefined {
  return name === "read" || name === "write" || name === "edit" || name === "bash" ? name : undefined;
}

function denialResult(tool: AccessOperation, boundary: string) {
  return {
    content: [{ type: "text" as const, text: `The declared boundary denied this ${tool} call.` }],
    details: { type: "access-denied", tool, boundary },
  };
}

interface Root { name: string; path: string }

async function admittedFile(
  operationName: Exclude<AccessOperation, "bash">, params: unknown, access: StageAccess,
  execution: SlotExecutionEnv, roots: Root[], boundary: { name: string },
): Promise<boolean> {
  if (!mapping(params) || typeof params["path"] !== "string") return false;
  const absolute = await execution.absolutePath(params["path"]);
  if (!absolute.ok) return false;
  const normalized = resolve(absolute.value);
  const slot = roots.find((root) => contained(root.path, normalized));
  if (slot === undefined) return false;
  boundary.name = slot.name;
  if (!(access[operationName] ?? []).includes(slot.name)) return false;
  return Promise.all([projectedCanonical(normalized), projectedCanonical(slot.path)]).then(([canonical, canonicalRoot]) => contained(canonicalRoot, canonical), () => false);
}

function admittedBash(params: unknown, access: StageAccess): boolean {
  if (!mapping(params) || typeof params["command"] !== "string") return false;
  const executable = simpleExecutable(params["command"]);
  return executable !== undefined && (access.bash ?? []).includes(executable);
}

export function createBoundedFileTools(
  shellEnv: NodeJS.ProcessEnv, access: StageAccess, execution: SlotExecutionEnv,
  slots: Readonly<Record<string, string>>, onDenied: (denial: AccessDenial) => Promise<void>,
): HarnessTool<FileToolContext>[] {
  const roots = Object.entries(slots).filter(([name]) => name !== "TMPDIR")
    .map(([name, path]) => ({ name, path: resolve(path) })).sort((left, right) => right.path.length - left.path.length);
  return createFileTools(shellEnv).map((tool) => ({
    ...tool,
    async execute(id, params, signal, update, context) {
      const toolOperation = operation(tool.name);
      if (toolOperation === undefined) return tool.execute(id, params, signal, update, context);
      const boundary = { name: toolOperation === "bash" ? "command" : "PWD" };
      const admitted = toolOperation === "bash"
        ? admittedBash(params, access)
        : await admittedFile(toolOperation, params, access, execution, roots, boundary);
      if (admitted) return tool.execute(id, params, signal, update, context);
      await onDenied({ tool: toolOperation, boundary: boundary.name });
      return denialResult(toolOperation, boundary.name);
    },
  }));
}
