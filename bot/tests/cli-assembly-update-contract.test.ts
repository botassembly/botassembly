import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapping } from "../src/model.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-assembly-update-contract-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(join(home, "assemblies"), { recursive: true });
  return { root, home };
}

async function assembly(path: string, text: string): Promise<string> {
  await mkdir(join(path, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(path, "ASSEMBLY.md"), `---\nintelligence: default\n---\n${text}\n`),
    writeFile(join(path, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(path, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  return path;
}

function object(text: string): Record<string, unknown> {
  const held: unknown = JSON.parse(text);
  if (!mapping(held)) throw new Error("Expected an object.");
  return held;
}

function commands(text: string): Array<Record<string, unknown>> {
  const data = object(text)["data"];
  if (!mapping(data) || !Array.isArray(data["commands"])) throw new Error("Expected capability commands.");
  return data["commands"].filter(mapping);
}

test("assembly update returns ordered updated and unchanged outcomes", async () => {
  const { root, home } = await fixture();
  const source = await assembly(join(root, "source"), "Version one.");
  expect((await invokeCli(["assembly", "install", source, "--name", "a-copy", "--json"], { home })).code).toBe(0);
  const live = await assembly(join(root, "live"), "Live.");
  expect((await invokeCli(["assembly", "link", live, "--name", "z-live", "--json"], { home })).code).toBe(0);
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nVersion two.\n");

  const result = await invokeCli(["assembly", "update", "--json"], { home });
  expect(result.code, result.err).toBe(0);
  expect(object(result.out)).toEqual({
    schemaVersion: 1,
    kind: "bot.assembly.update",
    data: { outcomes: [
      { name: "a-copy", state: "updated", reason: `Installed a replacement from ${source}.` },
      { name: "z-live", state: "unchanged", reason: "The linked assembly is already live." },
    ] },
  });
  await expect(readFile(join(home, "assemblies", "a-copy", "ASSEMBLY.md"), "utf8")).resolves.toContain("Version two.");

  const human = await invokeCli(["assembly", "update", "z-live"], { home });
  expect(human).toEqual({ code: 0, out: "z-live  linked  already live\n", err: "" });
});

test("assembly update reports an earlier success and the first failed outcome", async () => {
  const { root, home } = await fixture();
  const first = await assembly(join(root, "first"), "First version one.");
  const last = await assembly(join(root, "last"), "Last version one.");
  expect((await invokeCli(["assembly", "install", first, "--name", "a-first", "--json"], { home })).code).toBe(0);
  expect((await invokeCli(["assembly", "install", last, "--name", "z-last", "--json"], { home })).code).toBe(0);
  await writeFile(join(first, "ASSEMBLY.md"), "---\nintelligence: default\n---\nFirst version two.\n");
  await rm(join(last, "ASSEMBLY.md"));

  const result = await invokeCli(["assembly", "update", "--json"], { home });
  expect(result).toMatchObject({ code: 2, err: "" });
  expect(object(result.out)).toEqual({
    schemaVersion: 1,
    kind: "bot.assembly.update",
    data: { outcomes: [
      { name: "a-first", state: "updated", reason: `Installed a replacement from ${first}.` },
      { name: "z-last", state: "failed", reason: "Name an assembly; what is there is not one." },
    ] },
  });
  await expect(readFile(join(home, "assemblies", "a-first", "ASSEMBLY.md"), "utf8")).resolves.toContain("First version two.");
  await expect(readFile(join(home, "assemblies", "z-last", "ASSEMBLY.md"), "utf8")).resolves.toContain("Last version one.");

  const missing = await invokeCli(["assembly", "update", "missing", "-j"], { home });
  expect(missing.code).toBe(2);
  expect(object(missing.out)).toEqual({
    schemaVersion: 1,
    kind: "bot.assembly.update",
    data: { outcomes: [{ name: "missing", state: "failed", reason: "Name an assembly the home holds." }] },
  });
});

test("assembly update reports an exceptional failure after an earlier replacement", async () => {
  const { root, home } = await fixture();
  const first = await assembly(join(root, "first"), "First version one.");
  const last = await assembly(join(root, "last"), "Last version one.");
  expect((await invokeCli(["assembly", "install", first, "--name", "a-first", "--json"], { home })).code).toBe(0);
  expect((await invokeCli(["assembly", "install", last, "--name", "z-last", "--json"], { home })).code).toBe(0);
  await writeFile(join(first, "ASSEMBLY.md"), "---\nintelligence: default\n---\nFirst version two.\n");
  await writeFile(join(last, "ASSEMBLY.md"), "---\nintelligence: default\n---\nLast version two.\n");
  let replacements = 0;
  const failure = `Controlled\0failure\n${"x".repeat(700)}`;

  const result = await invokeCli(["assembly", "update", "--json"], {
    home,
    afterAssemblyUpdateAside: () => {
      replacements += 1;
      return replacements === 2 ? Promise.reject(new Error(failure)) : Promise.resolve();
    },
  });
  expect(result).toMatchObject({ code: 2, err: "" });
  const document = object(result.out);
  const data = document["data"];
  const outcomes = mapping(data) && Array.isArray(data["outcomes"]) ? data["outcomes"] : [];
  expect(outcomes[0]).toEqual({ name: "a-first", state: "updated", reason: `Installed a replacement from ${first}.` });
  expect(outcomes[1]).toMatchObject({ name: "z-last", state: "failed" });
  const reason = mapping(outcomes[1]) && typeof outcomes[1]["reason"] === "string" ? outcomes[1]["reason"] : "";
  expect(reason).toContain("Controlled\0failure\n");
  expect(Buffer.byteLength(reason)).toBeLessThanOrEqual(512);
  expect(result.out).toContain("Controlled\\u0000failure\\n");
  expect(result.out.slice(0, -1)).not.toContain("\n");
  expect(Buffer.byteLength(result.out)).toBeLessThanOrEqual(65_536);
  await expect(readFile(join(home, "assemblies", "a-first", "ASSEMBLY.md"), "utf8")).resolves.toContain("First version two.");
});

test("assembly update reports updated state when old-tree cleanup fails after publication", async () => {
  const { root, home } = await fixture();
  const source = await assembly(join(root, "source"), "Version one.");
  expect((await invokeCli(["assembly", "install", source, "--name", "review", "--json"], { home })).code).toBe(0);
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nVersion two.\n");

  const result = await invokeCli(["assembly", "update", "review", "--json"], {
    home,
    afterAssemblyUpdatePublish: () => Promise.reject(new Error("Controlled cleanup failure.")),
  });
  expect(result).toMatchObject({ code: 2, err: "" });
  expect(object(result.out)).toEqual({
    schemaVersion: 1,
    kind: "bot.assembly.update",
    data: { outcomes: [{
      name: "review",
      state: "updated",
      reason: `Installed a replacement from ${source}. Cleanup failed: Controlled cleanup failure.`,
    }] },
  });
  await expect(readFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "utf8")).resolves.toContain("Version two.");
  await expect(readdir(join(home, "assemblies"))).resolves.toEqual([".bot-old-review", "review"]);
});

test("assembly update refuses an oversized batch before changing an installation", async () => {
  const { root, home } = await fixture();
  const source = await assembly(join(root, "source"), "Source.");
  for (let index = 0; index < 24; index += 1) {
    const name = index.toString().padStart(2, "0");
    const installed = await assembly(join(home, "assemblies", name), "Installed marker.");
    await writeFile(join(installed, ".bot-source"), `${source}\n2026-08-01T00:00:00.000Z\n`);
  }

  const result = await invokeCli(["assembly", "update", "--json"], { home });
  expect(result).toMatchObject({ code: 2, out: "" });
  expect(object(result.err)).toMatchObject({
    schemaVersion: 1,
    kind: "error",
    error: { operation: "assembly.update", cause: "result-oversized" },
  });
  await expect(readFile(join(home, "assemblies", "00", "ASSEMBLY.md"), "utf8")).resolves.toContain("Installed marker.");
});

test("locked update selection prevents a concurrent install from outgrowing its result", async () => {
  const { root, home } = await fixture();
  const source = await assembly(join(root, "source"), "Updated source.");
  for (let index = 0; index < 20; index += 1) {
    const installed = await assembly(join(home, "assemblies", index.toString().padStart(2, "0")), "Installed marker.");
    await writeFile(join(installed, ".bot-source"), `${source}\n2026-08-01T00:00:00.000Z\n`);
  }
  let selected: () => void = () => undefined, resume: () => void = () => undefined;
  const selectionHeld = new Promise<void>((resolve) => { selected = resolve; });
  const continueUpdate = new Promise<void>((resolve) => { resume = resolve; });

  const updatePending = invokeCli(["assembly", "update", "--json"], {
    home, afterAssemblyUpdateSelection: async () => { selected(); await continueUpdate; },
  });
  await selectionHeld;
  const concurrent = await invokeCli(["assembly", "install", source, "--name", "20", "--json"], { home });
  resume();
  const updated = await updatePending;

  expect(concurrent).toMatchObject({ code: 4, out: "" });
  expect(object(concurrent.err)).toMatchObject({
    error: { operation: "assembly.install", code: "dependency-failed", cause: "creation-busy", retryable: true },
  });
  expect(updated).toMatchObject({ code: 0, err: "" });
  const data = object(updated.out)["data"];
  expect(mapping(data) && Array.isArray(data["outcomes"]) ? data["outcomes"] : []).toHaveLength(20);
  expect(Buffer.byteLength(updated.out)).toBeLessThanOrEqual(65_536);
  await expect(readFile(join(home, "assemblies", "20", "ASSEMBLY.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

test("assembly update publishes its options, bounds, help, and finite reasons", async () => {
  const { home } = await fixture();
  const descriptors = commands((await invokeCli(["capabilities", "--json"], { home })).out);
  expect(descriptors.find((row) => row["operation"] === "assembly.update")).toEqual({
    operation: "assembly.update",
    command: ["assembly", "update"],
    output: { kind: "bot.assembly.update", schemaVersion: 1 },
    modes: ["markdown", "json"],
    home: "writes",
    mutates: true,
    network: "conditional",
    options: [
      { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
      { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    ],
    limits: { humanErrorBytes: 2_048, reasonBytes: 512, resultBytes: 65_536 },
  });
  const help = await invokeCli(["assembly", "update", "--help"], { home });
  expect(help.code, help.err).toBe(0);
  expect(help.out).toContain("usage: bot assembly update [<name>]");
  expect(help.out).toContain("Output: bot.assembly.update@1");

  const longName = `missing-${"x".repeat(700)}`;
  const failed = await invokeCli(["assembly", "update", longName, "--json"], { home });
  const data = object(failed.out)["data"];
  expect(mapping(data) && Array.isArray(data["outcomes"]) ? data["outcomes"] : []).toEqual([
    { name: longName, state: "failed", reason: "Name an assembly the home holds." },
  ]);
  expect(Buffer.byteLength(failed.out)).toBeLessThanOrEqual(65_536);
});
