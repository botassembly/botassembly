// A run's record must identify the executable environment that produced it,
// not merely the assembly it consumed. The checkout leg is end-to-end: the
// commit in every record matches the checkout containing `main`; changed
// lockfile bytes change the provenance digest; and child records reuse the
// same facts rather than independently sampling their environment.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { main } from "../src/cli.ts";
import { resolveRuntimeProvenance, runtimeTreeIdentity } from "../src/runtime-provenance.ts";
import { at, events, realBoundary, runsIn, tempRoots, TEST_INSTALLATION_ID, writes } from "./cli-boundary.ts";

const roots = tempRoots();
const lockfile = fileURLToPath(new URL("../package-lock.json", import.meta.url));
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// This follows the resolved adapter module, not this test's or a caller's cwd:
// its package is the one the runtime actually imports.
async function adapterIdentity(): Promise<string> {
  const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-ai"));
  const manifest = JSON.parse(await readFile(join(dirname(dirname(entry)), "package.json"), "utf8")) as { name: string; version: string };
  return `${manifest.name}@${manifest.version}`;
}

async function assembly(home: string): Promise<void> {
  const root = join(home, "assemblies/review");
  await Promise.all([mkdir(join(root, "flows/main"), { recursive: true }), mkdir(join(root, "subflows/helper"), { recursive: true })]);
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-work.md"), "---\n---\nAsk the helper, then write the result.\n"),
    writeFile(join(root, "subflows/helper/FLOW.md"), "---\ndescription: helper\n---\n"),
    writeFile(join(root, "subflows/helper/01-work.md"), "---\n---\nWrite the result.\n"),
  ]);
}

function starts(records: Record<string, unknown>[]): Record<string, unknown> {
  const event = records.find((held) => held["event"] === "run_start");
  if (event === undefined) throw new Error("fixture did not produce a run_start");
  return event;
}

function childRecord(home: string, run: string): string {
  return `${home}/runs/${run}/stages/01-work/1/1/subflows/1/record.jsonl`;
}

async function sourceTree(root: string, reverse = false): Promise<void> {
  const files = [
    ["src/alpha.ts", "export const alpha = 1;\n"],
    ["src/nested/beta.ts", "export const beta = 2;\n"],
    ["package.json", '{"name":"bot"}\n'],
  ] as const;
  for (const [path, bytes] of reverse ? [...files].reverse() : files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
}

function expectedTreeIdentity(entries: ReadonlyArray<readonly [string, string | Buffer]>): string {
  const hash = createHash("sha256").update("bot-runtime-tree-v1\0");
  for (const [path, text] of [...entries].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) {
    const pathBytes = Buffer.from(path), bytes = Buffer.from(text), frame = Buffer.alloc(12);
    frame.writeUInt32BE(pathBytes.length, 0);
    frame.writeBigUInt64BE(BigInt(bytes.length), 4);
    hash.update(frame).update(pathBytes).update(bytes);
  }
  return hash.digest("hex");
}

afterEach(() => roots.cleanup());

test("every run_start names this checkout, Node, its resolved pi adapter, and the exact lockfile bytes", async () => {
  const { root, home } = await roots.scratch("bot-runtime-provenance-");
  await assembly(home);
  const { held, faux } = realBoundary(root, home, [], []);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "helper", input: "first" }] })], { stopReason: "toolUse" }),
    writes("$OUTPUT", "first helper"), fauxAssistantMessage("helper done"), writes("$OUTPUT", "first"), fauxAssistantMessage("done"),
  ]);

  const originalLock = await readFile(lockfile);
  await expect(main(["run", "start", "review/main", "request one"], held)).resolves.toBe(0);
  const firstRun = at(await runsIn(home), 0);
  const first = starts(await events(`${home}/runs/${firstRun}/record.jsonl`));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: packageRoot, encoding: "utf8" }).trim();
  const provenance = {
    runtime_source: "checkout",
    runtime_digest: commit,
    lock_sha256: sha256(originalLock),
    node: process.version,
    provider_adapter: await adapterIdentity(),
  };
  expect(first).toMatchObject(provenance);
  expect(first["installation_id"]).toBe(TEST_INSTALLATION_ID);
  expect(first["runtime_tree_sha256"]).toMatch(/^[0-9a-f]{64}$/u);
  // A child is a run in the same process, so it records the same facts.
  const child = starts(await events(childRecord(home, firstRun)));
  expect(child).toMatchObject({ ...provenance, installation_id: TEST_INSTALLATION_ID });
  expect(child["runtime_tree_sha256"]).toBe(first["runtime_tree_sha256"]);
});

