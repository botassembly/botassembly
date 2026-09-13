// The eight-rung option ladder (invocation.md), shared by check and run.
import {
  bytewise,
  type Assembly,
  type AuthoredOptions,
  type Flow,
  type HomeConfig,
  type Invocation,
  type Node,
  type OptionName,
  type OptionValue,
} from "./model.ts";

type From = "command" | "task" | "stage" | "container" | "flow" | "assembly" | "home" | "default";
interface ResolvedValue {
  value: OptionValue;
  from: From;
}
type ResolvedOptionName = OptionName | "provider" | "model" | "reasoning";
export type ResolvedOptions = Partial<Record<ResolvedOptionName, ResolvedValue>>;

export interface Resolution {
  options: ResolvedOptions;
  intelligenceTrouble?: string;
}

export interface OptionContext {
  invocation: Invocation;
  assembly: Assembly;
  flow: Flow;
  home: HomeConfig;
}

/** The built-in rung contains only non-model defaults. */
const DEFAULTS: AuthoredOptions = { timeout: 3600, retries: 2, "local-context": "ignore" };

type Rung = [from: From, options: AuthoredOptions];

function ladder(
  context: OptionContext, local: AuthoredOptions, localFrom: "stage" | "container", containers: AuthoredOptions[],
): Rung[] {
  return [
    ["command", context.invocation.commandOptions],
    ["task", context.invocation.taskOptions],
    [localFrom, local],
    ...containers.map((held): Rung => ["container", held]),
    ["flow", context.flow.options],
    ["assembly", context.assembly.options],
    ["home", context.home.options],
    ["default", DEFAULTS],
  ];
}

function held(rungs: readonly Rung[], name: OptionName): ResolvedValue | undefined {
  for (const [from, options] of rungs) {
    const value = options[name];
    if (value !== undefined) return { value, from };
  }
  return undefined;
}

function looseOptions(rungs: readonly Rung[]): ResolvedOptions {
  const options: ResolvedOptions = {};
  for (const key of ["timeout", "retries", "local-context"] as const) {
    const value = held(rungs, key);
    if (value !== undefined) options[key] = value;
  }
  return options;
}

function bundleOptions(name: string, bundle: HomeConfig["intelligences"][string], from: From): ResolvedOptions {
  return {
    intelligence: { value: name, from },
    ...(bundle.provider === undefined ? {} : { provider: { value: bundle.provider, from } }),
    model: { value: bundle.model, from },
    reasoning: { value: bundle.reasoning, from },
  };
}

function intelligence(
  rungs: readonly Rung[], table: HomeConfig["intelligences"],
): { options?: ResolvedOptions; trouble?: string } {
  const spoken = rungs.find(([, options]) => options.intelligence !== undefined);
  const from = spoken?.[0] ?? "home";
  const name = String(spoken?.[1].intelligence ?? "default");
  const bundle = table[name];
  if (bundle === undefined) {
    const known = Object.keys(table).sort(bytewise);
    return { trouble: `Define an intelligence named ${name} in the home configuration${known.length === 0 ? "" : `, or name one it defines: ${known.join(", ")}`}.` };
  }
  return { options: { ...bundleOptions(name, bundle, from), ...looseOptions(rungs) } };
}

export function resolvedOptions(
  context: OptionContext,
  local: AuthoredOptions,
  localFrom: "stage" | "container",
  containers: AuthoredOptions[],
): Resolution {
  const rungs = ladder(context, local, localFrom, containers);
  const named = intelligence(rungs, context.home.intelligences);
  return named.trouble === undefined
    ? { options: named.options ?? {} }
    : { options: looseOptions(rungs), intelligenceTrouble: named.trouble };
}

/** Resolve one executing node through the same eight-rung path as check output. */
export function resolveNodeOptions(
  invocation: Invocation,
  assembly: Assembly,
  flow: Flow,
  home: HomeConfig,
  node: Node,
  containers: readonly AuthoredOptions[],
): Resolution {
  const context: OptionContext = { invocation, assembly, flow, home };
  const localFrom = node.kind === "STAGE" ? "stage" : "container";
  return resolvedOptions(context, node.options, localFrom, [...containers]);
}

// A subflow child resolves from its own sentinels, the home, and the defaults
// (subflow.md): the parent invocation's command and task rungs stop at the
// boundary. The home and workdir facts are not option rungs and still cross.
export function childInvocation(invocation: Invocation): Invocation {
  return { ...invocation, commandOptions: {}, taskOptions: {} };
}
