import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";

const destination = process.env["BOT_MODULE_LOAD_RECORD"];
if (destination === undefined) throw new Error("BOT_MODULE_LOAD_RECORD is required");

const loaded = new Set();
registerHooks({
  load(url, context, nextLoad) {
    loaded.add(url);
    return nextLoad(url, context);
  },
});

process.on("exit", () => {
  writeFileSync(destination, `${JSON.stringify([...loaded])}\n`);
});
