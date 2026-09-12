import { resolve } from "node:path";
import { isBusy } from "./busy.ts";
import { jsonObject } from "./check.ts";
import { takeHome } from "./flags.ts";
import { newCommandFailure, type CommandResult } from "./new-command-result.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

interface Request { directory?: string; home?: string; json: boolean; quiet: boolean; failure?: CliFailure }

function invalid(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function repeatedOrConflicting(args: readonly string[], jsonCount: number, quietCount: number): CliFailure | undefined {
  if (jsonCount > 1) return invalid("option-repeated", "Home busy accepts one JSON mode flag.");
  if (quietCount > 1) return invalid("option-repeated", "Home busy accepts --quiet once.");
  if (args.filter((word) => word === "--home").length > 1) return invalid("option-repeated", "Home busy accepts --home once.");
  if (jsonCount > 0 && quietCount > 0) return invalid("option-conflict", "Home busy does not combine --quiet with JSON mode.");
  return undefined;
}

function parse(args: readonly string[], boundary: Pick<Boundary, "cwd" | "env">): Request {
  const jsonCount = args.filter((word) => word === "--json" || word === "-j").length;
  const quietCount = args.filter((word) => word === "--quiet").length;
  const json = jsonCount > 0, quiet = quietCount > 0;
  const optionFault = repeatedOrConflicting(args, jsonCount, quietCount);
  if (optionFault !== undefined) return { json, quiet, failure: optionFault };

  const homeAt = args.indexOf("--home");
  const rawHome = homeAt < 0 ? undefined : args[homeAt + 1];
  if (homeAt >= 0 && (rawHome === undefined || rawHome.startsWith("-"))) {
    return { json, quiet, failure: invalid("value-missing", "Home busy requires a value after --home.") };
  }
  const remaining = args.filter((_word, index) => index !== homeAt && (homeAt < 0 || index !== homeAt + 1))
    .filter((word) => word !== "--json" && word !== "-j" && word !== "--quiet");
  const unknown = remaining.find((word) => word.startsWith("-"));
  if (unknown !== undefined) return { json, quiet, failure: invalid("option-unknown", `Home busy does not accept ${unknown}.`) };
  const directory = remaining[0];
  if (remaining.length !== 1 || directory === undefined) return { json, quiet, failure: invalid("argument-invalid", "Home busy requires exactly one directory.") };
  const held = takeHome([...args], boundary.cwd, boundary.env);
  if (held.home === undefined) return { json, quiet, failure: invalid("value-missing", "Home busy requires a value after --home.") };
  return { directory, home: held.home, json, quiet };
}

function render(busy: boolean, json: boolean): CommandResult<0> {
  const output = json
    ? `${jsonObject({ schemaVersion: 1, kind: "bot.home.busy", data: { busy } })}\n`
    : `Busy: ${busy ? "yes" : "no"}\n`;
  return { exit: 0, stdout: Buffer.from(output), stderr: Buffer.alloc(0) };
}

export async function homeBusyCommand(args: string[], boundary: Boundary): Promise<number> {
  const request = parse(args, boundary);
  if (request.failure !== undefined || request.directory === undefined || request.home === undefined) {
    const result = newCommandFailure("home.busy", request.failure
      ?? invalid("argument-invalid", "Home busy requires exactly one directory."), request.json);
    boundary.stderr(result.stderr);
    return result.exit;
  }
  const busy = await isBusy(request.home, resolve(boundary.cwd, request.directory));
  if (request.quiet) return busy ? 0 : 1;
  const result = render(busy, request.json);
  boundary.stdout(result.stdout);
  return result.exit;
}
