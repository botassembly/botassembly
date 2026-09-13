import { join } from "node:path";
import type { Assembly, ChooseNode, ContainerNode, Flow, StageNode } from "./model.ts";
import type { SkillSource } from "./record-events.ts";

export interface ResolvedSkill {
  directory: string;
  source: SkillSource;
}

// Skill name → its winning declaration. `$PWD`'s own skills when the run admits
// them, then assembly, flow, the containers the stage sits inside outermost
// first, then the stage — later set wins, so a colliding name holds the
// narrowest scope's skill and the workspace sits BELOW the assembly: the axis is
// trust, not proximity (skills.md). A container's skills belong to the stages
// BENEATH it, so a chooser reads its own scope, never its own container folder.
export function visibleSkills(
  assembly: Assembly, flow: Flow, containers: readonly ContainerNode[], node: StageNode | ChooseNode,
  local: ReadonlyMap<string, string>,
): Map<string, ResolvedSkill> {
  const skills = new Map<string, ResolvedSkill>();
  for (const [name, directory] of local) skills.set(name, { directory, source: "workspace" });
  for (const name of assembly.skills) skills.set(name, { directory: join(assembly.root, "skills", name), source: "assembly-root" });
  for (const name of flow.skills) skills.set(name, { directory: join(assembly.root, flow.path, "skills", name), source: "flow-local" });
  for (const container of [...containers].reverse()) {
    for (const name of container.skills) skills.set(name, { directory: join(assembly.root, container.path, "skills", name), source: "container-local" });
  }
  if (node.kind === "STAGE") for (const name of node.skills) skills.set(name, { directory: join(assembly.root, node.path, "skills", name), source: "stage-local" });
  return skills;
}
