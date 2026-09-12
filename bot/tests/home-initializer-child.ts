import { mkdir } from "node:fs/promises";
import { initializeInstallation } from "../src/home-installation.ts";

const home = process.argv[2];
if (home === undefined || process.send === undefined) process.exit(2);

const released = new Promise<void>((resolve) => { process.once("message", () => { resolve(); }); });
const result = await initializeInstallation(home, { createHome: async (path) => {
  process.send?.("ready");
  await released;
  await mkdir(path, { mode: 0o700 });
} });
process.stdout.write(`${JSON.stringify(result)}\n`);
