import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapping } from "../src/model.ts";
import { resolveInvocationTokens } from "../src/reader.ts";
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
  expect(human.out).toContain("flows/main/FLOW.md  flow-definition  type=FLOW  flow=flows/main  max_subflow_calls=10");
  expect(human.out).toContain("01-work  STAGE  flow=flows/main");
  const json = await invokeCli(["assembly", "check", "review/main", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  const checkDocument = document(json.out);
  expect(checkDocument).toMatchObject({
    schemaVersion: 1,
    kind: "bot.assembly.check",
    page: { limit: 20, next: null, through: null, complete: true },
    summary: { returned: 2, matched: 2, warningCount: 0, warningsOmitted: 0 },
    warnings: [],
  });
  const checkData = checkDocument["data"];
  if (!mapping(checkData) || !Array.isArray(checkData["stages"]) || !mapping(checkData["stages"][0])) throw new Error("Expected check stages.");
  expect(checkData["target"]).toBe("review/main");
  expect(checkData["stages"][0]).toEqual({ stage: "flows/main/FLOW.md", flow: "flows/main", type: "FLOW", max_subflow_calls: 10 });
  expect(checkData["stages"][1]).toMatchObject({ stage: "01-work", flow: "flows/main", type: "STAGE", input: ["request.txt"], output: "work.txt", files: ["01-work.md"] });
});

