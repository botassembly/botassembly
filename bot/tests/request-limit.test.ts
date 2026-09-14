import { createHash } from "node:crypto";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "vitest";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { main } from "../src/cli.ts";
import { parseRunInvocationTokens } from "../src/invocation.ts";
import { resumeDonor } from "../src/continuation.ts";
import { prehashAssembly } from "../src/record.ts";
import { readBoundedBytes } from "../src/documents.ts";
import { REQUEST_MAX_BYTES, REQUEST_TOO_LARGE_SENTENCE } from "../src/request-limit.ts";
import { RequestTooLargeError, readByteStream } from "../src/stdin.ts";
import { currentRecord } from "./current-record.ts";
import { realBoundary, writes } from "./cli-boundary.ts";
import { boundaryFor } from "./assembly-home.ts";
import { invokeCliBytes } from "./invoke.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("direct requests admit the exact byte maximum and refuse one byte more", () => {
  const exact = parseRunInvocationTokens(["review/main", "x".repeat(REQUEST_MAX_BYTES)], "/absent", {});
  const excess = parseRunInvocationTokens(["review/main", "x".repeat(REQUEST_MAX_BYTES + 1)], "/absent", {});
  expect(exact.request?.body.length).toBe(REQUEST_MAX_BYTES);
  expect(exact.faults).toEqual([]);
  expect(excess.request).toBeUndefined();
  expect(excess.faults).toEqual([{ code: "request-invalid", path: "review/main", sentence: REQUEST_TOO_LARGE_SENTENCE }]);
});

test("task files bound both complete source and retained transformed body", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-request-limit-"));
  roots.push(root);
  const exact = join(root, "exact.md"), excess = join(root, "excess.md"), expanded = join(root, "expanded.md");
  await writeFile(exact, Buffer.alloc(REQUEST_MAX_BYTES, 0x61));
  await writeFile(excess, Buffer.alloc(REQUEST_MAX_BYTES + 1, 0x61));
  const invalid = Buffer.alloc(Math.floor(REQUEST_MAX_BYTES / 3) + 1, 0xff);
  await writeFile(expanded, invalid);

  const admitted = parseRunInvocationTokens(["review/main", "@exact.md"], root, {});
  const sourceRefusal = parseRunInvocationTokens(["review/main", "@excess.md"], root, {});
  const bodyRefusal = parseRunInvocationTokens(["review/main", "@expanded.md"], root, {});
  expect(Buffer.byteLength(admitted.request?.body ?? "")).toBe(REQUEST_MAX_BYTES);
  expect(sourceRefusal.request).toBeUndefined();
  expect(sourceRefusal.faults).toContainEqual({ code: "request-invalid", path: "excess.md", sentence: REQUEST_TOO_LARGE_SENTENCE });
  expect(bodyRefusal.request).toBeUndefined();
  expect(bodyRefusal.faults).toContainEqual({ code: "request-invalid", path: "expanded.md", sentence: REQUEST_TOO_LARGE_SENTENCE });
});

test("the bounded task reader rejects a path replacement after reading the held file", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-request-replaced-"));
  roots.push(root);
  const path = join(root, "task.md"), moved = join(root, "task-before.md");
  await writeFile(path, "original");
  const result = readBoundedBytes(path, REQUEST_MAX_BYTES, { afterRead: () => {
    renameSync(path, moved);
    writeFileSync(path, "replacement");
  } });
  expect(result).toEqual({ kind: "unreadable" });
});

test("the bounded task reader requests no more than maximum plus one source byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-request-read-count-"));
  roots.push(root);
  const path = join(root, "task.md");
  await writeFile(path, Buffer.alloc(REQUEST_MAX_BYTES + 64 * 1024));
  let total = 0;
  expect(readBoundedBytes(path, REQUEST_MAX_BYTES, { observeRead: (bytes) => { total += bytes; } })).toEqual({ kind: "too-large" });
  expect(total).toBe(REQUEST_MAX_BYTES + 1);
});

