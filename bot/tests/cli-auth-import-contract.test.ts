import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { plainly } from "../src/model.ts";
import { inertText } from "../src/new-command-result.ts";

interface Invocation { code: number; out: string; err: string }
interface Place { root: string; sourceDir: string; source: string; agentDir: string; destination: string }

const roots: string[] = [];
const SECRET = "import-secret-must-never-print";
const LIMIT = 1_048_576;

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function place(bytes = Buffer.from(`{"one":{"type":"api_key","key":"${SECRET}"}}`),
  destination?: string): Promise<Place> {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-import-contract-")); roots.push(root);
  const sourceDir = join(root, "retired"), source = join(sourceDir, "credentials.json"), agentDir = join(root, "pi-agent");
  await mkdir(sourceDir, { mode: 0o700 }); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(source, bytes, { mode: 0o600 });
  const destinationPath = join(agentDir, "auth.json");
  if (destination !== undefined) await writeFile(destinationPath, destination, { mode: 0o600 });
  return { root, sourceDir, source, agentDir, destination: destinationPath };
}

async function invoke(argv: string[], where: Place, cwd = where.root): Promise<Invocation> {
  const out: Buffer[] = [], err: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd, env: {}, stdinIsTTY: true, stderrIsTTY: false, authPath: where.destination,
    retiredCredentialPath: where.source,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { out.push(Buffer.from(bytes)); },
    stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-11T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
  };
  const code = await main(argv, boundary);
  return { code, out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString() };
}

function success(imported: boolean, providerCount: number): string {
  return `${JSON.stringify({ schemaVersion: 1, kind: "bot.auth.import", data: { imported, providerCount } })}\n`;
}

