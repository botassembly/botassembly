// Runtime facts attached to every run_start. This is resolved at bot's package
// boundary, never from an invocation's cwd or its assembly.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { RuntimeProvenance } from "./record-events.ts";
import { hashBytes } from "./record.ts";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const executeFile = promisify(execFile);

export type RuntimeProvenanceResolution =
  | { status: "resolved"; provenance: RuntimeProvenance }
  | { status: "failed"; reason: string };
export type RuntimeSourceIdentity = Pick<RuntimeProvenance, "runtimeSource" | "runtimeDigest" | "runtimeTreeSha256">;
export type RuntimeSourceIdentityResolution =
  | { status: "resolved"; identity: RuntimeSourceIdentity }
  | { status: "failed"; reason: string };

function adapterName(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null || !("name" in manifest) || !("version" in manifest)) throw new Error("The resolved provider adapter manifest is invalid.");
  const { name, version } = manifest;
  if (typeof name !== "string" || typeof version !== "string") throw new Error("The resolved provider adapter manifest is invalid.");
  return `${name}@${version}`;
}

// The resolved entry is the adapter the runtime imports. Its package manifest
// sits above its dist entry, rather than beside this package or the caller.
function providerAdapter(): Promise<string | undefined> {
  return Promise.resolve()
    .then(() => {
      const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-ai"));
      return readFile(join(dirname(dirname(entry)), "package.json"), "utf8");
    })
    .then((manifest) => adapterName(JSON.parse(manifest)))
    .then((identity) => identity, () => undefined);
}

// Git is the one provenance source that can honestly be unknown: either this
// package is not a checkout or Git itself is unavailable.
function checkoutProvenance(): Promise<Pick<RuntimeProvenance, "runtimeSource" | "runtimeDigest">> {
  return executeFile("git", ["rev-parse", "HEAD"], { cwd: packageDirectory, encoding: "utf8" }).then(
    ({ stdout }) => ({ runtimeSource: "checkout", runtimeDigest: stdout.trim() }),
    () => ({ runtimeSource: "unknown", runtimeDigest: null }),
  );
}

async function sourcePaths(root: string): Promise<string[]> {
  const paths = ["package.json"];
  const visit = async (directory: string, relative: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) paths.push(`src/${path}`);
    }
  };
  await visit(join(root, "src"), "");
  return paths.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

export async function runtimeTreeIdentity(root: string): Promise<string> {
  const paths = await sourcePaths(root);
  const hash = createHash("sha256").update("bot-runtime-tree-v1\0");
  for (const path of paths) {
    const pathBytes = Buffer.from(path), bytes = await readFile(join(root, path)), frame = Buffer.alloc(12);
    frame.writeUInt32BE(pathBytes.length, 0);
    frame.writeBigUInt64BE(BigInt(bytes.length), 4);
    hash.update(frame).update(pathBytes).update(bytes);
  }
  return hash.digest("hex");
}

export async function resolveRuntimeSourceIdentity(sourceRoot = packageDirectory): Promise<RuntimeSourceIdentityResolution> {
  const source = await checkoutProvenance();
  const tree = await runtimeTreeIdentity(sourceRoot).then(
    (sha256) => sha256,
    (reason: unknown) => reason instanceof Error ? reason : new Error("The runtime source inventory failed with a non-Error value."),
  );
  return tree instanceof Error ? { status: "failed", reason: tree.message }
    : { status: "resolved", identity: { ...source, runtimeTreeSha256: tree } };
}

export async function resolveRuntimeProvenance(lockfile = join(packageDirectory, "package-lock.json"),
  sourceRoot = packageDirectory): Promise<RuntimeProvenanceResolution> {
  const lock = await readFile(lockfile).then((bytes) => bytes, () => undefined);
  if (lock === undefined) return { status: "failed", reason: `The runtime lockfile could not be read: ${lockfile}` };
  const provider = await providerAdapter();
  if (provider === undefined) return { status: "failed", reason: "The resolved provider adapter manifest could not be read." };
  const source = await resolveRuntimeSourceIdentity(sourceRoot);
  if (source.status === "failed") return source;
  return {
    status: "resolved",
    provenance: {
      ...source.identity,
      lockSha256: hashBytes(lock),
      node: process.version,
      providerAdapter: provider,
    },
  };
}
