// Ticket 0295. One collecting boundary drives a read-only command handler
// inside the importer's process. The handler keeps its own fault rule, its own
// rendering, and its own exit code, so an exported reading hands back the
// command's bytes without copying a private rule into a second place.
import { Writable } from "node:stream";
import type { CommandResult } from "./new-command-result.ts";

interface ReadingBoundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  rawStdout(): Writable;
  stderr(bytes: string | Uint8Array): void;
}

type ReadingHandler = (args: string[], boundary: ReadingBoundary) => number | Promise<number>;

/** A boolean option is its own word or no word at all. */
export function flag(name: string, held: boolean | undefined): string[] {
  return held === true ? [name] : [];
}

/** A valued option is the option word followed by its value word. */
export function valued(name: string, held: string | number | undefined): string[] {
  return held === undefined ? [] : [name, String(held)];
}

function held(bytes: string | Uint8Array): Buffer {
  return typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
}

/** Run one read-only handler over a boundary that collects both streams. The
 *  raw destination pushes into the same stdout array the ordinary writes use,
 *  so a command that mixes them keeps its own order. */
export async function commandReading(
  handler: ReadingHandler, args: string[], cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const exit = await handler(args, {
    cwd, env,
    stdout: (bytes) => { stdout.push(held(bytes)); },
    rawStdout: () => new Writable({
      write: (bytes: Buffer, _encoding, done) => { stdout.push(Buffer.from(bytes)); done(); },
    }),
    stderr: (bytes) => { stderr.push(held(bytes)); },
  });
  return { exit, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}
