import { join } from "node:path";

export function expandSlotPath(path: string, slots: Readonly<Record<string, string>>): string {
  for (const [name, value] of Object.entries(slots)) {
    const variable = `$${name}`;
    if (path === variable) return value;
    if (path.startsWith(`${variable}/`)) return join(value, path.slice(variable.length + 1));
  }
  return path;
}
