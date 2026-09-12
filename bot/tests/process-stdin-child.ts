import { processBoundary } from "../src/cli.ts";

const boundary = processBoundary();

process.stdout.write("BOT_STDIN_READY\n", () => {
  boundary.readStdin().then((bytes) => {
    process.stdout.write(`BOT_STDIN_BYTES=${bytes.toString("base64")}\n`);
  }).catch((reason: unknown) => {
    process.stderr.write(`${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
    process.exitCode = 1;
  });
});