test("stdin retains at most maximum plus one and settles overflow before EOF", async () => {
  const exact = new PassThrough();
  const exactReading = readByteStream(exact);
  exact.end(Buffer.alloc(REQUEST_MAX_BYTES, 0x61));
  const exactRead = await exactReading;
  expect(exactRead.length).toBe(REQUEST_MAX_BYTES);
  expect(exactRead.equals(Buffer.alloc(REQUEST_MAX_BYTES, 0x61))).toBe(true);

  const input = new PassThrough();
  const before = ["data", "end", "error"].map((event) => input.listenerCount(event));
  const reading = readByteStream(input);
  input.write(Buffer.alloc(REQUEST_MAX_BYTES));
  input.write(Buffer.from([1]));
  await expect(reading).rejects.toBeInstanceOf(RequestTooLargeError);
  expect(["data", "end", "error"].map((event) => input.listenerCount(event))).toEqual(before);
  expect(input.writableEnded).toBe(false);
  input.destroy();
});

async function donor(root: string, bytes: Buffer): Promise<{ home: string; name: string }> {
  const home = join(root, "home"), name = "2026-09-13T12-00-00-a276", directory = join(home, "runs", name);
  await Promise.all([
    mkdir(join(directory, "assembly", "flows", "main"), { recursive: true }),
    mkdir(join(home, "assemblies", "review", "flows", "main"), { recursive: true }),
  ]);
  const manifest = "---\nintelligence: default\n---\nReview.\n", flow = "---\ndescription: main\n---\n", stage = "---\n---\nWork.\n";
  await Promise.all([
    writeFile(join(directory, "assembly", "ASSEMBLY.md"), manifest),
    writeFile(join(directory, "assembly", "flows", "main", "FLOW.md"), flow),
    writeFile(join(directory, "assembly", "flows", "main", "01-work.md"), stage),
    writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), manifest),
    writeFile(join(home, "assemblies", "review", "flows", "main", "FLOW.md"), flow),
    writeFile(join(home, "assemblies", "review", "flows", "main", "01-work.md"), stage),
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(directory, "request.txt"), bytes),
  ]);
  const assemblyHash = (await prehashAssembly(join(directory, "assembly"))).sha256;
  const requestHash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(directory, "record.jsonl"), currentRecord([
    { record: 1, runtime: "0.0.1", ts: "2026-09-13T12:00:00.000Z", event: "run_start", run: name,
      assembly: "review", assembly_hash: assemblyHash, flow: "main",
      request: { path: "request.txt", sha256: requestHash, bytes: bytes.length, via: "argument" } },
    { ts: "2026-09-13T12:00:01.000Z", event: "run_end", exit: 0, cause: "success" },
  ]));
  return { home, name };
}

test("resume admits an exact-maximum donor and gives an oversized historical donor the shared refusal", async () => {
  const exactRoot = await mkdtemp(join(tmpdir(), "bot-request-resume-exact-"));
  const excessRoot = await mkdtemp(join(tmpdir(), "bot-request-resume-excess-"));
  roots.push(exactRoot, excessRoot);
  const exact = await donor(exactRoot, Buffer.alloc(REQUEST_MAX_BYTES));
  const excess = await donor(excessRoot, Buffer.alloc(REQUEST_MAX_BYTES + 1));
  const admitted = await resumeDonor(exact.home, exact.name);
  expect("code" in admitted ? admitted : admitted.request.bytes.length).toBe(REQUEST_MAX_BYTES);
  await expect(resumeDonor(excess.home, excess.name)).resolves.toEqual({
    code: "request-invalid", path: excess.name, sentence: REQUEST_TOO_LARGE_SENTENCE,
  });
  const excessRequest = await invokeCliBytes(["run", "request", excess.name, "--raw"], { home: excess.home });
  expect(excessRequest.code).toBe(0);
  expect(excessRequest.err).toEqual(Buffer.alloc(0));
  expect(excessRequest.out.length).toBe(REQUEST_MAX_BYTES + 1);
  expect(excessRequest.out.equals(Buffer.alloc(REQUEST_MAX_BYTES + 1))).toBe(true);

  const id = join(excessRoot, "resume-id"), capture = { out: [] as Buffer[], err: [] as Buffer[] };
  const boundary = boundaryFor(excessRoot, excess.home, capture);
  await expect(main(["run", "resume", excess.name, "--id-file", id], boundary)).resolves.toBe(2);
  expect(Buffer.concat(capture.err).toString()).toContain(REQUEST_TOO_LARGE_SENTENCE);
  expect(existsSync(join(excess.home, "installation.json"))).toBe(false);
  expect((await readdir(join(excess.home, "runs"))).filter((name) => !name.endsWith(".lock"))).toEqual([excess.name]);
  expect(existsSync(id)).toBe(false);
});

