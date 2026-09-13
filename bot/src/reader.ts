import { resolve as resolvePath } from "node:path";
import { readAssembly } from "./assembly.ts";
import {
  parseInvocation,
  parseInvocationTokens,
  parseRunInvocationTokens,
  readHome,
  resolveTarget,
  validateInvocationPaths,
} from "./invocation.ts";
import { refusalLines, renderAssemblyAgent, renderFlow, validateSuppliedSlots } from "./check.ts";
import { fault, type Assembly, type Flow, type HomeConfig, type Invocation } from "./model.ts";
import type { ExitCode, Refusal } from "./spine.ts";

/** What `bot check --json` produces: an exit code and one JSON line per object. */
export interface CheckResult {
  exitCode: ExitCode;
  lines: string[];
  faults?: Refusal[];
}

export type InvocationRead =
  | { status: "refused"; result: CheckResult }
  | {
    status: "accepted";
    result: CheckResult;
    invocation: Invocation;
    home: HomeConfig;
    assembly: Assembly;
    flow?: Flow;
  };

/** A read that produced an assembly: what a run then executes, and the shape
 *  both halves of the runner (run.ts, machinery.ts) take as their subject. */
export type Accepted = Extract<InvocationRead, { status: "accepted" }>;

/** The invocation resolved as far as a tree on disk, before anything in that
 *  tree is read. A run stops here, copies the assembly, and reads the copy
 *  (ADR 0016); `bot check` walks straight on into the tree it was pointed at. */
export type InvocationResolve =
  | { status: "refused"; result: CheckResult }
  | { status: "resolved"; invocation: Invocation; home: HomeConfig; assemblyRoot: string; flow?: string };

/**
 * Run the check phase for one invocation line, resolved relative to `dir`.
 * Refusals exit 2 with one `{code, path, message}` line per fault; a sound
 * assembly exits 0 with the resolved-structure lines.
 */
function refusal(invocation: Invocation, extra: typeof invocation.faults): CheckResult {
  const unique = new Map<string, (typeof extra)[number]>();
  for (const held of [...invocation.faults, ...extra]) unique.set(`${held.code}\0${held.path}`, held);
  const faults = [...unique.values()];
  return { exitCode: 2, lines: refusalLines(faults), faults };
}

function resolve(invocation: Invocation, dir: string): InvocationResolve {
  const home = readHome(invocation, dir);
  validateInvocationPaths(invocation, dir);
  const target = resolveTarget(invocation, dir);
  if (target.assemblyRoot === undefined) return { status: "refused", result: refusal(invocation, target.faults) };
  return {
    status: "resolved", invocation, home, assemblyRoot: target.assemblyRoot,
    ...(target.flow === undefined ? {} : { flow: target.flow }),
  };
}

/** Read one assembly tree for one invocation: the live tree for `bot check`,
 *  the run's own capture for a run. */
export function readAssemblyTree(
  target: Extract<InvocationResolve, { status: "resolved" }>, root: string, dir: string, env: NodeJS.ProcessEnv,
): InvocationRead {
  const { invocation, home } = target;
  const assembly = readAssembly(root, env);
  if (assembly.faults.length > 0) return { status: "refused", result: refusal(invocation, assembly.faults) };
  validateSuppliedSlots(invocation, assembly, dir);
  const faults: Refusal[] = [];
  const workdir = resolvePath(dir, invocation.workdir ?? ".");
  let lines: string[];
  let flow: Flow | undefined;
  if (target.flow === undefined) {
    lines = renderAssemblyAgent(invocation, assembly, home, faults, workdir);
  } else {
    flow = assembly.flows.get(target.flow);
    if (flow === undefined) {
      fault(faults, "flow-unknown", `flows/${target.flow}`, "Name a flow that exists.");
      lines = [];
    } else {
      lines = renderFlow(invocation, assembly, flow, home, faults, workdir);
    }
  }
  if (invocation.faults.length > 0 || faults.length > 0) {
    return { status: "refused", result: refusal(invocation, faults) };
  }
  const result: CheckResult = { exitCode: 0, lines };
  return {
    status: "accepted", result, invocation, home, assembly,
    ...(flow === undefined ? {} : { flow }),
  };
}

function read(invocation: Invocation, dir: string, env: NodeJS.ProcessEnv): InvocationRead {
  const target = resolve(invocation, dir);
  return target.status === "refused" ? target : readAssemblyTree(target, target.assemblyRoot, dir, env);
}

export function readInvocationTokens(tokens: string[], dir: string, env: NodeJS.ProcessEnv, selectedHome?: string): InvocationRead {
  const selectedEnv = selectedHome === undefined ? env : { ...env, BOT_HOME: selectedHome }; return read(parseInvocationTokens(tokens, dir, selectedEnv), dir, env);
}

export function resolveInvocationTokens(tokens: string[], dir: string, env: NodeJS.ProcessEnv): InvocationResolve {
  return resolve(parseRunInvocationTokens(tokens, dir, env), dir);
}

export function check(source: string, dir: string, env: NodeJS.ProcessEnv): CheckResult {
  return read(parseInvocation(source, dir, env), dir, env).result;
}
