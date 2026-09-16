import { execFile } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const declarations = join(root, "types");
const runtime = join(root, "dist");
const entries = new Set([
  "public-admin-readings.d.ts", "public-inspection.d.ts", "public-mutation-readings.d.ts",
  "one-run.d.ts", "record-lines.d.ts", "public-run-readings.d.ts", "session.d.ts",
]);
const nodeReference = "/// <reference path=\"../node_modules/@types/node/index.d.ts\" />\n";

async function declarationFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await declarationFiles(path));
    else if (entry.name.endsWith(".d.ts")) found.push(path);
  }
  return found;
}

await Promise.all([rm(runtime, { recursive: true, force: true }), rm(declarations, { recursive: true, force: true })]);
await run(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.package.json"], { cwd: root });
for (const path of await declarationFiles(declarations)) {
  let source = await readFile(path, "utf8");
  source = source.replaceAll(/(["']\.\.?\/[^"']*?)\.ts(["'])/gu, "$1.js$2");
  if (entries.has(relative(declarations, path))) source = nodeReference + source;
  await writeFile(path, source);
}
