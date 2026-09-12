import { parseDocument } from "yaml";
import { refusalLines } from "../src/check.ts";
import type { CliBoundary } from "../src/cli.ts";
import { withoutFlag } from "../src/flags.ts";
import { mapping } from "../src/model.ts";
import { readInvocationTokens } from "../src/reader.ts";

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "-";
}

function humanLine(line: string): string {
  const document = parseDocument(line), held: unknown = document.toJS();
  if (document.errors.length > 0 || !mapping(held)) return line;
  const options = mapping(held["options"])
    ? Object.entries(held["options"]).flatMap(([name, value]) => mapping(value) ? [`${name}=${String(value["value"])}@${String(value["from"])}`] : [])
    : [];
  const input = Array.isArray(held["input"]) ? held["input"].map(String).join(",") : "-";
  return `${scalar(held["stage"])}  ${scalar(held["type"])}  input=${input}  output=${scalar(held["output"])}  options=${options.join(",")}`;
}

/** Exercise assembly resolution directly after the retired CLI bridge is gone. */
export function semanticCheck(args: string[], boundary: CliBoundary | undefined): Promise<number> {
  if (boundary === undefined) throw new Error("The semantic check requires a boundary.");
  const json = withoutFlag(args, "--json");
  const result = readInvocationTokens(json.args, boundary.cwd, boundary.env).result;
  if (result.exitCode === 2 && result.faults !== undefined) {
    const text = json.found ? refusalLines([...result.faults]) : result.faults.flatMap((fault) => [`${fault.code}  ${fault.path}`, `  ${fault.sentence}`]);
    boundary.stderr(`${text.join("\n")}\n`);
  } else {
    const held = json.found ? result.lines : result.lines.map(humanLine);
    if (held.length > 0) boundary.stdout(`${held.join("\n")}\n`);
  }
  return Promise.resolve(result.exitCode);
}