test.each([REQUEST_MAX_BYTES / 2, REQUEST_MAX_BYTES])("a %i-byte donor completes a resumed run", async (size) => {
  const root = await mkdtemp(join(tmpdir(), "bot-request-resume-run-"));
  roots.push(root);
  const held = await donor(root, Buffer.alloc(size, 0x72));
  const output: Buffer[] = [], errors: Buffer[] = [];
  const boundary = realBoundary(root, held.home, output, errors);
  boundary.faux.setResponses([writes("$OUTPUT", "answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "resume", held.name], boundary.held)).resolves.toBe(0);
  expect(Buffer.concat(output).toString()).toBe("answer");
  expect(Buffer.concat(errors)).toEqual(Buffer.alloc(0));
  expect((await readdir(join(held.home, "runs"))).filter((name) => !name.endsWith(".lock"))).toHaveLength(2);
});

test("oversized fresh sources refuse before identity, run, record, or id-file publication", async () => {
  for (const source of ["argument", "task", "stdin"] as const) {
    const root = await mkdtemp(join(tmpdir(), `bot-request-prebirth-${source}-`));
    roots.push(root);
    const home = join(root, "home"), assembly = join(home, "assemblies", "review", "flows", "main"), id = join(root, "run-id");
    await mkdir(assembly, { recursive: true });
    await Promise.all([
      writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
      writeFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
      writeFile(join(assembly, "FLOW.md"), "---\ndescription: main\n---\n"),
      writeFile(join(assembly, "01-work.md"), "---\n---\nWork.\n"),
    ]);
    const out: Buffer[] = [], err: Buffer[] = [], boundary = boundaryFor(root, home, { out, err });
    let args = ["run", "start", "review/main", "x".repeat(REQUEST_MAX_BYTES + 1), "--id-file", id];
    if (source === "task") { await writeFile(join(root, "task.md"), Buffer.alloc(REQUEST_MAX_BYTES + 1)); args = ["run", "start", "review/main", "@task.md", "--id-file", id]; }
    if (source === "stdin") { boundary.stdinIsTTY = false; boundary.readStdin = () => Promise.reject(new RequestTooLargeError()); args = ["run", "start", "review/main", "--id-file", id]; }
    await expect(main(args, boundary)).resolves.toBe(2);
    expect([existsSync(join(home, "installation.json")), existsSync(join(home, "runs")), existsSync(id)]).toEqual([false, false, false]);
  }
});

test.each(["argument", "task"] as const)("an oversized %s refuses without reading invalid home configuration", async (source) => {
  const root = await mkdtemp(join(tmpdir(), `bot-request-home-trap-${source}-`));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(join(home, "config.yaml"), { recursive: true });
  let args = ["run", "start", "review/main", "x".repeat(REQUEST_MAX_BYTES + 1)];
  if (source === "task") {
    await writeFile(join(root, "task.md"), Buffer.alloc(REQUEST_MAX_BYTES + 1));
    args = ["run", "start", "review/main", "@task.md"];
  }
  const capture = { out: [] as Buffer[], err: [] as Buffer[] };
  await expect(main(args, boundaryFor(root, home, capture))).resolves.toBe(2);
  expect(Buffer.concat(capture.err).toString()).toBe(`request-invalid  ${source === "task" ? "task.md" : "review/main"}\n  ${REQUEST_TOO_LARGE_SENTENCE}\n`);
});
