import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { resolveInvocationTokens } from "../src/reader.ts";
import { runCommand, type RunDependencies, type RunRequest } from "../src/run.ts";
import { realBoundary, tempRoots, writes } from "./cli-boundary.ts";
import { TEST_INSTALLATION_ID } from "./cli-boundary.ts";

const roots = tempRoots();
const request: RunRequest = { bytes: Buffer.from("the request"), extension: "txt", via: "argument" };

afterEach(() => roots.cleanup());

async function fixture(prefix: string): Promise<{
  root: string; home: string; boundary: ReturnType<typeof realBoundary>; resolved: ReturnType<typeof resolved>;
}> {
  const { root, home } = await roots.scratch(prefix);
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWork.\n"),
  ]);
  const boundary = realBoundary(root, home, [], []);
  return { root, home, boundary, resolved: resolved(root, boundary.held.env) };
}

function resolved(root: string, env: NodeJS.ProcessEnv) {
  const found = resolveInvocationTokens(["review/main", "the request"], root, env);
  if (found.status !== "resolved") throw new Error("Fixture invocation did not resolve.");
  return found;
}

function dependencies(
  held: ReturnType<typeof realBoundary>["held"], extra: Partial<RunDependencies> = {},
): RunDependencies {
  return {
    cwd: held.cwd, env: held.env, clock: held.clock, progress: () => undefined,
    ...(held.models === undefined ? {} : { models: held.models }), ...extra,
  };
}

function oneLine(result: Awaited<ReturnType<typeof runCommand>>, operation: RegExp): void {
  expect(result).toMatchObject({ exitCode: 2, cause: "fault" });
  if (!("reason" in result)) throw new Error("Fault omitted its reason.");
  expect(result.reason).toMatch(operation);
  expect(result.reason).not.toMatch(/[\r\n]/u);
  expect(Buffer.byteLength(result.reason)).toBeLessThanOrEqual(2048);
}

test("an asynchronous capture callback failure removes the unborn run and releases its reservation", async () => {
  const held = await fixture("bot-prestart-capture-");
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    captured: (file) => file === "ASSEMBLY.md"
      ? Promise.reject(new Error(`capture callback exploded\n${"x".repeat(5000)}`))
      : Promise.resolve(),
  }));

  oneLine(result, /^Assembly capture failed: capture callback exploded /u);
  await expect(readdir(join(held.home, "runs"))).resolves.toEqual([]);

  held.boundary.faux.setResponses([writes("$OUTPUT", "done"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "the request"], held.boundary.held)).resolves.toBe(0);
  expect((await readdir(join(held.home, "runs"))).filter((name) => !name.endsWith(".lock"))).toHaveLength(1);
});

test("a runtime source read failure faults before a run exists", async () => {
  const held = await fixture("bot-prestart-runtime-tree-");
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    runtimeProvenance: () => Promise.resolve({ status: "failed", reason: "EACCES: permission denied, read 'package.json'" }),
  }));

  oneLine(result, /^EACCES: permission denied, read 'package\.json'$/u);
  await expect(readdir(join(held.home, "runs"))).resolves.toEqual([]);
});

test("a synchronous model catalogue throw becomes a bounded model-validation fault", async () => {
  const held = await fixture("bot-prestart-models-");
  const available = held.boundary.held.models;
  if (available === undefined) throw new Error("Fixture omitted models.");
  available.getAvailable = (): Promise<never> => { throw new Error("model catalogue exploded"); };

  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, { models: available }));
  oneLine(result, /^Model validation failed: model catalogue exploded$/u);
  await expect(readdir(join(held.home, "runs"))).resolves.toEqual([]);
});

test("a rejected initial record write removes its partial record and preserves a caller-owned id file", async () => {
  const held = await fixture("bot-prestart-record-");
  const idFile = join(held.root, "caller-id");
  await writeFile(idFile, "caller bytes\n");
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    idFile,
    startRecord: async (writer) => {
      await writeFile(writer.recordPath, "partial record\n");
      throw new Error("record start exploded");
    },
  }));

  oneLine(result, /^Run record start failed: record start exploded$/u);
  await expect(readdir(join(held.home, "runs"))).resolves.toEqual([]);
  await expect(readFile(idFile, "utf8")).resolves.toBe("caller bytes\n");
});

