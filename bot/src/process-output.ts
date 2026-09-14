import { Writable } from "node:stream";

function errno(reason: unknown): string | undefined {
  return typeof reason === "object" && reason !== null && "code" in reason && typeof reason.code === "string" ? reason.code : undefined;
}

/** One ordered, callback-observed delivery queue for ordinary command output. */
export class OrdinaryOutput {
  private readonly queue: (string | Uint8Array)[] = [];
  private readonly waiters: ((failure: unknown) => void)[] = [];
  private active = false;
  private failure: unknown;
  private readonly destination: Writable;
  private completeActive: ((reason?: unknown) => void) | undefined;

  constructor(destination: Writable) {
    this.destination = destination;
    destination.on("error", (reason: unknown) => {
      this.failure ??= reason;
      this.completeActive?.(reason);
    });
  }

  write(bytes: string | Uint8Array): void {
    if (this.failure !== undefined) return;
    this.queue.push(bytes);
    this.pump();
  }

  settle(): Promise<unknown> {
    if (!this.active && this.queue.length === 0) return Promise.resolve(this.failure);
    return new Promise((resolve) => { this.waiters.push(resolve); });
  }

  private pump(): void {
    if (this.active) return;
    const bytes = this.queue.shift();
    if (bytes === undefined || this.failure !== undefined) { this.finishWaiters(); return; }
    this.active = true;
    let scheduled = false;
    const finish = (): void => {
      this.completeActive = undefined;
      this.active = false;
      if (this.failure !== undefined) this.queue.length = 0;
      this.pump();
    };
    const complete = (reason?: unknown): void => {
      if (reason !== undefined) this.failure ??= reason;
      if (!scheduled) { scheduled = true; setImmediate(finish); }
    };
    this.completeActive = complete;
    try {
      this.destination.write(bytes, (reason?: Error | null) => { complete(reason ?? undefined); });
    } catch (reason: unknown) {
      complete(reason);
    }
  }

  private finishWaiters(): void {
    for (const resolve of this.waiters.splice(0)) resolve(this.failure);
  }
}

let processOutput: OrdinaryOutput | undefined;
let rawProcessOutput = false;

/** The one ordinary queue, and the end of any raw latch an earlier pipeline set.
 *  The latch belongs to the raw command that took stdout; asking for ordinary
 *  output is the moment it stops (ticket 0281). The queue itself is built once,
 *  so the clearing cannot live in its construction. */
export function ordinaryProcessOutput(): OrdinaryOutput {
  rawProcessOutput = false;
  processOutput ??= new OrdinaryOutput(process.stdout);
  return processOutput;
}

export function stdoutDeliveryDiagnostic(failure: unknown): string {
  const code = errno(failure);
  const held = code !== undefined && /^[A-Z0-9_]{1,32}$/u.test(code) ? ` (${code})` : "";
  return `Bot failed during stdout delivery${held}.\n`;
}

export function deliveryExitCode(commandCode: number, failure: unknown): number {
  return commandCode === 0 && failure !== undefined && errno(failure) !== "EPIPE" ? 1 : commandCode;
}

/** Give the raw pipeline a non-closing stream for standard output. */
export function processRawStdout(): Writable {
  rawProcessOutput = true;
  const retained = process.stdout.listeners("error");
  const ownedError = (): void => undefined;
  process.stdout.removeAllListeners("error");
  process.stdout.on("error", ownedError);
  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    process.stdout.removeListener("error", ownedError);
    for (const listener of retained) process.stdout.on("error", listener);
  };
  return new Writable({
    write(bytes: Buffer, encoding, done) {
      process.stdout.write(bytes, encoding, done);
    },
    final(done) { restore(); done(); },
    destroy(error, done) {
      if (error === null) { restore(); done(null); return; }
      // Node emits the descriptor error after the write callback. Keep this adapter's listener through that turn.
      setImmediate(() => { restore(); done(error); });
    },
  });
}

/** Flush both process streams before the explicit exit needed after provider handles remain open. */
export function exitFlushed(code: number): void {
  process.exitCode = code;
  if (rawProcessOutput) {
    process.stderr.write("", () => { process.exit(code); });
    return;
  }
  const output = ordinaryProcessOutput();
  output.write("");
  void output.settle().then((failure) => {
    const pipe = errno(failure) === "EPIPE";
    const finalCode = deliveryExitCode(code, failure);
    if (failure !== undefined && !pipe) process.stderr.write(stdoutDeliveryDiagnostic(failure));
    process.stderr.write("", () => { process.exit(finalCode); });
  });
}
