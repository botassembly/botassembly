// The process boundary: run `src/cli.ts` as a real child of this test and
// collect what it wrote. One copy, because both callers (cli-exit,
// inspection-conformance) had grown byte-identical versions of it.
//
// On the budgets. A child here is a cold `node` that parses and type-strips
// the whole CLI module graph before it does any work: ~0.45s of CPU on an idle
// machine, ~1.3s when sixteen of them run at once, and the suite already runs
// 42 test files across as many forks. An execve tracer can make the same work
// take far longer without changing its result, so CHILD_MS is 120s and the
// test-side budget that must sit above it is BOUNDARY_MS at 180s. That order
// matters and was previously inverted: with execFile's own 10s guard hiding
// behind vitest's 5s default,
// the inner guard could never fire, so a genuinely hung child reported
// "Test timed out in 5000ms" instead of naming the child that hung. The thing
// these guards exist to catch (ticket 0017 F4: a CLI that never exits) never
// completes at all, so a larger finite budget costs only the wait.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Pass as a test's timeout argument wherever `piped` is awaited. */
export const BOUNDARY_MS = 180_000;
export const CHILD_MS = 120_000;

export const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

export interface Piped {
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

/** The cap is a harness backstop, not an assertion: callers assert the bytes
 *  they expect, and 8 MiB is deliberately piped by one of them. */
const MAX_BUFFER = 64 * 1024 * 1024;

export interface Ended { code: number | null; signal: NodeJS.Signals | null; stdout: Buffer; stderr: Buffer }

/**
 * The same boundary as `piped`, with the child kept in hand so a test can
 * signal it (ticket 0063 item 2). `spawn` rather than `execFile` because what
 * is under test is what the child does about a signal, and execFile reports a
 * child that DIED of one and a child that HANDLED one the same unhelpful way.
 *
 * The budgets are `piped`'s, not new ones: CHILD_MS is the same guard, spelled
 * out here because `spawn` has none of its own, and it must stay nested inside
 * the BOUNDARY_MS a caller passes as its test timeout. A child that ignores the
 * signal is killed outright and resolves with `signal: "SIGKILL"`, so the
 * caller's assertion names the cause instead of the suite reporting a timeout.
 *
 * stdout is collected rather than merely drained (ticket 0087): a child that
 * blocks on a FIFO cannot be reached by `piped`'s SIGTERM, so the only guard
 * that ends it is the SIGKILL here — and the listing it should have printed is
 * the thing under test, so it has to come back.
 */
export function spawned(args: string[], env: NodeJS.ProcessEnv): { child: ChildProcess; ended: Promise<Ended> } {
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const errors: Buffer[] = [];
  const output: Buffer[] = [];
  child.stderr.on("data", (bytes: Buffer) => { errors.push(bytes); });
  child.stdout.on("data", (bytes: Buffer) => { output.push(bytes); });
  const ended = new Promise<Ended>((resolve) => {
    const guard = setTimeout(() => { child.kill("SIGKILL"); }, CHILD_MS);
    child.on("close", (code, signal) => {
      clearTimeout(guard);
      resolve({ code, signal, stdout: Buffer.concat(output), stderr: Buffer.concat(errors) });
    });
  });
  return { child, ended };
}

export function piped(args: string[], env: NodeJS.ProcessEnv): Promise<Piped> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath, args,
      { env, timeout: CHILD_MS, maxBuffer: MAX_BUFFER, encoding: "buffer" },
      (error, stdout, stderr) => {
        if (error !== null && error.code === undefined) { reject(error instanceof Error ? error : new Error("execFile failed")); return; }
        resolve({ code: typeof error?.code === "number" ? error.code : error === null ? 0 : null, stdout, stderr });
      },
    );
  });
}
