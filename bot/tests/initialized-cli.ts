// Ticket 0055 changed every new run fixture's prerequisite. Existing runtime
// tests use this boundary to give their already-created homes the one durable
// record that production now requires. Identity-specific tests import cli.ts
// directly so they can exercise missing and invalid states.
import { chmod, lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { main as productionMain, type CliBoundary } from "../src/cli.ts";
import { resolveHome } from "../src/invocation.ts";
import { TEST_INSTALLATION_ID } from "./cli-boundary.ts";

export * from "../src/cli.ts";

function startsRun(argv: readonly string[]): boolean {
  if (argv[0] === "resume") return true;
  if (argv[0] !== "run") return false;
  return !["list", "output", "record"].includes(argv[1] ?? "");
}

async function existingHome(argv: readonly string[], boundary: CliBoundary): Promise<string | undefined> {
  const at = argv.indexOf("--home"), supplied = at < 0 ? undefined : argv[at + 1];
  const home = resolveHome(boundary.cwd, supplied, boundary.env);
  const held = await lstat(home).catch(() => undefined);
  return held?.isDirectory() === true ? home : undefined;
}

async function prepareLegacyFixture(argv: readonly string[], boundary: CliBoundary): Promise<void> {
  if (!startsRun(argv)) return;
  const home = await existingHome(argv, boundary);
  if (home === undefined) return;
  await chmod(home, 0o700);
  await writeFile(join(home, "installation.json"), `${JSON.stringify({
    schemaVersion: 1, kind: "bot.installation", data: { id: TEST_INSTALLATION_ID },
  })}\n`, { flag: "wx", mode: 0o600 }).catch((reason: unknown) => {
    if (typeof reason !== "object" || reason === null || !("code" in reason) || reason.code !== "EEXIST") throw reason;
  });
}

export async function main(argv: string[], boundary?: CliBoundary): Promise<number> {
  if (boundary !== undefined) await prepareLegacyFixture(argv, boundary);
  return productionMain(argv, boundary);
}
