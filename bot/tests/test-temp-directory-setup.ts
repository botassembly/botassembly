import { mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

const TEMPORARY_VARIABLES = ["TMPDIR", "TMP", "TEMP"] as const;

export default async function setup(): Promise<() => Promise<void>> {
  const checkout = await realpath(process.cwd());
  const temporary = await mkdtemp(join(checkout, ".bot-test-"));
  const inherited = new Map(TEMPORARY_VARIABLES.map((name) => [name, process.env[name]]));

  for (const name of TEMPORARY_VARIABLES) process.env[name] = temporary;

  return async () => {
    for (const name of TEMPORARY_VARIABLES) {
      const value = inherited.get(name);
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
    await rm(temporary, { recursive: true, force: true });
  };
}
