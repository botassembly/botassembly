import { takeHome } from "./flags.ts";
import { newCommandFailure } from "./new-command-result.ts";
import { scratchRoot } from "./invocation.ts";
import { parseRunShow } from "./run-show-query.ts";
import { readRunShow, runShowFailure } from "./run-show.ts";

interface Boundary { cwd: string; env: NodeJS.ProcessEnv; stdout(bytes: string | Uint8Array): void; stderr(bytes: string | Uint8Array): void }

function requestFailure(message: string) { return { code: "request-invalid" as const, cause: "arguments-invalid", message, retryable: false, details: {}, exit: 2 as const }; }

export async function runShowCommand(args: string[], boundary: Boundary): Promise<number> {
  const json = args.includes("--json") || args.includes("-j");
  const homeCount = args.filter((word) => word === "--home").length;
  const held = takeHome(args, boundary.cwd, boundary.env);
  const parsed = homeCount <= 1 && held.home !== undefined ? parseRunShow(held.args) : undefined;
  if (parsed === undefined) {
    const result = newCommandFailure("run.show", requestFailure("Usage: bot run show RUN [--json|-j] [--home DIR]."), json);
    boundary.stderr(result.stderr); return result.exit;
  }
  const home = held.home;
  if (home === undefined) return 2;
  return readRunShow(home, parsed.prefix, scratchRoot(boundary.env)).then((reading) => {
    boundary.stdout(parsed.json ? reading.json : reading.human);
    return 0;
  }, (reason: unknown) => {
    const result = newCommandFailure("run.show", runShowFailure(reason), parsed.json);
    boundary.stderr(result.stderr);
    return result.exit;
  });
}
