import { resolve } from "node:path";
import type { ChooseNode, StageNode } from "./model.ts";

export function stageWorkdir(inherited: string, root: string, node: StageNode | ChooseNode): string {
  return node.kind === "STAGE" && node.workdir !== undefined ? resolve(root, node.workdir) : inherited;
}