test("runtime provenance hashes changed copied lockfile bytes", async () => {
  const { root } = await roots.scratch("bot-runtime-provenance-");
  const originalLock = await readFile(lockfile);
  const changedLock = Buffer.concat([originalLock, Buffer.from("\n")]);
  const copiedLockfile = join(root, "package-lock.json");
  await writeFile(copiedLockfile, changedLock);

  const changed = await resolveRuntimeProvenance(copiedLockfile);
  expect(changed).toMatchObject({ status: "resolved", provenance: { lockSha256: sha256(changedLock) } });
  expect(changed.status === "resolved" && changed.provenance.lockSha256).not.toBe(sha256(originalLock));
  expect(await readFile(lockfile)).toEqual(originalLock);
});

test("the observed runtime tree identity is stable by bytes and bytewise path order", async () => {
  const first = (await roots.scratch("bot-runtime-tree-a-")).root;
  const second = (await roots.scratch("bot-runtime-tree-b-")).root;
  await sourceTree(first);
  await sourceTree(second, true);
  const baseline = await runtimeTreeIdentity(first);
  expect(baseline).toBe(expectedTreeIdentity([
    ["package.json", '{"name":"bot"}\n'],
    ["src/alpha.ts", "export const alpha = 1;\n"],
    ["src/nested/beta.ts", "export const beta = 2;\n"],
  ]));
  expect(await runtimeTreeIdentity(second)).toBe(baseline);

  await writeFile(join(second, "src/alpha.ts"), "export const alpha = 0;\n");
  expect(await runtimeTreeIdentity(second)).not.toBe(baseline);
  await writeFile(join(second, "src/alpha.ts"), "export const alpha = 1;\n");
  await rename(join(second, "src/alpha.ts"), join(second, "src/gamma.ts"));
  expect(await runtimeTreeIdentity(second)).not.toBe(baseline);
  await rename(join(second, "src/gamma.ts"), join(second, "src/alpha.ts"));
  await writeFile(join(second, "package.json"), '{"name":"changed"}\n');
  expect(await runtimeTreeIdentity(second)).not.toBe(baseline);
});

test("the observed runtime tree includes more than 256 source files", async () => {
  const crowded = (await roots.scratch("bot-runtime-tree-crowded-")).root;
  await mkdir(join(crowded, "src"), { recursive: true });
  await writeFile(join(crowded, "package.json"), "{}\n");
  const entries: Array<readonly [string, string]> = [["package.json", "{}\n"]];
  for (let index = 0; index < 257; index += 1) {
    const path = `src/${String(index).padStart(3, "0")}.ts`;
    entries.push([path, `${String(index)}\n`]);
    await writeFile(join(crowded, path), `${String(index)}\n`);
  }
  const baseline = await runtimeTreeIdentity(crowded);
  expect(baseline).toBe(expectedTreeIdentity(entries));
  await writeFile(join(crowded, "src/256.ts"), "changed\n");
  expect(await runtimeTreeIdentity(crowded)).not.toBe(baseline);
});

test("the observed runtime tree includes source bytes beyond four MiB", async () => {
  const large = (await roots.scratch("bot-runtime-tree-large-")).root;
  const bytes = Buffer.alloc(4_194_305, 0x61);
  await mkdir(join(large, "src"), { recursive: true });
  await Promise.all([writeFile(join(large, "package.json"), "{}\n"), writeFile(join(large, "src/large.ts"), bytes)]);
  const baseline = await runtimeTreeIdentity(large);
  expect(baseline).toBe(expectedTreeIdentity([["package.json", "{}\n"], ["src/large.ts", bytes]]));
  bytes[bytes.length - 1] = 0x62;
  await writeFile(join(large, "src/large.ts"), bytes);
  expect(await runtimeTreeIdentity(large)).not.toBe(baseline);
});

test("the observed runtime tree includes a source path longer than 1024 bytes", async () => {
  const long = (await roots.scratch("bot-runtime-tree-long-path-")).root;
  const components = Array.from({ length: 5 }, (_, index) => `${String(index)}${"x".repeat(219)}`);
  const source = join(long, "src", ...components, "entry.ts");
  await mkdir(dirname(source), { recursive: true });
  await Promise.all([writeFile(join(long, "package.json"), "{}\n"), writeFile(source, "one\n")]);
  const relative = `src/${components.join("/")}/entry.ts`;
  expect(Buffer.byteLength(relative)).toBeGreaterThan(1_024);
  const baseline = await runtimeTreeIdentity(long);
  expect(baseline).toBe(expectedTreeIdentity([["package.json", "{}\n"], [relative, "one\n"]]));
  await writeFile(source, "two\n");
  expect(await runtimeTreeIdentity(long)).not.toBe(baseline);
});

test("an ordinary runtime source read failure still rejects the identity", async () => {
  const held = (await roots.scratch("bot-runtime-tree-read-failure-")).root;
  await sourceTree(held);
  await rename(join(held, "package.json"), join(held, "package-away.json"));
  await expect(runtimeTreeIdentity(held)).rejects.toThrow(/ENOENT/u);
});
