// The package's read-only command-reading door (ticket 0291). Every function
// here returns the exact bytes its command writes, faults included. It writes
// no second copy of a document and holds no rule of its own.
import { Writable } from "node:stream";
import { commandReading, flag, valued } from "./command-reading.ts";
import { scratchRoot } from "./invocation.ts";
import { newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { inspectRawShow } from "./raw-record.ts";
import { runCheckCommand } from "./run-check-command.ts";
import { runChecklistCommand } from "./run-checklist-command.ts";
import { runEventsCommand } from "./run-events-command.ts";
import { runOutputCommand, runRequestCommand } from "./run-output-command.ts";
import { runSearchCommand } from "./run-search-command.ts";
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

/** `bot run check RUN CHECK [--json|--raw] [--file F] [--stage S --retry N] [--repeat N] --home HOME`. */
export function runCheckReading(
  home: string, run: string, check: string,
  options: { json?: boolean; raw?: boolean; file?: string; stage?: string; retry?: number; repeat?: number },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [
    run, check, ...flag("--json", options.json), ...flag("--raw", options.raw),
    ...valued("--file", options.file), ...valued("--stage", options.stage),
    ...valued("--retry", options.retry), ...valued("--repeat", options.repeat), "--home", home,
  ];
  return commandReading(runCheckCommand, args, cwd, env);
}

/** `bot run checklist RUN [--json] [--stage S --retry N] [--repeat N] --home HOME`. */
export function runChecklistReading(
  home: string, run: string, options: { json?: boolean; stage?: string; retry?: number; repeat?: number },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [
    run, ...flag("--json", options.json), ...valued("--stage", options.stage),
    ...valued("--retry", options.retry), ...valued("--repeat", options.repeat), "--home", home,
  ];
  return commandReading(runChecklistCommand, args, cwd, env);
}

/** `bot run events RUN [--json] [--child C] --home HOME`. */
export function runEventsReading(
  home: string, run: string, options: { json?: boolean; child?: string },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [run, ...flag("--json", options.json), ...valued("--child", options.child), "--home", home];
  return commandReading(runEventsCommand, args, cwd, env);
}

/** `bot run output RUN [STAGE] --raw --home HOME`. The command streams the sealed
 *  output; this holds it in memory, bounded by the sealed file itself. */
export function runOutputReading(
  home: string, run: string, stage: string | undefined, cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [run, ...(stage === undefined ? [] : [stage]), "--raw", "--home", home];
  return commandReading(runOutputCommand, args, cwd, env);
}

/** `bot run request RUN --raw --home HOME`. The retained request has no size
 *  limit, so the caller carries it in memory. */
export function runRequestReading(
  home: string, run: string, cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  return commandReading(runRequestCommand, [run, "--raw", "--home", home], cwd, env);
}

/** `bot run search [--limit N] [--after CURSOR] [--json] --home HOME -- QUERY`. */
export function runSearchReading(
  home: string, query: string, options: { json?: boolean; limit?: number; after?: string },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [
    ...flag("--json", options.json), ...valued("--limit", options.limit),
    ...valued("--after", options.after), "--home", home, "--", query,
  ];
  return commandReading(runSearchCommand, args, cwd, env);
}
