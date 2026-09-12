import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { errorCode } from "./model.ts";
import { processGroupExists } from "./process.ts";
import { heldRunFile } from "./run-files.ts";

type GroupEvidence = "none" | "live" | "invalid";

const evidenceName = /^group-[\da-f-]{36}$/u;

export async function groupEvidence(directory: string): Promise<GroupEvidence> {
  const evidence = join(directory, "process-groups");
  const held = await lstat(evidence).then(
    (entry) => entry,
    (reason: unknown) => errorCode(reason) === "ENOENT" ? undefined : Promise.reject(reason instanceof Error ? reason : new Error("Process-group evidence could not be read.", { cause: reason })),
  );
  if (held === undefined) return "none";
  if (!held.isDirectory() || held.isSymbolicLink()) return "invalid";
  const entries = await readdir(evidence, { withFileTypes: true });
  if (!entries.every((entry) => entry.isFile() && evidenceName.test(entry.name))) return "invalid";
  for (const entry of entries) {
    const file = await heldRunFile(directory, `process-groups/${entry.name}`);
    if (file.kind !== "held") return "invalid";
    const source = file.bytes.toString("utf8");
    if (!/^[1-9]\d*\n$/u.test(source)) return "invalid";
    const pid = Number(source.slice(0, -1));
    if (!Number.isSafeInteger(pid)) return "invalid";
    if (processGroupExists(pid)) return "live";
  }
  return "none";
}
