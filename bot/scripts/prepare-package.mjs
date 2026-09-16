import { copyFile, readFile, rename, rm, stat, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await import("./build-package.mjs");

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (!Array.isArray(rootManifest.bundleDependencies)) throw new Error("bundleDependencies must name the packaged dependency closure");

async function installedPackage(owner, name) {
  let directory = owner;
  while (directory.startsWith(root)) {
    const candidate = join(directory, "node_modules", name);
    if (await stat(join(candidate, "package.json")).then(() => true, () => false)) return candidate;
    if (directory === root) break;
    directory = dirname(directory);
  }
  return undefined;
}

async function breakPackageCrossingHardlink(executable) {
  const before = await stat(executable);
  if (before.nlink <= 1) return;
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
    throw new Error("prepare changed a bundled esbuild executable while breaking its package-crossing hardlink");
  }
}

const found = new Set();
const pending = rootManifest.bundleDependencies.map((name) => ({ owner: root, name, optional: false }));
while (pending.length > 0) {
  const next = pending.shift();
  const packageRoot = await installedPackage(next.owner, next.name);
  if (packageRoot === undefined) {
    if (next.optional) continue;
    throw new Error(`missing bundled dependency ${next.name}`);
  }
  if (found.has(packageRoot)) continue;
  found.add(packageRoot);
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (manifest.name === "esbuild") await breakPackageCrossingHardlink(join(packageRoot, "bin", "esbuild"));
  const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));
  for (const name of new Set([...Object.keys(manifest.dependencies ?? {}), ...optional])) {
    pending.push({ owner: packageRoot, name, optional: optional.has(name) });
  }
}