test("an unborn-run removal failure takes precedence and the reservation is still released", async () => {
  const held = await fixture("bot-prestart-cleanup-");
  let removed = "";
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    captured: () => Promise.reject(new Error("capture failed first")),
    removeUnborn: (directory) => { removed = directory; return Promise.reject(new Error("cleanup exploded")); },
  }));

  oneLine(result, /^Unborn run cleanup failed after assembly capture failed: cleanup exploded$/u);
  expect(removed).not.toBe("");
  const names = await readdir(join(held.home, "runs"));
  expect(names.some((name) => name.endsWith(".lock"))).toBe(false);
  expect(names).toHaveLength(1);
});

test("cleanup failure also supersedes a typed refusal without changing a caller-owned id file", async () => {
  const held = await fixture("bot-prestart-refusal-cleanup-");
  const idFile = join(held.root, "caller-id");
  await writeFile(idFile, "keep this\n");
  await writeFile(join(held.home, "assemblies/review/unrecognized.txt"), "refuse this entry\n");
  const cleanup = Object.assign(new Error("remove failed"), {
    code: "EIO", syscall: "rm", errno: -5, path: join(held.home, "runs"),
  });

  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    idFile,
    removeUnborn: () => Promise.reject(cleanup),
  }));

  oneLine(result, /^Unborn run cleanup failed after assembly preparation refusal: EIO rm /u);
  const names = await readdir(join(held.home, "runs"));
  expect(names.some((name) => name.endsWith(".lock"))).toBe(false);
  expect(names).toHaveLength(1);
  await expect(readFile(idFile, "utf8")).resolves.toBe("keep this\n");
});

test("an unexpected runtime rejection after run_start returns the exact appended fault ending", async () => {
  const held = await fixture("bot-started-runtime-fault-");
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    executeFlow: () => Promise.reject(new Error("runtime escaped")),
  }));

  expect(result).toMatchObject({ exitCode: 2, cause: "fault", reason: "runtime escaped" });
  if (!("run" in result) || result.ending === undefined) throw new Error("Started fault omitted its durable identity or ending.");
  const record: unknown = JSON.parse(
    (await readFile(join(held.home, "runs", result.run, "record.jsonl"), "utf8")).trim().split("\n").at(-1) ?? "null",
  );
  expect(result.ending).toEqual(record);
});

test("an unexpected runtime rejection with an unwritable ending stays an incomplete started result", async () => {
  const held = await fixture("bot-started-runtime-incomplete-");
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    executeFlow: async (input) => {
      await rm(input.writer.recordPath);
      await mkdir(input.writer.recordPath);
      throw new Error("runtime escaped first");
    },
  }));

  expect(result).toMatchObject({ exitCode: 2, cause: "fault" });
  if (!("run" in result)) throw new Error("Started writer fault omitted its durable identity.");
  expect(result.ending).toBeUndefined();
  expect(result.reason).toContain("EISDIR");
});

test("a structured result projects installation identity from the appended run_start", async () => {
  const held = await fixture("bot-start-installation-projection-");
  held.boundary.faux.setResponses([writes("$OUTPUT", "done"), fauxAssistantMessage("done")]);
  const changed = "118f2f4a-52f8-4c81-9b35-6ad2acdb70d9";
  const result = await runCommand(held.resolved, request, dependencies(held.boundary.held, {
    startRecord: async (writer, event) => {
      await writer.start(event);
      await writeFile(join(held.home, "installation.json"), `${JSON.stringify({ schemaVersion: 1, kind: "bot.installation", data: { id: changed } })}\n`);
    },
  }));
  expect(result).toMatchObject({ exitCode: 0, installationId: TEST_INSTALLATION_ID });
  const record: unknown = JSON.parse(await readFile(join(held.home, "installation.json"), "utf8"));
  expect(record).toMatchObject({ data: { id: changed } });
});
