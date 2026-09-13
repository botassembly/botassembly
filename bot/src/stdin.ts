import type { Readable } from "node:stream";
import { REQUEST_MAX_BYTES } from "./request-limit.ts";

export class RequestTooLargeError extends Error {
  constructor() { super("The request exceeds the 4 MiB limit."); this.name = "RequestTooLargeError"; }
}

/** Read a byte stream through clean end-of-file. This stays below the CLI
 * boundary so request selection can avoid touching stdin when another request
 * source already won. */
export function readByteStream(input: Readable, maximum = REQUEST_MAX_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;

    const cleanup = (): void => {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
    };
    const onData = (chunk: Buffer): void => {
      const remaining = maximum + 1 - bytes;
      if (remaining > 0) {
        const retained = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
        chunks.push(retained);
        bytes += retained.length;
      }
      if (bytes > maximum) { cleanup(); reject(new RequestTooLargeError()); }
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
