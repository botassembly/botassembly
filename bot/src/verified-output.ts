import type { Writable } from "node:stream";
import { holdRunFile, type HeldRunSource } from "./run-files.ts";

export interface VerifiedSelection { directory: string; path: string; sha256: string; bytes?: number }

export type VerifiedOutputResult =
  | { kind: "copied" }
  | { kind: "mismatch" }
  | { kind: "fault"; phase: "acquisition" | "delivery" | "cleanup"; error?: unknown };

type HoldSource = (
  directory: string, path: string, afterFirstChunk?: () => Promise<void>,
) => ReturnType<typeof holdRunFile>;

export interface VerifiedOutputDependencies {
  afterFirstChunk?(): Promise<void>;
  afterVerified?(source: HeldRunSource): Promise<void>;
  holdSource?: HoldSource;
}

function delivered(copied: Awaited<ReturnType<HeldRunSource["copy"]>>, expected: string): VerifiedOutputResult {
  if (copied.kind === "interrupted") {
    return {
      kind: "fault", phase: copied.phase === "close" ? "cleanup" : "delivery",
      ...(copied.error === undefined ? {} : { error: copied.error }),
    };
  }
  if (copied.kind !== "copied") return { kind: "fault", phase: "delivery" };
  return copied.sha256 === undefined || copied.sha256 === expected ? { kind: "copied" } : { kind: "mismatch" };
}

async function closed(
  source: HeldRunSource, result: VerifiedOutputResult,
): Promise<VerifiedOutputResult> {
  return source.close().then(
    () => result,
    (error: unknown) => ({ kind: "fault", phase: "cleanup", error }),
  );
}

/** Verify and deliver one fixed extent through the same safely held source descriptor. */
export async function copyVerifiedOutput(
  selected: VerifiedSelection, destination: () => Writable, dependencies: VerifiedOutputDependencies = {},
): Promise<VerifiedOutputResult> {
  const source = await (dependencies.holdSource ?? holdRunFile)(
    selected.directory, selected.path, dependencies.afterFirstChunk === undefined
      ? undefined : () => dependencies.afterFirstChunk?.() ?? Promise.resolve(),
  );
  if (!("copy" in source)) return { kind: "fault", phase: "acquisition" };
  if (selected.bytes !== undefined && source.size !== selected.bytes) return closed(source, { kind: "mismatch" });
  if (source.sha256 !== selected.sha256) return closed(source, { kind: "mismatch" });
  const prepared = await Promise.resolve().then(() => dependencies.afterVerified?.(source)).then(
    () => undefined,
    (error: unknown) => error,
  );
  if (prepared !== undefined) return closed(source, { kind: "fault", phase: "acquisition", error: prepared });
  return delivered(await source.copy(destination), selected.sha256);
}
