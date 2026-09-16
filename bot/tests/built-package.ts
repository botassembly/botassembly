import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const BOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function builtPackage(prefix: string): Promise<{ packageRoot: string; remove: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const packageRoot = join(root, "bot");
  try {
    await mkdir(packageRoot);
    for (const name of ["src", "scripts", "package.json", "tsconfig.json", "tsconfig.package.json"]) {
      await cp(join(BOT, name), join(packageRoot, name), { recursive: true });
    }
    await symlink(join(BOT, "node_modules"), join(packageRoot, "node_modules"), "dir");
    await run(process.execPath, [join(packageRoot, "scripts", "build-package.mjs")], {
      cwd: packageRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    });
    return { packageRoot, remove: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
