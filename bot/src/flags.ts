import { resolveHome } from "./invocation.ts";

export function withoutFlag(args: readonly string[], flag: string): { args: string[]; found: boolean } {
  return { args: args.filter((value) => value !== flag), found: args.includes(flag) };
}

function takeValue(args: string[], name: string): { args: string[]; value?: string; missing: boolean } {
  const index = args.indexOf(name);
  if (index < 0) return { args, missing: false };
  const next = args[index + 1];
  const value = next?.startsWith("--") === false ? next : undefined;
  const rest = args.filter((_, at) => at !== index && (value === undefined || at !== index + 1));
  return { args: rest, ...(value === undefined ? {} : { value }), missing: value === undefined };
}

export function runOnlyOptions(args: string[]): { args: string[]; idFile?: string; script?: string; missing?: string } {
  const idFile = takeValue(args, "--id-file");
  if (idFile.missing) return { args: idFile.args, missing: "--id-file" };
  const script = takeValue(idFile.args, "--script");
  if (script.missing) return { args: script.args, missing: "--script" };
  return {
    args: script.args,
    ...(idFile.value === undefined ? {} : { idFile: idFile.value }),
    ...(script.value === undefined ? {} : { script: script.value }),
  };
}

export function takeHome(args: string[], cwd: string, env: NodeJS.ProcessEnv): { args: string[]; home: string | undefined } {
  const index = args.indexOf("--home");
  const next = index < 0 ? undefined : args[index + 1];
  const raw = next?.startsWith("--") === false ? next : undefined;
  const home = raw === undefined && index >= 0 ? undefined : resolveHome(cwd, raw, env);
  return { args: args.filter((_, at) => at !== index && (raw === undefined || at !== index + 1)), home };
}
