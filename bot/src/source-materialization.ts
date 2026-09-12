import { createWriteStream } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FlowSource } from "./execution.ts";
import { OWNER_ONLY } from "./model.ts";

async function materializeSource(inputPath: string, source: FlowSource): Promise<void> {
  const name = `${source.name}.${source.extension}`;
  const destination = join(inputPath, name);
  if (source.held === undefined) {
    await copyFile(source.diskPath, destination);
    return;
  }
  const copied = await source.held.copy(() => createWriteStream(destination, { flags: "wx", mode: OWNER_ONLY }));
  if (copied.kind === "copied" && copied.sha256 === source.record.sha256) return;
  await rm(destination, { force: true });
  if (copied.kind === "copied") throw new Error(`Input ${name} did not match its recorded SHA-256.`);
  throw new Error(`Input ${name} could not be copied from its held source (${copied.kind}).`);
}

export async function materializeSources(
  _runDirectory: string, inputPath: string, sources: readonly FlowSource[],
): Promise<void> {
  const settled = await Promise.allSettled(sources.map((source) => materializeSource(inputPath, source)));
  const failed = settled.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

export async function closeHeldSources(sources: readonly FlowSource[]): Promise<void> {
  await Promise.all(sources.flatMap((source) => source.held === undefined ? [] : [source.held.close()]));
}
