import { main, processBoundary } from "../src/cli.ts";

interface ReleaseMessage { type: "assembly-update-release" }

function releaseMessage(message: unknown): message is ReleaseMessage {
  return typeof message === "object" && message !== null && "type" in message && message.type === "assembly-update-release";
}

const timestamp = process.argv[2];
if (timestamp === undefined || process.send === undefined) process.exit(2);

const ordinary = processBoundary();
const exit = await main(["assembly", "update", "review"], {
  ...ordinary,
  clock: { ...ordinary.clock, timestamp: () => timestamp },
  afterAssemblyUpdateAside: async () => {
    const release = new Promise<void>((resolve) => {
      process.on("message", (message) => { if (releaseMessage(message)) resolve(); });
    });
    process.send?.({ type: "assembly-update-aside" });
    await release;
  },
});
process.exitCode = exit;
