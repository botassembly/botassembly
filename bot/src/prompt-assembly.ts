// Where the prompt's parts are gathered (prompt.md): what the stage is, what it
// may call, and what it must produce. prompt.ts writes the setup; this file
// finds what goes in it. The edge runs one way — assembly imports the writer.
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { readMarkdown } from "./documents.ts";
import type { StageRuntimeContext } from "./execution.ts";
import { localDocument, localSkills } from "./local-context.ts";
import { buildSystemPrompt, workspaceAnnouncement, type PromptSystem } from "./prompt.ts";
import { bytewise, procedurePosition } from "./model.ts";
import type { PromptSource } from "./record-events.ts";

export function stageFile(context: StageRuntimeContext, name: string): string {
  return context.node.path.endsWith(".md") ? context.node.path : `${context.node.path}/${name}`;
}

function description(file: string): string {
  const held = readMarkdown(file, file, []).data["description"];
  if (typeof held !== "string") throw new TypeError(`Validated description is missing: ${file}`);
  return held;
}

function promptSkills(context: StageRuntimeContext): { name: string; description: string }[] {
  return [...context.skills]
    .map(([name, skill]) => ({ name, description: description(join(skill.directory, "SKILL.md")) }));
}

interface PromptWorkspace { text?: string; sources: PromptSource[] }

function usedWorkspace(document: string | undefined, body: string): PromptWorkspace {
  if (document === undefined || body === "") return { sources: [] };
  return { text: body, sources: [{ source: "workspace", mode: "use", path: `$PWD/${document}` }] };
}

function announcedWorkspace(
  document: string | undefined, skills: { name: string; path: string; description: string }[],
): PromptWorkspace {
  const sources: PromptSource[] = [
    ...(document === undefined ? [] : [{ source: "workspace" as const, mode: "announce" as const, path: `$PWD/${document}` }]),
    ...skills.sort((left, right) => bytewise(left.name, right.name)).map(({ name, path }) => ({
      source: "workspace" as const, mode: "announce" as const, name, path: `$PWD/${path}/SKILL.md`,
    })),
  ];
  return document === undefined && skills.length === 0
    ? { sources }
    : { text: workspaceAnnouncement(document, skills), sources };
}

// announce names the workspace; use injects its document's body; absence is silence.
function promptWorkspace(context: StageRuntimeContext): PromptWorkspace {
  const mode = context.options["local-context"]?.value;
  if (mode !== "announce" && mode !== "use") return { sources: [] };
  const workdir = context.slots["PWD"] ?? "";
  const document = localDocument(workdir);
  const body = document === undefined ? "" : readMarkdown(join(workdir, document), document, [], true).body.trim();
  if (mode === "use") return usedWorkspace(document, body);
  return announcedWorkspace(document, [...localSkills(workdir)].map(([name, held]) => ({ name, ...held })));
}

function promptHelpers(context: StageRuntimeContext): { name: string; description: string }[] {
  return context.helpers.map((flow) => {
    const sentinel = flow.maxDepth === undefined ? "FLOW.md" : "DESCEND.md";
    return { name: flow.name, description: description(join(context.assembly.root, flow.path, sentinel)) };
  });
}

async function promptOutput(context: StageRuntimeContext): Promise<PromptSystem["output"]> {
  if (context.node.kind !== "STAGE") return undefined;
  if (context.node.extension === "txt") return { format: "text" };
  const name = context.node.extension === "json" ? "schema.json" : "schema.md";
  const schema = await readFile(join(context.assembly.root, ...stageFile(context, name).split("/")), "utf8");
  return context.node.extension === "json" ? { format: "json", schema } : { format: "markdown", schema };
}

function promptProcedure(context: StageRuntimeContext): PromptSystem["procedure"] | undefined {
  if (context.node.kind !== "STAGE" || context.flow.body === undefined) return undefined;
  const position = procedurePosition(context.flow, context.node, context.containers);
  return position === undefined ? undefined : { body: context.flow.body, ...position };
}

function assemblyPath(context: StageRuntimeContext, path: string): string {
  return `assembly/${relative(context.assembly.root, path)}`;
}

function promptSources(
  context: StageRuntimeContext, workspace: PromptSource[],
): PromptSource[] {
  const procedure = promptProcedure(context);
  const schema = context.node.kind === "STAGE" && context.node.extension !== "txt"
    ? context.node.extension === "json" ? "schema.json" : "schema.md"
    : undefined;
  const skills = [...context.skills].sort(([left], [right]) => bytewise(left, right));
  const helpers = [...context.helpers].sort((left, right) => bytewise(left.name, right.name));
  return [
    { source: "assembly", path: "assembly/ASSEMBLY.md" },
    ...workspace,
    ...(procedure === undefined ? [] : [{ source: "flow" as const, path: `assembly/${context.flow.path}/FLOW.md` }]),
    { source: "stage", path: `assembly/${stageFile(context, context.node.kind === "STAGE" ? "STAGE.md" : "CHOOSE.md")}` },
    ...(schema === undefined ? [] : [{ source: "schema" as const, path: `assembly/${stageFile(context, schema)}` }]),
    ...skills.map(([name, skill]) => ({
      source: "skill" as const, name,
      path: skill.source === "workspace"
        ? `$PWD/${relative(context.slots["PWD"] ?? "", skill.directory)}/SKILL.md`
        : `${assemblyPath(context, skill.directory)}/SKILL.md`,
    })),
    ...helpers.map((helper) => ({
      source: "helper" as const, name: helper.name,
      path: `assembly/${helper.path}/${helper.maxDepth === undefined ? "FLOW.md" : "DESCEND.md"}`,
    })),
  ];
}

export async function promptConstruction(
  context: StageRuntimeContext,
): Promise<{ system: string; sources: PromptSource[] }> {
  const output = await promptOutput(context);
  const workspace = promptWorkspace(context);
  const instruction = context.node.kind === "STAGE"
    ? context.node.body ?? ""
    : context.mode.kind === "choose" ? context.mode.question ?? "Select an alternative." : "";
  const procedure = promptProcedure(context);
  const system = buildSystemPrompt({
    purpose: context.assembly.body ?? "", instruction,
    ...(output === undefined ? {} : { output }),
    ...(workspace.text === undefined ? {} : { workspace: workspace.text }),
    ...(procedure === undefined ? {} : { procedure }),
    slots: Object.entries(context.assembly.slots).map(([name, held]) => ({ name, description: held })),
    skills: promptSkills(context), helpers: promptHelpers(context),
  });
  return { system, sources: promptSources(context, workspace.sources) };
}
