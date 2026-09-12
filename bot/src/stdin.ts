import type { Readable } from "node:stream";

/** Read a byte stream through clean end-of-file. This stays below the CLI
 * boundary so request selection can avoid touching stdin when another request
 * source already won. */
export function readByteStream(input: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;

    const cleanup = (): void => {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
    };
    const onData = (chunk: Buffer): void => {
      chunks.push(chunk);
      bytes += chunk.length;
    };
    const onEnd = (): void => {
      cleanup();
      void Promise.resolve().then(() => Buffer.concat(chunks, bytes)).then(resolve, reject);
    };
    const onError = (reason: Error): void => {
      cleanup();
      reject(reason);
    };

    input.once("error", onError);
    input.once("end", onEnd);
    input.on("data", onData);
  });
}