function error(cause: string, code: string, message: string, retryable: boolean,
  details: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ schemaVersion: 1, kind: "error", error: {
    code, operation: "auth.import", cause, message, retryable, details,
  } })}\n`;
}

test("auth import publishes one exact closed descriptor", () => {
  expect(CLI_CONTRACTS.find((held) => held.operation === ("auth.import" as never))).toEqual({
    operation: "auth.import", command: ["auth", "import"], output: { kind: "bot.auth.import", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "never", mutates: true, network: "never",
    options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
    limits: { humanErrorBytes: 2_048, sourceArgumentBytes: 4_096, credentialFileBytesInclusive: LIMIT,
      resultBytes: 8_192, destinationLockMilliseconds: 30_000, sourceLockMilliseconds: 1_000 },
  });
});

test.each([
  { tail: [], json: false, cause: "value-missing", message: "Credential import requires one source file." },
  { tail: ["--json"], json: true, cause: "value-missing", message: "Credential import requires one source file." },
  { tail: ["one", "two"], json: false, cause: "argument-extra", message: "Credential import accepts one source file." },
  { tail: ["one", "two", "-j"], json: true, cause: "argument-extra", message: "Credential import accepts one source file." },
  { tail: ["one", "--json", "-j"], json: true, cause: "option-repeated", message: "Credential import accepts one JSON mode flag." },
  { tail: ["one", "--json", "--json"], json: true, cause: "option-repeated", message: "Credential import accepts one JSON mode flag." },
  { tail: ["one", "--home"], json: false, cause: "option-unknown", message: "Credential import does not accept that option." },
  { tail: ["one", "--home", "--json"], json: true, cause: "option-unknown", message: "Credential import does not accept that option." },
  { tail: ["--", "one"], json: false, cause: "option-unknown", message: "Credential import does not accept that option." },
  { tail: ["-source"], json: false, cause: "option-unknown", message: "Credential import does not accept that option." },
  { tail: ["x".repeat(4_097)], json: false, cause: "value-oversized", message: "The credential import source path exceeds 4096 bytes." },
  { tail: ["x".repeat(4_097), "-j"], json: true, cause: "value-oversized", message: "The credential import source path exceeds 4096 bytes." },
])("grammar emits exact $cause in the requested mode without filesystem access", async ({ tail, json, cause, message }) => {
  const where = await place(), before = await readFile(where.source);
  const result = await invoke(["auth", "import", ...tail], where);
  expect(result).toEqual({ code: 2, out: "", err: json ? error(cause, "request-invalid", message, false) : `${message}\n` });
  expect(await readFile(where.source)).toEqual(before);
  await expect(lstat(where.destination)).rejects.toMatchObject({ code: "ENOENT" });
});

test("relative and absolute source paths resolve exactly and no generic retired warning appears", async () => {
  const where = await place(), missing = join(where.sourceDir, "missing.json");
  for (const [argument, cwd] of [["retired/missing.json", where.root], [missing, "/"]] as const) {
    const result = await invoke(["auth", "import", argument, "--json"], where, cwd);
    expect(result).toEqual({ code: 2, out: "", err: error("source-missing", "request-invalid",
      "The credential import source does not exist.", false, { path: missing }) });
    expect(result.err).not.toContain("retired Bot credential store");
  }
});

test("a compatible map publishes exact source bytes and counts effective names", async () => {
  const bytes = Buffer.from(`\uFEFF{\n "one":{"type":"api_key","key":"${SECRET}","extra":true},\n "one":{"type":"api_key","env":{"A":"B"}},\n "two":{"type":"oauth","refresh":"${SECRET}","access":"${SECRET}","expires":4102444800000,"scope":"all"}\n}`);
  const where = await place(bytes), sourceBefore = await readFile(where.source), sourceStat = await lstat(where.source);
  const result = await invoke(["auth", "import", where.source, "--json"], where);
  expect(result).toEqual({ code: 0, out: success(true, 2), err: "" });
  expect(await readFile(where.destination)).toEqual(bytes);
  expect(await readFile(where.source)).toEqual(sourceBefore);
  expect(await lstat(where.source)).toMatchObject({ dev: sourceStat.dev, ino: sourceStat.ino, uid: sourceStat.uid,
    gid: sourceStat.gid, mode: sourceStat.mode, nlink: sourceStat.nlink, size: sourceStat.size });
  expect(result.out + result.err).not.toContain(SECRET);
});

test("the inclusive file bound preserves one complete 1,048,576-byte source", async () => {
  const prefix = Buffer.from('{"one":{"type":"api_key"}}'), bytes = Buffer.concat([prefix, Buffer.alloc(LIMIT - prefix.length, 0x20)]);
  const where = await place(bytes);
  const result = await invoke(["auth", "import", where.source, "--json"], where);
  expect(result).toEqual({ code: 0, out: success(true, 1), err: "" });
  expect(await readFile(where.destination)).toEqual(bytes);
}, 15_000);

test("human success is exact and bounded", async () => {
  const where = await place(Buffer.from('{"one":{"type":"api_key"},"two":{"type":"api_key","env":{"A":"B"}}}'));
  expect(await invoke(["auth", "import", where.source], where)).toEqual({
    code: 0, out: "Imported 2 provider credentials into Pi authentication.\n", err: "",
  });
});

test("empty source leaves missing and byte-exact empty destinations unchanged", async () => {
  for (const destination of [undefined, " \n{ }\n"] as const) {
    const where = await place(Buffer.from("\uFEFF { }"), destination), before = destination === undefined ? undefined : await readFile(where.destination);
    const result = await invoke(["auth", "import", where.source, "--json"], where);
    expect(result).toEqual({ code: 1, out: success(false, 0), err: "" });
    if (before === undefined) await expect(lstat(where.destination)).rejects.toMatchObject({ code: "ENOENT" });
    else expect(await readFile(where.destination)).toEqual(before);
  }
  const human = await place(Buffer.from("{}"));
  expect(await invoke(["auth", "import", human.source], human)).toEqual({
    code: 1, out: "No provider credentials were present to import.\n", err: "",
  });
});

test("nonempty destination and repeated import refuse without overwrite", async () => {
  const existing = `{"kept":{"type":"api_key","key":"${SECRET}"}}`, where = await place(undefined, existing);
  const refused = await invoke(["auth", "import", where.source, "--json"], where);
  expect(refused).toEqual({ code: 2, out: "", err: error("destination-not-empty", "request-invalid",
    "Pi authentication already contains credentials; nothing was imported.", false, { path: where.destination }) });
  expect(await readFile(where.destination, "utf8")).toBe(existing);

  const first = await place();
  expect((await invoke(["auth", "import", first.source, "--json"], first)).code).toBe(0);
  const published = await readFile(first.destination);
  const second = await invoke(["auth", "import", first.source, "--json"], first);
  expect(second).toEqual({ code: 2, out: "", err: error("destination-not-empty", "request-invalid",
    "Pi authentication already contains credentials; nothing was imported.", false, { path: first.destination }) });
  expect(await readFile(first.destination)).toEqual(published);
});

test.each([
  "null", "[]", "1", "{\"p\":null}", "{\"p\":{}}", "{\"p\":{\"type\":\"other\"}}",
  "{\"p\":{\"type\":\"api_key\",\"key\":1}}", "{\"p\":{\"type\":\"api_key\",\"env\":[]}}",
  "{\"p\":{\"type\":\"api_key\",\"env\":{\"A\":1}}}",
  "{\"p\":{\"type\":\"oauth\",\"refresh\":1,\"access\":\"a\",\"expires\":1}}",
  "{\"p\":{\"type\":\"oauth\",\"refresh\":\"r\",\"access\":1,\"expires\":1}}",
  "{\"p\":{\"type\":\"oauth\",\"refresh\":\"r\",\"access\":\"a\",\"expires\":null}}",
  "{not-json",
])("incompatible source schema refuses without publishing: %s", async (source) => {
  const where = await place(Buffer.from(source)), before = await readFile(where.source);
  const result = await invoke(["auth", "import", where.source, "--json"], where);
  expect(result).toEqual({ code: 5, out: "", err: error("source-invalid", "integrity-failed",
    "The credential import source is not a safe compatible credential file.", false, { path: where.source }) });
  expect(await readFile(where.source)).toEqual(before);
  await expect(lstat(where.destination)).rejects.toMatchObject({ code: "ENOENT" });
});

test("unsafe source leaves and parents have exact source-invalid failures", async () => {
  const cases: Array<(where: Place) => Promise<void>> = [
    async (where) => { await chmod(where.source, 0o644); },
    async (where) => { const target = `${where.source}.target`; await writeFile(target, "{}", { mode: 0o600 });
      await rm(where.source); await symlink(target, where.source); },
    async (where) => { await link(where.source, `${where.source}.hard-link`); },
    async (where) => { await chmod(where.sourceDir, 0o755); },
    async (where) => { await writeFile(where.source, Buffer.alloc(LIMIT + 1), { mode: 0o600 }); },
  ];
  for (const arrange of cases) {
    const where = await place(); await arrange(where);
    const result = await invoke(["auth", "import", where.source, "--json"], where);
    expect(result).toEqual({ code: 5, out: "", err: error("source-invalid", "integrity-failed",
      "The credential import source is not a safe compatible credential file.", false, { path: where.source }) });
    await expect(lstat(where.destination)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

test("unsafe destination leaves and agent directories never overwrite", async () => {
  const cases: Array<(where: Place) => Promise<void>> = [
    async (where) => { await writeFile(where.destination, "{}", { mode: 0o600 }); await chmod(where.destination, 0o644); },
    async (where) => { const target = `${where.destination}.target`; await writeFile(target, "{}", { mode: 0o600 });
      await symlink(target, where.destination); },
    async (where) => { await writeFile(where.destination, "{}", { mode: 0o600 }); await link(where.destination, `${where.destination}.hard-link`); },
    async (where) => { await chmod(where.agentDir, 0o755); },
    async (where) => { await writeFile(where.destination, Buffer.alloc(LIMIT + 1), { mode: 0o600 }); },
  ];
  for (const arrange of cases) {
    const where = await place(); await arrange(where);
    const result = await invoke(["auth", "import", where.source, "--json"], where);
    expect(result).toEqual({ code: 5, out: "", err: error("destination-invalid", "integrity-failed",
      "The Pi authentication destination is not safe and empty.", false, { path: where.destination }) });
  }
});

test("lexical and inode-identical sources refuse before copying", async () => {
  const lexical = await place();
  const samePath = await invoke(["auth", "import", lexical.destination, "--json"], lexical);
  expect(samePath).toEqual({ code: 2, out: "", err: error("source-is-destination", "request-invalid",
    "The credential import source and destination are the same file.", false, { path: lexical.destination }) });

  const alias = await place(); await link(alias.source, alias.destination);
  const sameInode = await invoke(["auth", "import", alias.source, "--json"], alias);
  expect(sameInode).toEqual({ code: 2, out: "", err: error("source-is-destination", "request-invalid",
    "The credential import source and destination are the same file.", false, { path: alias.source }) });
});

test("human failures use one exact inert UTF-8-safe bounded line", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-import-hostile-")); roots.push(root);
  const hostile = join(root, `missing\u001b[31m|*_[x]\n${"p".repeat(700)}`), where = await place();
  const result = await invoke(["auth", "import", hostile], where);
  const path = Buffer.from(plainly(hostile));
  const clipped = path.subarray(0, 512).toString("utf8");
  const message = `The credential import source does not exist. Path: ${clipped}.`;
  expect(result).toEqual({ code: 2, out: "", err: `${inertText(message, 2_047).text}\n` });
  expect(Buffer.byteLength(result.err)).toBeLessThanOrEqual(2_048);
  expect(result.err).not.toContain("\u001b");
});
