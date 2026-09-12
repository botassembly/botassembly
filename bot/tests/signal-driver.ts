// Ticket 0063 item 2 — the child half of the signal leg. Run as a REAL node
// child process by cli-signal-boundary.test.ts, which then signals it.
//
// A signal handler can only be witnessed across a process boundary: `main()`
// installs one on `process` (run.ts), and an in-process test cannot deliver a
// signal to itself without also delivering it to vitest. So this is the
// smallest thing that is a real `bot run` — the real gating, the real lock, the
// real record — with only the model replaced.
//
// The model is replaced by a stream that NEVER settles. That is what makes the
// leg deterministic rather than timed: the run parks inside the agent's first
// turn and cannot leave it on its own, so there is no window to hit and nothing
// to sleep for. The marker file is written from inside `stream()`, which
// `turns.ts` calls only AFTER it has registered the abort listener that the
// signal will fire — so a parent that has seen the marker knows the child is in
// the state it means to interrupt.
import { createAssistantMessageEventStream, createModels, fauxProvider, type Provider } from "@earendil-works/pi-ai";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main, type CliBoundary } from "../src/cli.ts";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
}

const marker = required("BOT_SIGNAL_MARKER");
const cwd = required("BOT_SIGNAL_CWD");

const base = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
const stream = (): ReturnType<Provider["stream"]> => {
  // Announce, optionally stop this process's event loop, then hang. The stall
  // lets the lock-compromise test reproduce a missed heartbeat in the holder
  // rather than approximating it by deleting a healthy lock from outside.
  writeFileSync(marker, "the agent's first turn has begun");
  const stall = Number(process.env["BOT_SIGNAL_STALL_MS"] ?? "0");
  if (stall > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, stall);
  return createAssistantMessageEventStream();
};
const models = createModels();
models.setProvider({ ...base.provider, stream, streamSimple: stream });

const boundary: CliBoundary = {
  cwd,
  env: process.env,
  stdinIsTTY: true,
  stderrIsTTY: false,
  readStdin: () => Promise.resolve(Buffer.alloc(0)),
  stdout: () => undefined,
  stderr: (bytes) => { process.stderr.write(bytes); },
  clock: {
    milliseconds: () => performance.now(),
    timestamp: () => new Date().toISOString(),
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  },
  models,
};

try {
  // `main` returns only after run.ts's `finally` has released the lock and
  // after `executeRun` has awaited the record's own drain, so exiting here
  // cannot truncate either of the two things the parent asserts.
  const code = await main(["run", "start", "review/main", "the request"], boundary);

  // Read the lock HERE, from inside the still-running process, and report it.
  //
  // This exists because the parent's own `existsSync` check cannot see the
  // difference: `proper-lockfile` removes held locks on process exit too, so a
  // runtime that never released anything still leaves no lock behind for the
  // parent to find. Measured — deleting `release()` from run.ts's `finally`
  // leaves the whole suite green. Asking before the process exits is what
  // separates the run releasing its lock from the process falling over and
  // taking the lock with it.
  const runs = join(required("BOT_HOME"), "runs");
  const held = readdirSync(runs)
    .filter((entry) => !entry.endsWith(".lock"))
    .some((name) => existsSync(join(runs, `${name}.lock`)));
  writeFileSync(required("BOT_SIGNAL_LOCK"), held ? "held" : "released");

  process.exit(code);
} catch (reason: unknown) {
  process.stderr.write(`driver threw: ${String(reason)}\n`);
  process.exit(99);
}
