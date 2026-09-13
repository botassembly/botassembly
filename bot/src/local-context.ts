// What `$PWD` carries, and what a run admits of it (invocation.md). The
// workspace is the tree being worked ON: nothing here is trusted, nothing here
// can refuse a run, and absence is silence.
import { join } from "node:path";
import { entries, lstatExists, readMarkdown } from "./documents.ts";
import type { OptionValue } from "./model.ts";

/** AGENTS.md, falling back to CLAUDE.md only when AGENTS.md is absent. */
export function localDocument(workdir: string): string | undefined {
  return ["AGENTS.md", "CLAUDE.md"].find((name) => lstatExists(join(workdir, name)));
}

// `$PWD/skills/` then `$PWD/.claude/skills/`, first name wins. A folder without
// a described SKILL.md is not a skill, and saying so is not this runtime's
// business: the workspace is read, never validated.
export function localSkills(workdir: string): Map<string, { path: string; description: string }> {
  const found = new Map<string, { path: string; description: string }>();
  for (const parent of ["skills", ".claude/skills"]) {
    for (const entry of entries(join(workdir, ...parent.split("/")))) {
      const path = `${parent}/${entry.name}`;
      const held = readMarkdown(join(workdir, ...path.split("/"), "SKILL.md"), path, [], true).data["description"];
      if (!found.has(entry.name) && typeof held === "string" && held.length > 0) found.set(entry.name, { path, description: held });
    }
  }
  return found;
}

/** The skills `$PWD` lends this stage — none unless the run resolved `use`. */
export function admittedSkills(admits: OptionValue | undefined, workdir: string): Map<string, string> {
  if (admits !== "use") return new Map();
  return new Map([...localSkills(workdir)].map(([name, held]) => [name, join(workdir, ...held.path.split("/"))]));
}
