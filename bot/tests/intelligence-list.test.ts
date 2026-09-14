// Ticket 0297. `bot intelligence list` reads the home's `intelligences` table
// and nothing else: no Pi, no network, no assembly. The table is the one
// `bot/src/home-config.ts` reads, so a malformed row refuses here with the
// faults that reader collects, the way `bot assembly check` refuses one.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { mapping } from "../src/model.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function home(config: string | undefined): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-intelligence-list-"));
  roots.push(root);
  const place = join(root, "home");
  await mkdir(place);
  if (config !== undefined) await writeFile(join(place, "config.yaml"), config);
  return place;
}

async function invoke(args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd, env: {}, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock: {
      milliseconds: () => 0, timestamp: () => "2026-09-14T12:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
    },
  };
  const code = await main(args, boundary);
  return { code, out: Buffer.concat(stdout).toString(), err: Buffer.concat(stderr).toString() };
}

const THREE = [
  "intelligences:",
  "  zed: { provider: faux, model: faux-9, reasoning: high }",
  "  default: { provider: faux, model: faux-1, reasoning: medium }",
  "  plain: { model: faux-2, reasoning: low }",
  "",
].join("\n");

test("three rows list sorted by name in Markdown, with a dash for an unauthored provider", async () => {
  const place = await home(THREE);
  const held = await invoke(["intelligence", "list", "--home", place], place);
  expect(held).toEqual({
    code: 0,
    out: [
      "# Intelligences", "",
      "| name | provider | model | reasoning |",
      "| --- | --- | --- | --- |",
      "| default | faux | faux-1 | medium |",
      "| plain | - | faux-2 | low |",
      "| zed | faux | faux-9 | high |",
      "",
    ].join("\n"),
    err: "",
  });
});

test("the JSON document holds the same three sorted rows with a null provider", async () => {
  const place = await home(THREE);
  const held = await invoke(["intelligence", "list", "--home", place, "--json"], place);
  expect(held.code).toBe(0);
  expect(held.err).toBe("");
  expect(JSON.parse(held.out)).toEqual({
    schemaVersion: 1, kind: "bot.intelligence.list",
    data: [
      { name: "default", provider: "faux", model: "faux-1", reasoning: "medium" },
      { name: "plain", provider: null, model: "faux-2", reasoning: "low" },
      { name: "zed", provider: "faux", model: "faux-9", reasoning: "high" },
    ],
  });
});

test("a home with no config.yaml lists zero rows and exits zero in both modes", async () => {
  const place = await home(undefined);
  expect(await invoke(["intelligence", "list", "--home", place], place))
    .toEqual({ code: 0, out: "# Intelligences\n", err: "" });
  const json = await invoke(["intelligence", "list", "--home", place, "--json"], place);
  expect(json.code).toBe(0);
  expect(JSON.parse(json.out)).toEqual({ schemaVersion: 1, kind: "bot.intelligence.list", data: [] });
});

test("an intelligence with no model refuses with cause home-invalid, exit 2, and the fault in details", async () => {
  const place = await home("intelligences:\n  default: { provider: faux, reasoning: medium }\n");
  const held = await invoke(["intelligence", "list", "--home", place, "--json"], place);
  expect(held.code).toBe(2);
  expect(held.out).toBe("");
  const parsed: unknown = JSON.parse(held.err);
  expect(mapping(parsed) && parsed["error"]).toMatchObject({
    code: "request-invalid", operation: "intelligence.list", cause: "home-invalid", retryable: false,
  });
  const error = mapping(parsed) ? parsed["error"] : undefined;
  const faults = mapping(error) ? error["details"] : undefined;
  expect(mapping(faults) && faults["faults"]).toMatchObject([{ code: "key-missing" }]);
});

test("a malformed table refuses in Markdown with one bounded line and an empty standard output", async () => {
  const place = await home("intelligences: 7\n");
  const held = await invoke(["intelligence", "list", "--home", place], place);
  expect(held.code).toBe(2);
  expect(held.out).toBe("");
  expect(held.err).toBe("The home configuration is not valid.\n");
});

test("--home followed by a flag refuses rather than resolving a home named for the flag", async () => {
  const place = await home(THREE);
  const held = await invoke(["intelligence", "list", "--home", "-j"], place);
  expect(held.code).toBe(2);
  expect(held.out).toBe("");
  // `-j` is the JSON mode word, so the refusal it names arrives as the document.
  const parsed: unknown = JSON.parse(held.err);
  expect(mapping(parsed) && parsed["error"]).toMatchObject({
    code: "request-invalid", operation: "intelligence.list", cause: "value-missing",
    message: "Intelligence list requires a value after --home.",
  });
  const plain = await invoke(["intelligence", "list", "--home", "--verbose"], place);
  expect(plain).toEqual({ code: 2, out: "", err: "Intelligence list requires a value after --home.\n" });
});

test("intelligence list rejects every malformed request before output", async () => {
  const place = await home(THREE);
  const malformed = [
    ["--json", "--json"], ["--json", "-j"], ["--home", place, "--home", place],
    ["--home"], ["--home", "--json"], ["--home", "-j"],
    ["--home", place, "--unknown"], ["--home", place, "stray"],
  ];
  for (const args of malformed) {
    const result = await invoke(["intelligence", "list", ...args], place);
    expect(result.code, args.join(" ")).toBe(2);
    expect(result.out, args.join(" ")).toBe("");
    expect(Buffer.byteLength(result.err), args.join(" ")).toBeLessThanOrEqual(2_049);
  }
  const json = await invoke(["intelligence", "list", "--home", place, "stray", "--json"], place);
  const parsed: unknown = JSON.parse(json.err);
  expect(mapping(parsed) && parsed["error"]).toMatchObject({ code: "request-invalid", operation: "intelligence.list" });
});

test("a table past the output bound refuses with integrity-failed, result-oversized, and exit 5", async () => {
  const names = Array.from({ length: 1_200 }, (_held, index) => `  name${String(index).padStart(4, "0")}: { provider: faux, model: faux-1, reasoning: medium }`);
  const place = await home(`intelligences:\n${names.join("\n")}\n`);
  const held = await invoke(["intelligence", "list", "--home", place, "--json"], place);
  expect(held.code).toBe(5);
  expect(held.out).toBe("");
  const parsed: unknown = JSON.parse(held.err);
  expect(mapping(parsed) && parsed["error"]).toMatchObject({
    code: "integrity-failed", operation: "intelligence.list", cause: "result-oversized", retryable: false,
  });
});