test("assembly check renders depth-dependent child artifacts in human and JSON modes", async () => {
  const home = await homeFixture();
  const recur = join(home, "assemblies", "recursive", "flows", "recur");
  await Promise.all([
    mkdir(join(recur, "00-plan"), { recursive: true }),
    mkdir(join(recur, "01-spread"), { recursive: true }),
    mkdir(join(recur, "subflows", "recur", "01-result"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "assemblies", "recursive", "ASSEMBLY.md"), "---\nintelligence: default\n---\nRecursive.\n"),
    writeFile(join(recur, "DESCEND.md"), "---\ndescription: recursive\nmax-depth: 2\n---\n"),
    writeFile(join(recur, "00-plan", "STAGE.md"), "---\n---\nPlan.\n"),
    writeFile(join(recur, "00-plan", "schema.json"), "{\"type\":\"object\"}\n"),
    writeFile(join(recur, "01-spread", "FANOUT.md"), "---\nitems: jobs\nsubflow: recur\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(recur, "02-finish.md"), "---\n---\nFinish.\n"),
    writeFile(join(recur, "subflows", "recur", "FLOW.md"), "---\ndescription: revealed helper\n---\n"),
    writeFile(join(recur, "subflows", "recur", "01-result", "STAGE.md"), "---\n---\nReturn JSON.\n"),
    writeFile(join(recur, "subflows", "recur", "01-result", "schema.json"), "{\"type\":\"object\"}\n"),
  ]);
  const json = await invokeCli(["assembly", "check", "recursive/recur", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  const data = document(json.out)["data"];
  if (!mapping(data) || !Array.isArray(data["stages"])) throw new Error("Expected check stages.");
  expect(data["stages"].find((row) => mapping(row) && row["type"] === "FANOUT")).toMatchObject({
    output: "<item>.txt", child_outputs: ["<item>.json"],
  });
  expect(data["stages"].find((row) => mapping(row) && row["stage"] === "02-finish")).toMatchObject({
    input: ["<item>.txt"], child_input: ["<item>.json"],
  });
  const human = await invokeCli(["assembly", "check", "recursive/recur"], { home });
  expect(human.code, human.err).toBe(0);
  expect(human.out).toContain("child_outputs=&lt;item&gt;.json");
  expect(human.out).toContain("child_input=&lt;item&gt;.json");
});

// The merge keeps the child's own possibilities, the way `child_outputs` keeps
// them for artifacts. A child context whose first arriving file matches the
// root's still reports the alternatives only it can see (ticket 0281).
test("a child context reports arriving possibilities the root cannot see", async () => {
  const home = await homeFixture();
  const recur = join(home, "assemblies", "deep", "flows", "recur");
  await Promise.all([
    mkdir(join(recur, "00-plan"), { recursive: true }),
    mkdir(join(recur, "01-spread"), { recursive: true }),
    mkdir(join(recur, "subflows", "recur", "01-result"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "assemblies", "deep", "ASSEMBLY.md"), "---\nintelligence: default\n---\nDeep.\n"),
    writeFile(join(recur, "DESCEND.md"), "---\ndescription: deep\nmax-depth: 3\n---\n"),
    writeFile(join(recur, "00-plan", "STAGE.md"), "---\n---\nPlan.\n"),
    writeFile(join(recur, "00-plan", "schema.json"), "{\"type\":\"object\"}\n"),
    writeFile(join(recur, "01-spread", "FANOUT.md"), "---\nitems: jobs\nsubflow: recur\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(recur, "02-finish.md"), "---\n---\nFinish.\n"),
    writeFile(join(recur, "subflows", "recur", "FLOW.md"), "---\ndescription: revealed helper\n---\n"),
    writeFile(join(recur, "subflows", "recur", "01-result", "STAGE.md"), "---\n---\nReturn JSON.\n"),
    writeFile(join(recur, "subflows", "recur", "01-result", "schema.json"), "{\"type\":\"object\"}\n"),
  ]);
  const json = await invokeCli(["assembly", "check", "deep/recur", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  const data = document(json.out)["data"];
  if (!mapping(data) || !Array.isArray(data["stages"])) throw new Error("Expected check stages.");
  expect(data["stages"].find((row) => mapping(row) && row["stage"] === "02-finish")).toMatchObject({
    input: ["<item>.txt"], child_possible_inputs: ["<item>.txt", "<item>.json"],
  });
  const human = await invokeCli(["assembly", "check", "deep/recur"], { home });
  expect(human.code, human.err).toBe(0);
  expect(human.out).toContain("child_possible_inputs=&lt;item&gt;.txt,&lt;item&gt;.json");
});

// The human rendering of an arriving union has its own line and its own witness.
test("the human check row prints possible_inputs beside possible_outputs", async () => {
  const home = await homeFixture();
  const change = join(home, "assemblies", "change", "flows", "change");
  await mkdir(join(change, "01-decide"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies", "change", "ASSEMBLY.md"), "---\nintelligence: default\n---\nChange.\n"),
    writeFile(join(change, "FLOW.md"), "---\ndescription: change\n---\n"),
    writeFile(join(change, "01-decide", "CHOOSE.md"), "---\n---\n\n- `escalate` \u2014 a person has to look\n- `patch` \u2014 fix it where it stands\n"),
    writeFile(join(change, "01-decide", "escalate.md"), "---\n---\nEscalate.\n"),
    writeFile(join(change, "01-decide", "patch.md"), "---\n---\nPatch.\n"),
    writeFile(join(change, "99-done.md"), "---\n---\nDone.\n"),
  ]);
  const human = await invokeCli(["assembly", "check", "change/change"], { home });
  expect(human.code, human.err).toBe(0);
  const done = human.out.split("\n").find((line) => line.startsWith("99-done  STAGE"));
  expect(done).toContain("input=escalate.txt  output=done.txt");
  expect(done).toMatch(/local-context=ignore {2}possible_inputs=escalate\.txt,patch\.txt$/u);
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
  expect(document(held.out)).toMatchObject({ kind: "bot.assembly.check", summary: { returned: 2, matched: 2 } });
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

test("assembly check paginates every definition and node without duplication or omission", async () => {
  const home = await homeFixture();
  const flow = join(home, "assemblies", "large", "flows", "main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies", "large", "ASSEMBLY.md"), "---\nintelligence: default\n---\nLarge.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    ...Array.from({ length: 202 }, (_unused, index) => writeFile(
      join(flow, `${String(index + 1).padStart(3, "0")}-work.md`), "---\n---\nWork.\n",
    )),
  ]);
  const stages: unknown[] = [];
  let after: string | null = null;
  do {
    const result = await invokeCli(["assembly", "check", "large/main", "--limit", "200", "--json", ...(after === null ? [] : ["--after", after])], { home });
    expect(result.code, result.err).toBe(0);
    const held = document(result.out), data = held["data"], page = held["page"];
    if (!mapping(data) || !Array.isArray(data["stages"]) || !mapping(page)) throw new Error("Expected a check page.");
    expect(held["summary"]).toMatchObject({ matched: 203 });
    stages.push(...(data["stages"] as unknown[]));
    after = typeof page["next"] === "string" ? page["next"] : null;
  } while (after !== null);
  expect(stages).toHaveLength(203);
  expect(new Set(stages.map((row) => mapping(row) ? `${String(row["flow"])}:${String(row["stage"])}` : "bad")).size).toBe(203);
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

/** The check document's `data` object, which ticket 0294 gave a `hash`. */
function checkData(text: string): Record<string, unknown> {
  const data = document(text)["data"];
  if (!mapping(data)) throw new Error("Expected check data.");
  return data;
}

async function checkHash(home: string, target: string): Promise<string> {
  const held = await invokeCli(["assembly", "check", target, "--json"], { home });
  expect(held.code, held.err).toBe(0);
  const hash = checkData(held.out)["hash"];
  if (typeof hash !== "string") throw new Error("Expected a check hash.");
  return hash;
}

test("every assembly check page carries the same hash", async () => {
  const home = await homeFixture();
  const first = await invokeCli(["assembly", "check", "review/main", "--limit", "1", "--json"], { home });
  expect(first.code, first.err).toBe(0);
  const page = document(first.out)["page"];
  if (!mapping(page) || typeof page["next"] !== "string") throw new Error("Expected a continuation cursor.");
  const second = await invokeCli(["assembly", "check", "review/main", "--limit", "1", "--after", page["next"], "--json"], { home });
  expect(second.code, second.err).toBe(0);
  expect(checkData(second.out)["hash"]).toBe(checkData(first.out)["hash"]);
});

// The hash resolve is defensive. No `bot assembly check` input reaches its
// refusal, because the one spelling the run parser reads differently — a `--`
// marker — the reading itself refuses first, so the command never gets that
// far. The two statements below are that proof: the function refuses those
// tokens, and the command exits 2 on them rather than reporting a null hash.
test("the hash resolve refuses tokens no accepted check reading can carry", async () => {
  const home = await homeFixture();
  const resolved = resolveInvocationTokens(["review/main", "--home", home, "--", "nothing"], "/", { BOT_HOME: home });
  expect(resolved.status).toBe("refused");
  const held = await invokeCli(["assembly", "check", "review/main", "--", "nothing", "--json"], { home });
  expect(held.code).toBe(2);
});

test("assembly list reports the hash only when a caller names the field", async () => {
  const home = await homeFixture();
  const expected = await checkHash(home, "review");
  const json = await invokeCli(["assembly", "list", "--fields", "name,hash", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  const rows = document(json.out)["data"];
  if (!Array.isArray(rows) || !mapping(rows[0])) throw new Error("Expected list rows.");
  expect(Object.keys(rows[0])).toEqual(["name", "hash"]);
  expect(rows[0]).toEqual({ name: "review", hash: expected });
  const table = await invokeCli(["assembly", "list", "--fields", "name,hash"], { home });
  expect(table.code, table.err).toBe(0);
  expect(table.out).toContain(`| review | ${expected} |`);
  const plain = await invokeCli(["assembly", "list", "--json"], { home });
  const defaults = document(plain.out)["data"];
  expect(Array.isArray(defaults) ? defaults.filter(mapping).every((one) => !("hash" in one)) : false).toBe(true);
  const count = await invokeCli(["assembly", "list", "--count"], { home });
  expect(count.code, count.err).toBe(0);
  expect(count.out).toBe("2 assemblies match.\n");
});

test("a broken link reports no hash", async () => {
  const home = await homeFixture();
  await symlink(join(home, "assemblies", "absent"), join(home, "assemblies", "dangling"));
  const json = await invokeCli(["assembly", "list", "--fields", "name,broken,hash", "--json"], { home });
  expect(json.code, json.err).toBe(0);
  const rows = document(json.out)["data"];
  if (!Array.isArray(rows)) throw new Error("Expected list rows.");
  expect(rows.filter(mapping).find((one) => one["name"] === "dangling")).toEqual({ name: "dangling", broken: true, hash: null });
});

test("capabilities publishes the widened field vocabulary and the unchanged default", async () => {
  const home = await homeFixture();
  const listed = commands((await invokeCli(["capabilities", "--json"], { home })).out).find((row) => row["operation"] === "assembly.list");
  const options = Array.isArray(listed?.["options"]) ? listed["options"].filter(mapping) : [];
  const fields = options.find((one) => one["name"] === "--fields");
  expect(fields?.["values"]).toEqual(["name", "kind", "source", "updated", "target", "broken", "hash"]);
  expect(fields?.["default"]).toBe("name,kind,source,updated,target,broken");
});
