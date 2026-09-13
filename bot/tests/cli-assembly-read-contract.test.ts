import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapping } from "../src/model.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function homeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-assembly-read-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  await mkdir(join(home, "assemblies", "review", "flows", "main"), { recursive: true });
  await writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n");
  await writeFile(join(home, "assemblies", "review", "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n");
  await writeFile(join(home, "assemblies", "review", "flows", "main", "01-work.md"), "---\n---\nWork.\n");
  await mkdir(join(home, "assemblies", "team"), { recursive: true });
  await symlink(join(home, "assemblies", "review"), join(home, "assemblies", "team", "linked"));
  return home;
}

function document(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected a JSON object.");
  return value;
}

function commands(text: string): Array<Record<string, unknown>> {
  const data = document(text)["data"];
  if (!mapping(data) || !Array.isArray(data["commands"])) throw new Error("Expected capability commands.");
  return data["commands"].filter(mapping);
}

test("assembly check uses the current dispatcher and bounded versioned result", async () => {
  const home = await homeFixture();
  const human = await invokeCli(["assembly", "check", "review/main"], { home });
  expect(human.code, human.err).toBe(0);
  expect(human.out).toContain("01-work");
  const json = await invokeCli(["assembly", "check", "review/main", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  const checkDocument = document(json.out);
  expect(checkDocument).toMatchObject({
    schemaVersion: 1,
    kind: "bot.assembly.check",
    page: { limit: 20, next: null, through: null, complete: true },
    summary: { returned: 1, matched: 1, warningCount: 0, warningsOmitted: 0 },
    warnings: [],
  });
  const checkData = checkDocument["data"];
  if (!mapping(checkData) || !Array.isArray(checkData["stages"]) || !mapping(checkData["stages"][0])) throw new Error("Expected check stages.");
  expect(checkData["target"]).toBe("review/main");
  expect(checkData["stages"][0]).toMatchObject({ stage: "01-work", type: "STAGE", input: ["request.txt"], output: "work.txt", files: ["01-work.md"] });
});

test("assembly check passes a declared dynamic slot to the existing reader", async () => {
  const home = await homeFixture();
  const root = join(home, "assemblies", "slotted");
  await mkdir(join(root, "flows", "main"), { recursive: true });
  await writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\nslots:\n  doc: The document to work from.\n---\nSlotted.\n");
  await writeFile(join(root, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n");
  await writeFile(join(root, "flows", "main", "01-work.md"), "---\n---\nWork.\n");
  const doc = join(home, "document.txt");
  await writeFile(doc, "Document.");
  const held = await invokeCli(["assembly", "check", "slotted/main", "--doc", doc, "--json"], { home });
  expect(held.code, held.err).toBe(0);
  expect(document(held.out)).toMatchObject({ kind: "bot.assembly.check", summary: { returned: 1, matched: 1 } });
});

test("assembly check uses its explicit home instead of the ambient home", async () => {
  const home = await homeFixture();
  const ambient = await mkdtemp(join(tmpdir(), "bot-assembly-read-empty-"));
  roots.push(ambient);
  const target = join(home, "assemblies", "review", "main");
  const result = await invokeCli(["assembly", "check", target, "--home", home], { home: ambient });
  expect(result.code, result.err).toBe(0);
  expect(result.out).toContain("01-work");
});

test("assembly check does not reserve bot_home from its synthetic selected-home environment", async () => {
  const home = await homeFixture();
  const root = join(home, "assemblies", "home-slot");
  await mkdir(join(root, "flows", "main"), { recursive: true });
  await writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\nslots:\n  bot_home: The caller's home.\n---\nHome slot.\n");
  await writeFile(join(root, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n");
  await writeFile(join(root, "flows", "main", "01-work.md"), "---\n---\nWork.\n");
  const ambient = await mkdtemp(join(tmpdir(), "bot-assembly-read-empty-"));
  roots.push(ambient);
  const target = join(root, "main");
  const result = await invokeCli(["assembly", "check", target, "--home", home, "--bot_home", home, "--json"], { home: ambient, env: { BOT_HOME: undefined } });
  expect(result.code, result.err).toBe(0);
  expect(result.out).toContain("01-work");
});

test("explicit assembly list preserves useful rows and returns a bounded JSON page", async () => {
  const home = await homeFixture();
  const human = await invokeCli(["assembly", "list"], { home });
  expect(human.code, human.err).toBe(0);
  expect(human.out).toContain("review  installed  local copy");
  expect(human.out).toContain("team/linked  linked");
  const json = await invokeCli(["assembly", "list", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  expect(document(json.out)).toMatchObject({
    schemaVersion: 1,
    kind: "bot.assembly.list",
    data: [
      { name: "review", kind: "installed", source: null, updated: null, target: null, broken: false },
      { name: "team/linked", kind: "linked", target: home + "/assemblies/review", broken: false },
    ],
    page: { limit: 20, next: null, complete: true },
    summary: { returned: 2, matched: 2, warningCount: 0, warningsOmitted: 0 },
    warnings: [],
  });
});

test("assembly read contracts publish descriptors, help, and structured errors", async () => {
  const home = await homeFixture();
  const descriptors = commands((await invokeCli(["capabilities", "--json"], { home })).out);
  expect(descriptors.find((row) => row["operation"] === "assembly.check")).toMatchObject({
    command: ["assembly", "check"], output: { kind: "bot.assembly.check", schemaVersion: 1 }, modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  });
  expect(descriptors.find((row) => row["operation"] === "assembly.list")).toMatchObject({
    command: ["assembly", "list"], output: { kind: "bot.assembly.list", schemaVersion: 1 }, modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  });
  expect((await invokeCli(["assembly", "check", "--help"], { home })).out).toContain("usage: bot assembly check");
  expect((await invokeCli(["assembly", "list", "--help"], { home })).out).toContain("usage: bot assembly list");
  const failed = await invokeCli(["assembly", "check", "missing", "--json"], { home });
  expect(failed.code).toBe(2);
  expect(document(failed.err)).toMatchObject({ error: { operation: "assembly.check", code: "request-invalid" } });
});

test("assembly list bounds pages, keeps cursor state opaque, and supports exact count", async () => {
  const home = await homeFixture();
  await Promise.all(Array.from({ length: 21 }, async (_unused, index) => {
    const name = `extra-${String(index).padStart(2, "0")}`;
    await mkdir(join(home, "assemblies", name));
    await writeFile(join(home, "assemblies", name, "ASSEMBLY.md"), "---\n---\nExtra.\n");
  }));
  const first = await invokeCli(["assembly", "list", "--limit", "20", "--json"], { home });
  expect(first.code, first.err).toBe(0);
  const firstDocument = document(first.out);
  const data = firstDocument["data"], page = firstDocument["page"], summary = firstDocument["summary"];
  if (!Array.isArray(data) || !mapping(page) || !mapping(summary)) throw new Error("Expected a list page.");
  expect(data).toHaveLength(20);
  expect(page["complete"]).toBe(false);
  expect(page["next"]).toEqual(expect.any(String));
  expect(summary["matched"]).toBe(23);
  const second = await invokeCli(["assembly", "list", "--limit", "20", "--after", typeof page["next"] === "string" ? page["next"] : "", "--json"], { home });
  const secondData = document(second.out)["data"];
  expect(Array.isArray(secondData) ? secondData : []).toHaveLength(3);
  const count = await invokeCli(["assembly", "list", "--count", "--json"], { home });
  expect(document(count.out)).toMatchObject({ data: [], summary: { returned: 0, matched: 23 }, page: { limit: 0, complete: true } });
});

test("assembly read commands reject unexpected and unknown arguments", async () => {
  const home = await homeFixture();
  for (const args of [["assembly", "list", "unexpected"], ["assembly", "list", "--unknown", "value"]]) {
    const held = await invokeCli([...args, "--home", home], { home: "/definitely/absent" });
    expect(held.code, args.join(" ")).toBe(2);
    expect(held.out).toBe("");
    expect(held.err).toContain("Assembly list");
  }
  for (const args of [["assembly", "check", "review/main", "unexpected", "second"], ["assembly", "check", "review/main", "--unknown", "value"]]) {
    const held = await invokeCli([...args, "--home", home], { home: "/definitely/absent" });
    expect(held.code, args.join(" ")).toBe(2);
    expect(held.out).toBe("");
  }
});
