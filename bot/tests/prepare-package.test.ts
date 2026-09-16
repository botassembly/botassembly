import { execFile } from "node:child_process";
import { chmod, cp, link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const run = promisify(execFile);
const BOT = join(import.meta.dirname, "..");
const pi = join("node_modules", "@earendil-works", "pi-coding-agent");

test.each(["nested", "hoisted"])("prepare discovers and preserves a %s bundled esbuild launcher while breaking its hardlink", async (topology) => {
  const root = await mkdtemp(join(tmpdir(), "bot-prepare-package-"));
  try {
    const scripts = join(root, "scripts"), packageBase = topology === "nested" ? pi : "";
    const chord = join(root, packageBase, "node_modules", "@earendil-works", "chord");
    const esbuild = join(root, packageBase, "node_modules", "esbuild");
    const executable = join(esbuild, "bin", "esbuild"), source = join(root, "platform-esbuild");
    await mkdir(scripts, { recursive: true });
    await mkdir(dirname(executable), { recursive: true });
    await mkdir(join(root, pi), { recursive: true });
    await mkdir(chord, { recursive: true });
    await cp(join(BOT, "scripts", "prepare-package.mjs"), join(scripts, "prepare-package.mjs"));
    await writeFile(join(scripts, "build-package.mjs"), "export {};\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ bundleDependencies: ["@earendil-works/pi-coding-agent"] }));
    await writeFile(join(root, pi, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", dependencies: { "@earendil-works/chord": "1.0.0" } }));
    await writeFile(join(chord, "package.json"), JSON.stringify({ name: "@earendil-works/chord", dependencies: { esbuild: "1.0.0" } }));
    await writeFile(join(esbuild, "package.json"), JSON.stringify({ name: "esbuild", version: "1.0.0" }));
    const bytes = Buffer.from("fixture esbuild executable\n");
    await writeFile(source, bytes);
    await chmod(source, 0o751);
    await link(source, executable);
    const before = await stat(executable);
    expect(before.nlink).toBeGreaterThan(1);

    await run(process.execPath, [join(scripts, "prepare-package.mjs")], { cwd: root });

    const after = await stat(executable);
    expect(await readFile(executable)).toEqual(bytes);
    expect(after.mode).toBe(before.mode);
    expect(after.nlink).toBe(1);
    expect(await readFile(source)).toEqual(bytes);
    expect((await stat(source)).nlink).toBe(1);
    expect(await readdir(dirname(executable))).toEqual(["esbuild"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
