import { Writable } from "node:stream";
import { takeHome } from "./flags.ts";
import { newCommandFailure } from "./new-command-result.ts";
import { inspectRawShow } from "./raw-record.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  rawStdout?(): Writable;
  stderr(bytes: string | Uint8Array): void;
}

function malformed(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function homeFault(args: readonly string[]): CliFailure | undefined {
  const homes = args.filter((word) => word === "--home");
  if (homes.length > 1) return malformed("option-repeated", "Run record accepts --home once.");
  const homeAt = args.indexOf("--home");
  const home = homeAt < 0 ? undefined : args[homeAt + 1];
  if (homeAt >= 0 && (home === undefined || home.startsWith("-"))) {
    return malformed("value-missing", "Run record requires a value after --home.");
  }
  return undefined;
}

function requestFault(args: readonly string[]): CliFailure | undefined {
  const invalidHome = homeFault(args);
  if (invalidHome !== undefined) return invalidHome;
  const rawCount = args.filter((word) => word === "--raw").length;
  if (rawCount !== 1) return malformed(rawCount === 0 ? "mode-missing" : "option-repeated", "Run record requires exactly one --raw flag.");
  const homeAt = args.indexOf("--home");
  const remaining = args.filter((_, at) => homeAt < 0 || (at !== homeAt && at !== homeAt + 1))
    .filter((word) => word !== "--raw");
  if (remaining.length !== 1 || remaining[0]?.startsWith("-") !== false) {
    return malformed("argument-invalid", "Run record requires exactly one run and accepts only --raw and --home DIR.");
  }
  return undefined;
}

export async function runRecordCommand(args: string[], boundary: Boundary): Promise<number> {
  const fault = requestFault(args);
  if (fault !== undefined) {
    const result = newCommandFailure("run.record", fault, false);
    boundary.stderr(result.stderr);
    return result.exit;
  }
  const held = takeHome(args, boundary.cwd, boundary.env);
  const run = held.args.find((word) => word !== "--raw") ?? "";
  const home = held.home;
  if (home === undefined) return 2;
  return inspectRawShow(home, run, undefined, () => boundary.rawStdout?.() ?? new Writable({
    write: (bytes: Buffer, _encoding, done) => { boundary.stdout(bytes); done(); },
  }), (bytes) => { boundary.stderr(bytes); });
}
