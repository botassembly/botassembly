import { mkdir } from "node:fs/promises";
import { initializeInstallation, type InstallationDependencies } from "../src/home-installation.ts";
import { errorCode } from "../src/model.ts";

const home = process.argv[2];
const role = process.argv[3];
if (home === undefined || process.send === undefined) process.exit(2);

const released = new Promise<void>((resolve) => { process.once("message", () => { resolve(); }); });
function write(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise<void>((resolve, reject) => { stream.write(value, (reason) => {
    if (reason !== null && reason !== undefined) reject(reason);
    else resolve();
  }); });
}

function systemCodes(reason: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = reason;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    const code = errorCode(current);
    if (code !== undefined) codes.push(code);
    current = typeof current === "object" && current !== null ? Reflect.get(current, "cause") : undefined;
  }
  return codes;
}

function diagnosticProperty(reason: object, key: string): string | number | boolean | undefined {
  const value = Reflect.get(reason, key) as unknown;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function controlledDependencies(): InstallationDependencies {
  if (role === "winner") return { interrupt: async (phase) => {
    if (phase === "after-link") { process.send?.("ready"); await released; }
  } };
  if (role === "loser") return { afterRecordOpenObservation: async () => {
    process.send?.("ready"); await released;
  } };
  return { createHome: async (path) => {
    process.send?.("ready");
    await released;
    await mkdir(path, { mode: 0o700 });
  } };
}

await initializeInstallation(home, controlledDependencies()).then(
  async (result) => write(process.stdout, `${JSON.stringify(result)}\n`),
  async (reason: unknown) => {
    const held = typeof reason === "object" && reason !== null ? reason : {};
    await write(process.stderr, `${JSON.stringify({
      name: reason instanceof Error ? reason.name : typeof reason,
      causeCode: diagnosticProperty(held, "causeCode"),
      exit: diagnosticProperty(held, "exit"),
      published: diagnosticProperty(held, "published"),
      systemCodes: systemCodes(reason),
    })}\n`);
    process.exitCode = 1;
  },
);
