import { expect, test } from "vitest";
import { extractAlternatives, extractChecklist } from "../src/extract.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";

test("checklist extraction follows the line grammar and includes nested item text", () => {
  const body = [
    "# Task", "- outside", "## Checklist", "", "- First item", "  - nested detail",
    "2. Second item", "continued", "### Later", "- outside again",
  ].join("\n");
  expect(extractChecklist(body)).toEqual(["First item\n  - nested detail", "Second item\ncontinued"]);
  expect(extractChecklist("## checklist\n- wrong heading")).toEqual([]);
});

// Ruled by Ian, 2026-08-25: the heading is valid at any level when its text,
// whitespace-trimmed, is exactly the word `Checklist` — case-sensitive, no
// extra words, and no near-miss detection beyond that.
test("a checklist heading is recognized at any level, exactly the word Checklist", () => {
  for (const hashes of ["#", "##", "###", "####", "#####", "######"]) {
    expect(extractChecklist(`${hashes} Checklist\n- The item`)).toEqual(["The item"]);
  }
  expect(extractChecklist("##\tChecklist  \n- The item")).toEqual(["The item"]);
  expect(extractChecklist("## checklist\n- The item")).toEqual([]);
  expect(extractChecklist("## Checklist extra words\n- The item")).toEqual([]);
  expect(extractChecklist("####### Checklist\n- The item")).toEqual([]);
});

test("CHOOSE extraction accepts only code spans starting top-level list items", () => {
  expect(extractAlternatives([
    "- `patch` — fix it", "1. `revert` — undo it", "  - `nested`", "- prose with `later`",
  ].join("\n"))).toEqual(["patch", "revert"]);
});

test("fenced content is inert to checklist and CHOOSE extraction", () => {
  expect(extractChecklist([
    "## Checklist", "- First item", "```sh", "# anything", "- anything", "```", "- Second item",
  ].join("\n"))).toEqual(["First item", "Second item"]);
  expect(extractAlternatives([
    "- `patch` — fix it", "```", "- `phantom` — ignored", "```", "- `revert` — undo it",
  ].join("\n"))).toEqual(["patch", "revert"]);
});

// Ticket 0061 — runtime.md "Control tools": "Each tool's arguments are fixed,
// so two runtimes record the same decision the same way." Invariant 9 is what
// the fixed shape buys: "Edit its
// checklist. It marks items; it does not write them." The walk found that
// claim unwitnessed — a `text` parameter could be added to `mark`, and used to
// rewrite an item's wording, with the whole gate green — so the argument sets
// are pinned here rather than only their names.
test("each control tool's arguments are exactly the ones runtime.md fixes", () => {
  const shapes = createControlTools().map((tool) => {
    const schema = tool.parameters as { properties: Record<string, unknown>; required?: string[] };
    return [tool.name, Object.keys(schema.properties), schema.required ?? []];
  });
  expect(shapes.filter(([name]) => name !== "fault")).toEqual([
    // `mark` takes the item's number and state, then required evidence; a
    // skipped item also carries its reason. Nothing about the item's text.
    ["mark", ["item", "state", "evidence", "reason"], ["item", "state", "evidence"]],
    ["refuse", ["reason"], ["reason"]],
    ["continue", ["answer", "reason"], ["answer", "reason"]],
    ["select", ["name", "reason"], ["name", "reason"]],
    // A cleanup confirmation chooses no target: it can empty only the tmp
    // directory the runtime attached to this stage.
    ["clean-temp", [], []],
  ]);
  expect(shapes.filter(([name]) => name === "fault")).toEqual([["fault", ["reason"], ["reason"]]]);
});

test("ordinary control tool names are exhaustive and sequential, and invalid decisions reject without selecting", async () => {
  const controls = createControlContext(["one"], ["patch"]);
  const tools = createControlTools();
  expect(tools.map((tool) => [tool.name, tool.executionMode])).toEqual([
    ["mark", "sequential"], ["refuse", "sequential"], ["continue", "sequential"], ["select", "sequential"],
    ["clean-temp", "sequential"], ["fault", "sequential"],
  ]);
  const select = tools.find((tool) => tool.name === "select");
  if (select === undefined) throw new Error("select tool is missing");
  await expect(select.execute("one", { name: "bogus", reason: "guess" }, undefined, undefined, controls))
    .rejects.toThrow("Unknown alternative bogus. Choose one of: patch.");
  expect(controls.selection).toBeUndefined();
  const valid = await select.execute("two", { name: "patch", reason: "safe" }, undefined, undefined, controls);
  expect(valid.terminate).toBe(true);
  expect(controls.selection).toEqual({ name: "patch", reason: "safe" });
});

test("a subflow's own stages never see it in scope unless DESCEND below max-depth", async () => {
  const { scopedSubflows } = await import("../src/subflow-runtime.ts");
  const sequence = { path: "subflows/helper", nodes: [] };
  const plain = { name: "helper", path: "subflows/helper", options: {}, sequence, skills: [], subflows: new Map() };
  const descend = { ...plain, maxDepth: 2 };
  const assemblyScope = (flow: typeof plain) => new Map([["helper", flow]]);
  expect(scopedSubflows(assemblyScope(plain), plain, undefined, 1).has("helper")).toBe(false);
  expect(scopedSubflows(assemblyScope(descend), descend, undefined, 1).has("helper")).toBe(true);
  expect(scopedSubflows(assemblyScope(descend), descend, undefined, 2).has("helper")).toBe(false);
});
