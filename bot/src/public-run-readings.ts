// The package's read-only command-reading door (ticket 0291). Every function
// here returns the exact bytes its command writes, faults included. It writes
// no second copy of a document and holds no rule of its own.
import { Writable } from "node:stream";
import { scratchRoot } from "./invocation.ts";
import { newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { inspectRawShow } from "./raw-record.ts";
import { readRunShow, runShowFailure } from "./run-show.ts";

export { inspectRunList, runListFailure, type RunListResult } from "./run-list.ts";
export { parseRunList, type CliFailure, type RunListQuery } from "./run-list-query.ts";

/** `bot run show RUN [--json]`, reproducing `run-show-command.ts`. The scratch root comes
 *  from the supplied environment, so the caller's environment decides the scratch paths. */
export function runShowReading(home: string, run: string, json: boolean, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return readRunShow(home, run, scratchRoot(env)).then(
    (reading) => ({ exit: 0 as const, stdout: json ? reading.json : reading.human, stderr: Buffer.alloc(0) }),
    (reason: unknown) => newCommandFailure("run.show", runShowFailure(reason), json),
  );
}

/** `bot run record RUN --raw`, reproducing `run-record-command.ts`. The command streams the
 *  snapshot to stdout; this holds it in memory, bounded by the record file itself. */
export async function runRecordReading(home: string, run: string): Promise<CommandResult> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const exit = await inspectRawShow(home, run, undefined, () => new Writable({
    write: (bytes: Buffer, _encoding, done) => { stdout.push(Buffer.from(bytes)); done(); },
  }), (bytes) => { stderr.push(Buffer.from(bytes)); });
  return { exit, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}
