import { mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

const TEMPORARY_VARIABLES = ["TMPDIR", "TMP", "TEMP"] as const;
const ISOLATED_PATHS = {
  HOME: "home",
  XDG_CONFIG_HOME: "config",
  XDG_DATA_HOME: "data",
  PI_CODING_AGENT_DIR: "pi-agent",
} as const;

export default async function setup(): Promise<() => Promise<void>> {
  const checkout = await realpath(process.cwd());
  const temporary = await mkdtemp(join(checkout, ".bot-test-"));
  const variables = [...TEMPORARY_VARIABLES, ...Object.keys(ISOLATED_PATHS)] as const;
  const inherited = new Map(variables.map((name) => [name, process.env[name]]));

  for (const name of TEMPORARY_VARIABLES) process.env[name] = temporary;
  for (const [name, path] of Object.entries(ISOLATED_PATHS)) process.env[name] = join(temporary, path);

  return async () => {
    for (const name of variables) {
      const value = inherited.get(name);
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
    await rm(temporary, { recursive: true, force: true });
  };
}
