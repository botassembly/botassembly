import { basename } from "node:path";
import { Writable } from "node:stream";
import { takeHome } from "./flags.ts";
import { writeInspection } from "./inspection-result.ts";
import { boundedText, newCommandFailure } from "./new-command-result.ts";
import { errorCode } from "./model.ts";
import { selectOutput, selectRequest } from "./one-run.ts";
import type { CliFailure } from "./run-list-query.ts";
import { copyVerifiedOutput, type VerifiedOutputDependencies } from "./verified-output.ts";

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

function homeFault(args: readonly string[], subject: string): CliFailure | undefined {
  const homes = args.filter((word) => word === "--home");
  if (homes.length > 1) return malformed("option-repeated", `${subject} accepts --home once.`);
  const homeAt = args.indexOf("--home");
  const home = homeAt < 0 ? undefined : args[homeAt + 1];
  if (homeAt >= 0 && (home === undefined || home.startsWith("-"))) {
    return malformed("value-missing", `${subject} requires a value after --home.`);
  }
  return undefined;
}

function requestFault(args: readonly string[], subject: string, maximum: number): CliFailure | undefined {
  const invalidHome = homeFault(args, subject);
  if (invalidHome !== undefined) return invalidHome;
  const homeAt = args.indexOf("--home");
  const rawCount = args.filter((word) => word === "--raw").length;
  if (rawCount !== 1) return malformed(rawCount === 0 ? "mode-missing" : "option-repeated", `${subject} requires exactly one --raw flag.`);
  const unknown = args.find((word, at) => word.startsWith("-") && word !== "--raw" && at !== homeAt);
  if (unknown !== undefined) return malformed("option-unknown", `${subject} does not accept ${unknown}.`);
  const positional = args.filter((_, at) => homeAt < 0 || (at !== homeAt && at !== homeAt + 1))
    .filter((word) => word !== "--raw");
  if (positional.length < 1 || positional.length > maximum) {
    return malformed("argument-invalid", maximum === 1
      ? `${subject} requires exactly one run.` : `${subject} requires one run and accepts at most one stage.`);
  }
  return undefined;
}

function failed(boundary: Boundary, message: string): number {
  boundary.stderr(`${boundedText(message)}\n`);
  return 1;
}

async function copySelected(
  selected: Awaited<ReturnType<typeof selectOutput | typeof selectRequest>>, boundary: Boundary,
  dependencies: VerifiedOutputDependencies, noun: "output" | "request",
): Promise<number> {
  if ("failed" in selected) return writeInspection(boundary, selected.failed);
  const copied = await copyVerifiedOutput(selected, () => boundary.rawStdout?.() ?? new Writable({
    write: (bytes: Buffer, _encoding, done) => { boundary.stdout(bytes); done(); },
  }), dependencies);
  if (copied.kind === "copied") return 0;
  if (copied.kind === "mismatch") {
    return failed(boundary, `The ${noun === "output" ? "sealed output" : "retained request"} of ${basename(selected.directory)} does not match its record.`);
  }
  const cause = copied.error === undefined ? "unknown cause" : errorCode(copied.error) ?? "operation failed";
  return failed(boundary, `Run ${noun} failed during ${copied.phase}: ${cause}.`);
}

export async function runOutputCommand(
  args: string[], boundary: Boundary,
  dependencies: VerifiedOutputDependencies = {},
): Promise<number> {
  const fault = requestFault(args, "Run output", 2);
  if (fault !== undefined) {
    const result = newCommandFailure("run.output", fault, false);
    boundary.stderr(result.stderr);
    return result.exit;
  }
  const held = takeHome(args.filter((word) => word !== "--raw"), boundary.cwd, boundary.env);
  if (held.home === undefined) return 2;
  return copySelected(await selectOutput(held.home, held.args[0] ?? "", held.args[1]), boundary, dependencies, "output");
}

export async function runRequestCommand(
  args: string[], boundary: Boundary, dependencies: VerifiedOutputDependencies = {},
): Promise<number> {
  const fault = requestFault(args, "Run request", 1);
  if (fault !== undefined) {
    const result = newCommandFailure("run.request", fault, false);
    boundary.stderr(result.stderr); return result.exit;
  }
  const held = takeHome(args.filter((word) => word !== "--raw"), boundary.cwd, boundary.env);
  if (held.home === undefined) return 2;
  return copySelected(await selectRequest(held.home, held.args[0] ?? ""), boundary, dependencies, "request");
}
