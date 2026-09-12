import { Writable } from "node:stream";

/** Give the raw pipeline a non-closing stream for standard output. */
export function processRawStdout(): Writable {
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
  let waiting = 2;
  const flushed = (): void => {
    waiting -= 1;
    if (waiting === 0) process.exit(code);
  };
  process.stdout.write("", flushed);
  process.stderr.write("", flushed);
}
