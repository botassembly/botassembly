import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FlowSource } from "./execution.ts";
import { OWNER_ONLY } from "./model.ts";
import type { DriverClock } from "./process.ts";
import { stageCarriedEvent, type StageIdentity } from "./record-events.ts";
import { hashBytes, type RecordWriter } from "./record.ts";
import type { Continuation } from "./continuation.ts";

export async function materializeContinuation(
  created: RecordWriter, continuation: Continuation, clock: DriverClock, durable: StageIdentity[],
  copying?: (identity: StageIdentity) => Promise<void>,
): Promise<Continuation> {
  const sources = new Map<string, FlowSource>();
  for (const held of continuation.carried) {
    await copying?.(held.identity);
    if (held.output !== undefined) {
      const destination = join(created.runDirectory, ...held.output.path.split("/"));
      if (held.outputBytes === undefined || hashBytes(held.outputBytes) !== held.output.sha256) throw new Error(`Continuation output was not retained after validation: ${held.output.path}`);
      await mkdir(dirname(destination), { recursive: true, mode: OWNER_ONLY });
      await writeFile(destination, held.outputBytes, { mode: OWNER_ONLY });
      for (const source of continuation.sources) if (source.record.path === held.output.path) sources.set(held.output.path, { ...source, diskPath: destination });
    }
    await created.append(stageCarriedEvent({ ts: clock.timestamp(), identity: held.identity, from: continuation.from, ...(held.output === undefined ? {} : { output: held.output }) }));
    durable.push(held.identity);
  }
  if (continuation.failure !== undefined) {
    const path = `resume/${continuation.failure.name}.json`;
    const diskPath = join(created.runDirectory, ...path.split("/"));
    await mkdir(dirname(diskPath), { recursive: true, mode: OWNER_ONLY });
    await writeFile(diskPath, continuation.failure.bytes, { mode: OWNER_ONLY });
    sources.set(path, {
      name: continuation.failure.name, extension: "json", diskPath,
      record: { path, sha256: hashBytes(continuation.failure.bytes) }, role: "prior-failure",
    });
  }
  return { ...continuation, sources: [...sources.values()] };
}
