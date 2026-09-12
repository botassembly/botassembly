// The home's `config.yaml`, read whole (home.md): the defaults every assembly
// inherits, and the named model choices. It is configuration rather than
// authored content — no fence, no prose body — so the whole file is judged
// strictly, through documents.ts's one YAML seam.
import { readBytes, validOption, validateData, yamlMapping } from "./documents.ts";
import { OPTION_NAMES, REASONING_LEVELS, fault, mapping, type HomeConfig, type IntelligenceTable } from "./model.ts";
import type { Refusal } from "./spine.ts";

const BUNDLE_KEYS = ["provider", "model", "reasoning"] as const;

type ReadBundle = { provider?: string; model?: string; reasoning?: string };

function readBundle(value: unknown, cell: string, path: string, faults: Refusal[]): ReadBundle {
  const bundle: ReadBundle = {};
  if (!mapping(value)) {
    fault(faults, "value-invalid", path, `Give ${cell} a valid value.`);
    return bundle;
  }
  const allowed = new Set<string>(BUNDLE_KEYS);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fault(faults, "key-unknown", path, `Remove the unknown key ${key} from ${cell}.`);
  }
  for (const name of BUNDLE_KEYS) {
    const held = value[name];
    if (held === undefined) continue;
    if (validOption(name, held)) bundle[name] = String(held);
    else fault(faults, "value-invalid", path, `Give ${name} a valid value in ${cell}.`);
  }
  if (!("model" in value)) fault(faults, "key-missing", path, `Add the required key model to ${cell}.`);
  if (!("reasoning" in value)) fault(faults, "key-missing", path, `Add the required key reasoning to ${cell}.`);
  return bundle;
}

function readIntelligences(value: unknown, path: string, faults: Refusal[]): IntelligenceTable {
  const table: IntelligenceTable = {};
  if (value === undefined) return table;
  if (!mapping(value)) {
    fault(faults, "value-invalid", path, "Give intelligences a valid value.");
    return table;
  }
  for (const [name, bundle] of Object.entries(value)) {
    const read = readBundle(bundle, `intelligence ${name}`, path, faults);
    const reasoning = REASONING_LEVELS.find((level) => level === read.reasoning);
    if (read.model !== undefined && reasoning !== undefined) {
      table[name] = {
        ...(read.provider === undefined ? {} : { provider: read.provider }),
        model: read.model,
        reasoning,
      };
    }
  }
  return table;
}

export function readYamlOptions(
  filename: string,
  path: string,
  faults: Refusal[],
): HomeConfig {
  const source = readBytes(filename);
  // Strict config, all of it: this file has no fence and no prose body to spare,
  // so the round trip covers every byte rather than a region (Ian, 2026-08-05).
  // One code, two sentences — a bad byte and broken YAML need different repairs,
  // and the sentence is what carries a cause the code cannot (invariant 39).
  if (source !== undefined && Buffer.compare(Buffer.from(source.toString("utf8"), "utf8"), source) !== 0) {
    fault(faults, "frontmatter-invalid", path, "Make the home YAML valid UTF-8.");
    return { options: {}, intelligences: {} };
  }
  const yaml = source === undefined ? { where: "" } : yamlMapping(source.toString("utf8"), 0);
  if (yaml.data === undefined) {
    fault(faults, "frontmatter-invalid", path, `Fix the home YAML${yaml.where}.`);
    return { options: {}, intelligences: {} };
  }
  return {
    options: validateData(yaml.data, path, faults, ["intelligences"], [], OPTION_NAMES.filter((name) => name !== "intelligence")),
    intelligences: readIntelligences(yaml.data["intelligences"], path, faults),
  };
}
