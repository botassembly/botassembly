import { Writable } from "node:stream";
import { runtimeBoundary, settleCommand } from "./cli-boundary.ts";
import { main } from "./cli.ts";
import type { CommandResult } from "./new-command-result.ts";
import { processClock } from "./process-clock.ts";

function held(bytes: string | Uint8Array): Buffer { return typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes); }

export async function mutationReading(
  args: string[], cwd: string, suppliedEnv: NodeJS.ProcessEnv,
  interaction: { readLine?: (hidden: boolean) => Promise<string>; signal?: AbortSignal } = {},
): Promise<CommandResult<number>> {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const boundary = runtimeBoundary({
    cwd, env: { ...suppliedEnv }, clock: processClock(), stdinIsTTY: interaction.readLine !== undefined, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(held(bytes)); },
    rawStdout: () => new Writable({ write: (bytes: Buffer, _encoding, done) => { stdout.push(Buffer.from(bytes)); done(); } }),
    stderr: (bytes) => { stderr.push(held(bytes)); },
    ...(interaction.readLine === undefined ? {} : { readLine: interaction.readLine }),
    ...(interaction.signal === undefined ? {} : { signal: interaction.signal }),
  });
  const exit = await settleCommand(main(args, boundary), (bytes) => { boundary.stderr(bytes); });
  return { exit, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}
