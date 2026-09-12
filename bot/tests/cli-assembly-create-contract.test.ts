import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapping } from "../src/model.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(): Promise<{ root: string; home: string; source: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-assembly-create-contract-"));
  roots.push(root);
  const home = join(root, "home"), source = join(root, "review");
  await mkdir(join(home, "assemblies"), { recursive: true });
  await mkdir(join(source, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(source, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(source, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  return { root, home, source };
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

test("assembly install and link return finite versioned creation results", async () => {
  const { root, home, source } = await fixture();
  const installed = await invokeCli(["assembly", "install", source, "--name", "team/review", "--json"], { home });
  expect(installed.code, installed.err).toBe(0);
  expect(object(installed.out)).toEqual({
    schemaVersion: 1, kind: "bot.assembly.install",
    data: { name: "team/review", kind: "installed", changed: true },
  });
  expect(Buffer.byteLength(installed.out)).toBeLessThanOrEqual(8_192);
  await expect(readFile(join(home, "assemblies", "team", "review", "ASSEMBLY.md"), "utf8")).resolves.toContain("Review.");

  const linked = await invokeCli(["assembly", "link", source, "--name", "live", "-j"], { home });
  expect(linked.code, linked.err).toBe(0);
  expect(object(linked.out)).toEqual({
    schemaVersion: 1, kind: "bot.assembly.link",
    data: { name: "live", kind: "linked", changed: true },
  });
  expect((await lstat(join(home, "assemblies", "live"))).isSymbolicLink()).toBe(true);

  const humanHome = join(root, "human-home");
  await mkdir(join(humanHome, "assemblies"), { recursive: true });
  expect(await invokeCli(["assembly", "install", source], { home: humanHome })).toEqual({
    code: 0, out: `review  installed  from ${source}\n`, err: "",
  });
});

test("creation refusals are structured and never replace an existing installation", async () => {
  const { home, source } = await fixture();
  const first = await invokeCli(["assembly", "install", source, "--json"], { home });
  expect(first.code, first.err).toBe(0);
  const installed = join(home, "assemblies", "review", "ASSEMBLY.md");
  const before = await readFile(installed);
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nChanged.\n");

  const collision = await invokeCli(["assembly", "install", source, "--json"], { home });
  expect(collision).toMatchObject({ code: 2, out: "" });
  expect(object(collision.err)).toMatchObject({
    schemaVersion: 1, kind: "error",
    error: { operation: "assembly.install", code: "request-invalid", cause: "assembly-refused", retryable: false,
      details: { refusals: [{ code: "request-invalid", path: "review" }], omitted: 0 } },
  });
  await expect(readFile(installed)).resolves.toEqual(before);

  const missing = await invokeCli(["assembly", "link", "./missing", "--json"], { home });
  expect(missing).toMatchObject({ code: 2, out: "" });
  expect(object(missing.err)).toMatchObject({ error: { operation: "assembly.link", cause: "assembly-refused" } });
  await expect(lstat(join(home, "assemblies", "missing"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("creation preflights its result bound before changing the home", async () => {
  const { home, source } = await fixture();
  const name = "x".repeat(8_193);
  const result = await invokeCli(["assembly", "link", source, "--name", name, "--json"], { home });
  expect(result).toMatchObject({ code: 2, out: "" });
  expect(object(result.err)).toMatchObject({ error: { operation: "assembly.link", cause: "result-oversized" } });
  expect(await lstat(join(home, "assemblies"))).toBeDefined();
});

test("creation descriptors and generated help publish the current contract", async () => {
  const { home } = await fixture();
  const descriptors = commands((await invokeCli(["capabilities", "--json"], { home })).out);
  expect(descriptors.find((row) => row["operation"] === "assembly.install")).toEqual({
    operation: "assembly.install", command: ["assembly", "install"], output: { kind: "bot.assembly.install", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "writes", mutates: true, network: "conditional",
    options: [
      { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
      { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
      { name: "--name", aliases: [], type: "string", repeatable: false },
    ], limits: { humanErrorBytes: 2_048, resultBytes: 8_192 },
  });
  expect(descriptors.find((row) => row["operation"] === "assembly.link")).toMatchObject({
    command: ["assembly", "link"], output: { kind: "bot.assembly.link", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "writes", mutates: true, network: "never",
  });
  for (const command of ["install", "link"]) {
    const help = await invokeCli(["assembly", command, "--help"], { home });
    expect(help.code, help.err).toBe(0);
    expect(help.out).toContain(`usage: bot assembly ${command}`);
    expect(help.out).toContain("Output: bot.assembly.");
  }
});
