import type { Dirent } from "node:fs";

const GRAMMAR_ROOTS = new Set(["ASSEMBLY.md", "flows", "skills", "subflows", "README.md", "LICENSE"]);
const RESERVED_FOLDERS = new Set([...GRAMMAR_ROOTS, "gate"]);

export interface AssemblyTraversalPolicy {
  strict: boolean;
  folders: ReadonlySet<string>;
}

export interface ParsedAssemblyTraversalPolicy {
  policy: AssemblyTraversalPolicy;
  invalid: readonly ("strict" | "folders")[];
}

export const DEFAULT_ASSEMBLY_TRAVERSAL_POLICY: AssemblyTraversalPolicy = {
  strict: true,
  folders: new Set(),
};

function validFolderName(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value !== "."
    && value !== ".."
    && !value.startsWith("/")
    && !value.includes("/")
    && !value.includes("\0")
    && !RESERVED_FOLDERS.has(value);
}

export function parseAssemblyTraversalPolicy(data: Record<string, unknown>): ParsedAssemblyTraversalPolicy {
  const invalid: ("strict" | "folders")[] = [];
  const strict = data["strict"] === undefined ? true : data["strict"];
  const declared = data["folders"] === undefined ? [] : data["folders"];
  const strictValid = typeof strict === "boolean";
  const foldersValid = Array.isArray(declared) && declared.every(validFolderName);
  if (!strictValid) invalid.push("strict");
  if (!foldersValid) invalid.push("folders");
  if (!strictValid || !foldersValid) return { policy: DEFAULT_ASSEMBLY_TRAVERSAL_POLICY, invalid };
  return {
    policy: {
      strict,
      folders: new Set(Array.isArray(declared) ? declared.filter(validFolderName) : []),
    },
    invalid,
  };
}

/** A declared root must be established as a real directory before it can be opaque. */
export function policyForRootEntries(
  parsed: ParsedAssemblyTraversalPolicy,
  entries: readonly Dirent[],
): { policy: AssemblyTraversalPolicy; foldersHaveWrongKind: boolean } {
  if (parsed.invalid.length > 0) return { policy: DEFAULT_ASSEMBLY_TRAVERSAL_POLICY, foldersHaveWrongKind: false };
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const foldersHaveWrongKind = [...parsed.policy.folders].some((name) => {
    const entry = byName.get(name);
    return entry !== undefined && !entry.isDirectory();
  });
  return {
    policy: foldersHaveWrongKind ? DEFAULT_ASSEMBLY_TRAVERSAL_POLICY : parsed.policy,
    foldersHaveWrongKind,
  };
}

export function includeAssemblyRoot(policy: AssemblyTraversalPolicy, entry: Dirent): boolean {
  if (GRAMMAR_ROOTS.has(entry.name)) return true;
  if (policy.folders.has(entry.name) && entry.isDirectory()) return false;
  return policy.strict;
}

export function grammarAssemblyRoot(name: string): boolean {
  return GRAMMAR_ROOTS.has(name);
}
