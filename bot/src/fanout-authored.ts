import { join } from "node:path";
import { entries, readMarkdown, validateData } from "./documents.ts";
import { FANOUT_MAX, fault, type FanoutNode, type Sequence } from "./model.ts";
import type { Refusal } from "./spine.ts";

function bound(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= FANOUT_MAX;
}

function fields(data: Record<string, unknown>, path: string, faults: Refusal[]): void {
  const items = data["items"], subflow = data["subflow"], width = data["width"], maximum = data["max-items"];
  if (typeof items !== "string" || items.length === 0) fault(faults, "value-invalid", path, "Give items a nonempty member name.");
  if (typeof subflow !== "string" || subflow.length === 0) fault(faults, "value-invalid", path, "Give subflow a nonempty flow name.");
  if (!bound(width)) fault(faults, "value-invalid", path, `Give width an integer from 1 through ${String(FANOUT_MAX)}.`);
  if (!bound(maximum)) fault(faults, "value-invalid", path, `Give max-items an integer from 1 through ${String(FANOUT_MAX)}.`);
  if (bound(width) && bound(maximum) && width > maximum) fault(faults, "value-invalid", path, "Give width a value no greater than max-items.");
}

export function parseFanout(
  dir: string, path: string, name: string, sentinel: string, ignored: ReadonlySet<string>, faults: Refusal[],
): FanoutNode {
  const file = `${path}/${sentinel}`, document = readMarkdown(join(dir, sentinel), file, faults);
  const keys = ["items", "subflow", "width", "max-items"];
  if (document.sound) validateData(document.data, file, faults, keys, keys);
  if (document.sound && document.body.trim().length > 0) fault(faults, "body-unexpected", file, "Remove the fan-out body.");
  for (const entry of entries(dir)) if (!ignored.has(entry.name)) {
    fault(faults, "entry-unknown", `${path}/${entry.name}`, "Keep only FANOUT.md and README.md here.");
  }
  fields(document.data, file, faults);
  const items = document.data["items"], subflow = document.data["subflow"];
  const width = document.data["width"], maximum = document.data["max-items"];
  return { kind: "FANOUT", name, path, options: {}, skills: [],
    items: typeof items === "string" ? items : "", subflow: typeof subflow === "string" ? subflow : "",
    width: typeof width === "number" ? width : 1, maxItems: typeof maximum === "number" ? maximum : 1 };
}

function placement(sequence: Sequence, index: number, node: FanoutNode, flowPath: string, faults: Refusal[], root: boolean): void {
  if (!root || !flowPath.startsWith("flows/") || flowPath.split("/").length !== 2) {
    fault(faults, "sentinel-unknown", node.path, "Move FANOUT to the root sequence of a named entry flow.");
    return;
  }
  const before = sequence.nodes[index - 1], after = sequence.nodes[index + 1];
  if (before?.kind !== "STAGE" || before.extension !== "json") fault(faults, "value-invalid", node.path, "Put one JSON stage immediately before FANOUT.");
  if (after?.kind !== "STAGE") fault(faults, "value-invalid", node.path, "Put one ordinary stage immediately after FANOUT.");
}

export function validateFanoutPlacement(sequence: Sequence, flowPath: string, faults: Refusal[], root = true): void {
  for (const [index, node] of sequence.nodes.entries()) {
    if (node.kind === "FANOUT") placement(sequence, index, node, flowPath, faults, root);
    else if (node.kind === "LOOP") validateFanoutPlacement(node.sequence, flowPath, faults, false);
    else if (node.kind === "PARALLEL" || node.kind === "CHOOSE") for (const branch of node.kind === "PARALLEL" ? node.branches : node.alternatives) {
      validateFanoutPlacement(branch.sequence, flowPath, faults, false);
    }
  }
}
