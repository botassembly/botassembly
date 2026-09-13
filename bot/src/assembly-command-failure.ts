import { RemovalStateError } from "./management.ts";
import type { CliFailure } from "./run-list-query.ts";

/** Persistent removal corruption means the same thing to every assembly mutation command. */
export function assemblyDependencyFailure(reason: unknown, cause: string, fallback: string): CliFailure {
  if (reason instanceof RemovalStateError) return { code: "integrity-failed", cause: "removal-state-invalid",
    message: reason.message, retryable: false, details: {}, exit: 5 };
  return { code: "dependency-failed", cause,
    message: reason instanceof Error ? reason.message : fallback, retryable: true, details: {}, exit: 4 };
}
