import { takeHome } from "./flags.ts";
import { inspectRunList, runListFailure, type RunListResult } from "./run-list.ts";
import { parseRunList, type CliFailure } from "./run-list-query.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  clock: { timestamp(): string };
}

function write(boundary: Boundary, result: RunListResult): number {
  if (result.stdout.length > 0) boundary.stdout(result.stdout);
  if (result.stderr.length > 0) boundary.stderr(result.stderr);
  return result.exit;
}

function homeFault(args: readonly string[], home: string | undefined): CliFailure | undefined {
  if (args.filter((word) => word === "--home").length > 1) {
    return { code: "request-invalid", cause: "option-repeated", message: "Run list accepts --home once.", retryable: false, details: { option: "--home" }, exit: 2 };
  }
  if (home === undefined) {
    return { code: "request-invalid", cause: "value-missing", message: "Run list requires a value after --home.", retryable: false, details: { option: "--home" }, exit: 2 };
  }
  return undefined;
}

export async function runListCommand(args: string[], boundary: Boundary): Promise<number> {
  const json = args.includes("--json") || args.includes("-j");
  const held = takeHome(args, boundary.cwd, boundary.env);
  const fault = homeFault(args, held.home);
  if (fault !== undefined) return write(boundary, runListFailure(fault, json));
  const home = held.home;
  if (home === undefined) return 2;
  const parsed = parseRunList(held.args);
  if ("failure" in parsed) return write(boundary, runListFailure(parsed.failure, json));
  return write(boundary, await inspectRunList(home, parsed.query, boundary.clock.timestamp()));
}
