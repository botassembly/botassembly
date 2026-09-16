import { copyFile, readFile, rename, rm, stat, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await import("./build-package.mjs");

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "node_modules", "esbuild", "bin", "esbuild");
const before = await stat(executable);
if (before.nlink > 1) {
  const temporary = `${executable}.bot-prepare-${process.pid}`;
  const bytes = await readFile(executable);
  try {
    await copyFile(executable, temporary);
    await chmod(temporary, before.mode & 0o777);
    await rename(temporary, executable);
  } finally {
    await rm(temporary, { force: true });
  }
  const after = await stat(executable);
  if (after.nlink !== 1 || after.mode !== before.mode || !(await readFile(executable)).equals(bytes)) {
    throw new Error("prepare changed the bundled esbuild executable while breaking its package-crossing hardlink");
  }
}
