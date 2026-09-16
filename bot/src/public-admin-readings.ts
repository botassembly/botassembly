// The package's read-only admin-reading door (ticket 0295). Every function
// here builds the command's own words and drives the command's own handler
// through the collecting boundary, so it returns the exact stdout, stderr, and
// exit code the command writes. It holds no rule of its own.
import { assemblyCheckCommand } from "./assembly-check-command.ts";
import { assemblyListCommand } from "./assembly-list-command.ts";
import { capabilitiesCommand } from "./capabilities.ts";
import type { AssemblyListField } from "./cli-contract.ts";
import { commandReading, flag, valued } from "./command-reading.ts";
import { homeBusyCommand } from "./home-busy-command.ts";
import { homeCommand } from "./home-command.ts";
import { intelligenceListCommand } from "./intelligence-list-command.ts";
import type { CommandResult } from "./new-command-result.ts";

/** `bot capabilities [--json]`. The handler receives two arguments, so its own
 *  default source-identity resolver applies, exactly as the command's does. The
 *  boundary carries no working directory and no environment: it reads neither. */
export function capabilitiesReading(json: boolean): Promise<CommandResult<number>> {
  return commandReading(capabilitiesCommand, flag("--json", json), "", {});
}

/** `bot home show --home HOME [--json]`. The handler resolves the home against
 *  the supplied working directory, so a relative home follows the caller. */
export function homeShowReading(home: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult<number>> {
  return commandReading(homeCommand, ["--home", home, ...flag("--json", json)], cwd, env);
}

/** `bot home busy DIR --home HOME [--json|--quiet]`. Quiet mode writes no bytes
 *  and answers with its exit code alone. */
export function homeBusyReading(
  home: string, directory: string, options: { json?: boolean; quiet?: boolean },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [directory, "--home", home, ...flag("--json", options.json), ...flag("--quiet", options.quiet)];
  return commandReading(homeBusyCommand, args, cwd, env);
}

/** `bot assembly check TARGET [REQUEST] --home HOME [options]`. Each slot is
 *  spelled `--NAME VALUE`, the dynamic option the contract declares. */
export function assemblyCheckReading(
  home: string, target: string, request: string | undefined,
  options: {
    json?: boolean; limit?: number; after?: string; in?: string; intelligence?: string;
    localContext?: "ignore" | "announce" | "use"; retries?: number; timeout?: number;
    slots?: Readonly<Record<string, string>>;
  },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const slots = Object.entries(options.slots ?? {}).flatMap(([name, value]) => [`--${name}`, value]);
  const args = [
    target, ...(request === undefined ? [] : [request]), "--home", home,
    ...flag("--json", options.json), ...valued("--limit", options.limit), ...valued("--after", options.after),
    ...valued("--in", options.in), ...valued("--intelligence", options.intelligence),
    ...valued("--local-context", options.localContext), ...valued("--retries", options.retries),
    ...valued("--timeout", options.timeout), ...slots,
  ];
  return commandReading(assemblyCheckCommand, args, cwd, env);
}

/** `bot assembly list --home HOME [options]`. `--fields` is one comma-separated
 *  value, the spelling the contract declares. */
export function assemblyListReading(
  home: string,
  options: { json?: boolean; count?: boolean; fields?: readonly AssemblyListField[]; limit?: number; after?: string },
  cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  const args = [
    "--home", home, ...flag("--json", options.json), ...flag("--count", options.count),
    ...valued("--fields", options.fields === undefined ? undefined : options.fields.join(",")),
    ...valued("--limit", options.limit), ...valued("--after", options.after),
  ];
  return commandReading(assemblyListCommand, args, cwd, env);
}

/** `bot intelligence list --home HOME [--json]`. The handler reads the home's
 *  `config.yaml` alone, so the reading loads no model runtime. */
export function intelligenceListReading(
  home: string, json: boolean, cwd: string, env: NodeJS.ProcessEnv,
): Promise<CommandResult<number>> {
  return commandReading(intelligenceListCommand, [...flag("--json", json), "--home", home], cwd, env);
}
